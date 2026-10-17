/** Downsample each 20ms worklet frame using a box filter (microphone contexts are >=16kHz). */
export function pcm16k(frame: Float32Array, sourceRate: number): Float32Array {
  const result = new Float32Array(Math.round(frame.length * 16000 / sourceRate));
  const ratio = sourceRate / 16000;
  for (let i = 0; i < result.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end && j < frame.length; j++) sum += frame[j];
    result[i] = sum / (end - start);
  }
  return result;
}

export function wav16k(frames: Float32Array[]): Uint8Array {
  const samples = frames.reduce((total, frame) => total + frame.length, 0);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples * 2, true);
  let offset = 44;
  for (const frame of frames) for (const sample of frame) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return bytes;
}

/** Adaptive energy gate only segments utterances; the worker's Silero VAD filters non-speech. */
export class UtteranceBuffer {
  private frames: Float32Array[] = [];
  private preRoll: Float32Array[] = [];
  private silence = 0;
  private voiced = 0;
  private noise = .002;
  get active(): boolean { return this.frames.length > 0; }
  push(frame: Float32Array): { level: number; started: boolean; startFrames?: Float32Array[]; utterance?: Float32Array[] } {
    const rms = Math.sqrt(frame.reduce((sum, sample) => sum + sample * sample, 0) / frame.length);
    const speech = rms > Math.max(.009, this.noise * 3);
    let started = false;
    if (!this.active) {
      this.preRoll.push(frame);
      if (this.preRoll.length > 12) this.preRoll.shift();
      if (!speech) this.noise = this.noise * .98 + Math.min(rms, .015) * .02;
      else { this.frames = this.preRoll; this.preRoll = []; this.voiced = 1; this.silence = 0; started = true; }
    } else {
      this.frames.push(frame);
      if (speech) { this.voiced++; this.silence = 0; } else this.silence++;
      if (this.silence >= 35 || this.frames.length >= 1000) return { level: rms, started, utterance: this.flush() };
    }
    return { level: rms, started, startFrames: started ? [...this.frames] : undefined };
  }
  flush(): Float32Array[] | undefined {
    const result = this.voiced >= 10 ? this.frames : undefined;
    this.frames = []; this.preRoll = []; this.voiced = 0; this.silence = 0;
    return result;
  }
}
