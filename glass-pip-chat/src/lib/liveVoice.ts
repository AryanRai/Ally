/** A single utterance; transport failures fall back only after recording ends. */
export class LiveUtterance {
  readonly id = crypto.randomUUID();
  private detach: () => void;
  private result?: string;
  private failed = false;
  private finished = false;
  private closed = false;
  private audio?: Uint8Array;
  private timer: ReturnType<typeof setTimeout>;
  constructor(private preview: (text: string) => void, private complete: (text: string) => void, private fallback: (audio: Uint8Array) => void) {
    this.detach = window.pip.speech.onLiveEvent(event => {
      if (event.id !== this.id || this.closed) return;
      if (event.type === 'transcript') preview(event.text ?? '');
      if (event.type === 'complete') { this.result = event.text?.trim() ?? ''; this.deliver(); }
      if (event.type === 'error') { this.failed = true; this.deliver(); }
    });
    this.timer = setTimeout(() => { this.failed = true; this.deliver(); }, 80_000);
    window.pip.speech.liveStart(this.id);
  }
  write(bytes: Uint8Array) { if (!this.closed && !this.failed) window.pip.speech.liveAudio(this.id, bytes); }
  finish(audio: Uint8Array) { this.audio = audio; this.finished = true; window.pip.speech.liveEnd(this.id); this.deliver(); }
  private deliver() {
    if (this.closed || !this.finished || (!this.failed && this.result === undefined)) return;
    const text = this.result; const audio = this.audio!;
    this.cancel(); this.preview('');
    if (this.failed || !text) this.fallback(audio); else this.complete(text);
  }
  cancel() { if (this.closed) return; this.closed = true; clearTimeout(this.timer); this.detach(); window.pip.speech.liveEnd(this.id, true); }
}

/** Schedule incoming 24 kHz PCM against the audio clock, with a small jitter buffer. */
export class PcmPlayback {
  private context = new AudioContext();
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private waiters: Array<() => void> = [];
  private stopped = false;
  bytes = 0;
  async start() { await this.context.resume(); }
  push(base64: string, volume: number) {
    if (this.stopped) return;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    if (bytes.length % 2) throw new Error('Invalid streaming audio.');
    this.bytes += bytes.length;
    const buffer = this.context.createBuffer(1, bytes.length / 2, 24000);
    const view = new DataView(bytes.buffer); const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    const source = this.context.createBufferSource(); source.buffer = buffer;
    const gain = this.context.createGain(); gain.gain.value = Math.min(1, Math.max(0, volume));
    source.connect(gain).connect(this.context.destination); this.sources.add(source);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.sources.delete(source); if (!this.sources.size) this.waiters.splice(0).forEach(resolve => resolve()); };
    const start = Math.max(this.next, this.context.currentTime + .08); this.next = start + buffer.duration; source.start(start);
  }
  drain() { return this.sources.size ? new Promise<void>(resolve => this.waiters.push(resolve)) : Promise.resolve(); }
  stop() { if (this.stopped) return; this.stopped = true; for (const source of this.sources) { try { source.stop(); } catch { /* ended */ } } this.sources.clear(); this.waiters.splice(0).forEach(resolve => resolve()); void this.context.close(); }
}
