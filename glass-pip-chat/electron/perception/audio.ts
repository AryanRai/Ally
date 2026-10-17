// Continuous transcription for perception sessions. The renderer captures each
// source, detects speech and streams one utterance at a time; each utterance is
// a bounded Google streaming recognition (the same recognizer voice input uses).
import { recognizeLive, type Recognition } from '../speech/streaming.js';
import { speechSettings } from '../speech/settings.js';
import { now } from './timeline.js';
import type { AudioSource, Observation } from './types.js';

/** Utterances longer than this are cut by the renderer; the recognizer caps at 60 s. */
export const MAX_UTTERANCE_MS = 25_000;

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

/** Share of `a`'s words that also appear in `b` (0–1). */
export function overlap(a: string, b: string): number {
  const wa = words(a);
  if (!wa.length) return 0;
  const wb = new Set(words(b));
  return wa.filter(w => wb.has(w)).length / wa.length;
}

interface Active {
  recognition: Recognition;
  startT: number;
  lastPartial: string;
}

export class AudioTranscriber {
  private active = new Map<string, Active>();
  private recentSystem: Array<{ t: number; text: string }> = [];

  constructor(private emit: (o: Observation) => void, private recognize = recognizeLive, private settings = speechSettings) {}

  /** Why transcription can't run, or null when it can. */
  unavailable(): string | null {
    const s = this.settings();
    return s.cloud && s.project ? null : 'Live transcription uses Google Cloud speech. Turn it on in Settings → Voice.';
  }

  begin(source: AudioSource, utteranceId: string): void {
    this.cancel(utteranceId);
    const reason = this.unavailable();
    if (reason) {
      this.emit({ ...now(), kind: 'perception.error', component: 'audio', message: reason });
      return;
    }
    const startT = performance.now();
    this.emit({ ...now(), kind: 'audio.vad', source, speaking: true });
    try {
      const recognition = this.recognize(this.settings(), ev => {
        const entry = this.active.get(utteranceId);
        if (ev.type === 'transcript' && ev.text && !ev.final && entry && ev.text !== entry.lastPartial) {
          entry.lastPartial = ev.text;
          this.emit({ ...now(), kind: 'transcript.partial', source, utteranceId, text: ev.text });
        } else if (ev.type === 'complete') {
          this.active.delete(utteranceId);
          const text = (ev.text ?? '').trim();
          if (text && !this.isEcho(source, text)) {
            const stamp = now();
            const segments = ev.speakers?.length ? ev.speakers : [{ text, speaker: ev.speaker }];
            for (const segment of segments) this.emit({ ...stamp, kind: 'transcript.final', source, utteranceId, text: segment.text, startT, endT: stamp.t, ...(segment.speaker ? { speaker: `${utteranceId}/${segment.speaker}` } : {}) });
            if (source === 'system_audio') this.rememberSystem(stamp.t, text);
          }
        } else if (ev.type === 'error') {
          this.active.delete(utteranceId);
          this.emit({ ...now(), kind: 'perception.error', component: 'audio', message: ev.error ?? 'Transcription failed' });
        }
      }, { diarization: true });
      this.active.set(utteranceId, { recognition, startT, lastPartial: '' });
    } catch (e) {
      this.emit({ ...now(), kind: 'perception.error', component: 'audio', message: e instanceof Error ? e.message : String(e) });
    }
  }

  write(utteranceId: string, pcm: Uint8Array): void {
    this.active.get(utteranceId)?.recognition.write(pcm);
  }

  end(source: AudioSource, utteranceId: string): void {
    this.emit({ ...now(), kind: 'audio.vad', source, speaking: false });
    this.active.get(utteranceId)?.recognition.end();
  }

  cancel(utteranceId: string): void {
    this.active.get(utteranceId)?.recognition.cancel();
    this.active.delete(utteranceId);
  }

  stopAll(): void {
    for (const id of [...this.active.keys()]) this.cancel(id);
  }

  /** The microphone often re-hears the speakers; drop mic text that repeats recent system audio. */
  private isEcho(source: AudioSource, text: string): boolean {
    if (source !== 'microphone') return false;
    const t = performance.now();
    return this.recentSystem.some(s => t - s.t < 8000 && overlap(text, s.text) >= 0.7);
  }

  private rememberSystem(t: number, text: string): void {
    this.recentSystem.push({ t, text });
    this.recentSystem = this.recentSystem.filter(s => t - s.t < 15_000);
  }
}
