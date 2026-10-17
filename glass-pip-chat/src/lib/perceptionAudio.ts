// Renderer side of perception audio: capture the microphone and system audio
// (loopback) as separate streams, find speech with an adaptive energy VAD, and
// stream each utterance to the main process as 16 kHz mono PCM.

export type CaptureSource = 'microphone' | 'system_audio';

export interface UtteranceSink {
  begin(source: CaptureSource, id: string): void;
  chunk(id: string, pcm: ArrayBuffer): void;
  end(source: CaptureSource, id: string): void;
  error(source: CaptureSource, message: string): void;
}

const TARGET_RATE = 16_000;
const FRAME_MS = 20;
const PRE_ROLL_MS = 300;
const START_MS = 120; // speech must last this long to open an utterance
const HANG_MS = 800; // silence that closes one
const MAX_MS = 25_000; // keep under the recognizer's per-utterance cap

/** AudioWorklet: forwards mono Float32 frames to the main thread. */
const WORKLET = `
class AllyTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('ally-tap', AllyTap);
`;

/** Float32 at `rate` → Int16 at 16 kHz (box-filter downsample; plenty for speech). */
export function toPcm16(input: Float32Array, rate: number): Int16Array {
  const ratio = rate / TARGET_RATE;
  const out = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

/**
 * Energy VAD with an adaptive noise floor. Feed 20 ms frames; it reports when an
 * utterance opens (with pre-roll), streams while open, and closes after silence.
 */
export class Vad {
  private floor = 0.004;
  private speechMs = 0;
  private silenceMs = 0;
  private openMs = 0;
  private preRoll: Int16Array[] = [];
  open = false;

  constructor(private onOpen: (preRoll: Int16Array[]) => void, private onFrame: (f: Int16Array) => void, private onClose: () => void) {}

  feed(frame: Int16Array, rms: number): void {
    const loud = rms > Math.max(this.floor * 3, 0.012);
    if (!this.open) {
      // Track the room's noise level while nobody talks
      if (!loud) this.floor = this.floor * 0.95 + rms * 0.05;
      this.preRoll.push(frame);
      while (this.preRoll.length * FRAME_MS > PRE_ROLL_MS) this.preRoll.shift();
      this.speechMs = loud ? this.speechMs + FRAME_MS : 0;
      if (this.speechMs >= START_MS) {
        this.open = true;
        this.openMs = this.silenceMs = 0;
        this.onOpen(this.preRoll.splice(0));
      }
      return;
    }
    this.onFrame(frame);
    this.openMs += FRAME_MS;
    this.silenceMs = loud ? 0 : this.silenceMs + FRAME_MS;
    if (this.silenceMs >= HANG_MS || this.openMs >= MAX_MS) this.close();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.speechMs = 0;
    this.onClose();
  }
}

/** Inputs that carry what the computer plays: PulseAudio/PipeWire monitors, macOS loopback drivers. */
export const LOOPBACK_INPUT = /monitor of|\.monitor\b|blackhole|loopback|soundflower|stereo mix/i;

/**
 * What the computer is playing. Windows: the main process answers getDisplayMedia
 * with WASAPI loopback. Linux/macOS: a monitor / loopback input device (PipeWire
 * and PulseAudio expose "Monitor of …"; macOS needs a driver such as BlackHole).
 */
async function systemAudioStream(): Promise<MediaStream> {
  if (/Windows/i.test(navigator.userAgent)) {
    return navigator.mediaDevices.getDisplayMedia({ audio: true, video: { width: 1, height: 1, frameRate: 1 } });
  }
  // Labels are only filled in after a permission grant
  const probe = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
  const devices = await navigator.mediaDevices.enumerateDevices();
  probe?.getTracks().forEach(t => t.stop());
  const monitor = devices.find(d => d.kind === 'audioinput' && LOOPBACK_INPUT.test(d.label));
  if (!monitor) {
    throw new Error(/Mac/i.test(navigator.userAgent)
      ? 'Computer audio on macOS needs a loopback input such as BlackHole (then route output through it).'
      : 'No monitor input found. With PipeWire or PulseAudio, a "Monitor of …" source should exist; check pavucontrol.');
  }
  return navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: monitor.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
}

/** One captured source. `stop()` releases the device. */
export class SourceCapture {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private vad?: Vad;
  private seq = 0;
  private current?: string;
  level = 0;

  constructor(readonly source: CaptureSource, private sink: UtteranceSink) {}

  async start(): Promise<void> {
    this.stream = this.source === 'microphone'
      ? await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
      : await systemAudioStream();
    this.stream.getVideoTracks().forEach(t => t.stop());
    const audioTrack = this.stream.getAudioTracks()[0];
    if (!audioTrack) throw new Error(this.source === 'microphone' ? 'No microphone found.' : 'System audio capture is not available on this system.');
    audioTrack.addEventListener('ended', () => this.sink.error(this.source, `${this.source === 'microphone' ? 'Microphone' : 'System audio'} disconnected.`));

    this.ctx = new AudioContext();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(this.ctx, 'ally-tap');
    this.ctx.createMediaStreamSource(new MediaStream([audioTrack])).connect(node);

    const rate = this.ctx.sampleRate;
    const frameSamples = Math.round((rate * FRAME_MS) / 1000);
    let pending = new Float32Array(0);
    // ~100 ms per IPC message instead of one per 20 ms frame
    let batch: Int16Array[] = [];
    const flush = () => {
      if (!this.current || !batch.length) return;
      const out = new Int16Array(batch.reduce((n, f) => n + f.length, 0));
      let at = 0;
      for (const f of batch) { out.set(f, at); at += f.length; }
      batch = [];
      this.sink.chunk(this.current, out.buffer);
    };
    this.vad = new Vad(
      preRoll => {
        this.current = `${this.source}-${Date.now()}-${++this.seq}`;
        this.sink.begin(this.source, this.current);
        batch = preRoll;
        flush();
      },
      f => { batch.push(f); if (batch.length >= 5) flush(); },
      () => { flush(); if (this.current) this.sink.end(this.source, this.current); this.current = undefined; },
    );
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const merged = new Float32Array(pending.length + e.data.length);
      merged.set(pending);
      merged.set(e.data, pending.length);
      let offset = 0;
      while (merged.length - offset >= frameSamples) {
        const frame = merged.subarray(offset, offset + frameSamples);
        offset += frameSamples;
        let sum = 0;
        for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
        const rms = Math.sqrt(sum / frame.length);
        this.level = rms;
        this.vad!.feed(toPcm16(frame, rate), rms);
      }
      pending = merged.slice(offset);
    };
  }

  stop(): void {
    this.vad?.close();
    this.stream?.getTracks().forEach(t => t.stop());
    void this.ctx?.close();
    this.ctx = undefined;
    this.stream = undefined;
  }
}
