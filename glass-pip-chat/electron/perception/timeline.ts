// Rolling, time-ordered buffer of observations. Short-lived session context only:
// nothing here persists, and old entries fall off after `retentionMs`.
import type { ContextWindow, Observation, Stamp } from './types.js';

type Listener = (o: Observation) => void;

export const now = (): Stamp => ({ t: performance.now(), at: new Date().toISOString() });

export class Timeline {
  private items: Observation[] = [];
  private listeners = new Set<Listener>();
  total = 0;

  constructor(private retentionMs = 10 * 60_000, private maxItems = 4000) {}

  push(o: Observation): void {
    // Keep monotonic order even if a source reports slightly late
    let i = this.items.length;
    while (i > 0 && this.items[i - 1].t > o.t) i--;
    this.items.splice(i, 0, o);
    this.total++;
    this.prune(o.t);
    this.listeners.forEach(l => l(o));
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Everything observed in the last `ms` (relative to the newest entry or `atT`). */
  recent(ms: number, atT = this.items.at(-1)?.t ?? performance.now()): Observation[] {
    const from = atT - ms;
    return this.items.filter(o => o.t >= from && o.t <= atT);
  }

  /** The screen and transcript around a moment, for the agent or circle-to-ask. */
  window(ms: number, atT?: number): ContextWindow {
    const items = this.recent(ms, atT);
    const toT = atT ?? items.at(-1)?.t ?? performance.now();
    return {
      fromT: toT - ms,
      toT,
      transcript: items.filter((o): o is ContextWindow['transcript'][number] => o.kind === 'transcript.final'),
      windows: items.filter((o): o is ContextWindow['windows'][number] => o.kind === 'screen.window_changed'),
      snapshots: items.filter((o): o is ContextWindow['snapshots'][number] => o.kind === 'screen.snapshot'),
      ocr: items.filter((o): o is ContextWindow['ocr'][number] => o.kind === 'screen.ocr'),
    };
  }

  /** The latest observation of a kind (e.g. the current window). */
  last<K extends Observation['kind']>(kind: K): Extract<Observation, { kind: K }> | undefined {
    for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].kind === kind) return this.items[i] as Extract<Observation, { kind: K }>;
    return undefined;
  }

  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }

  private prune(latest: number): void {
    const cutoff = latest - this.retentionMs;
    let drop = 0;
    while (drop < this.items.length && (this.items[drop].t < cutoff || this.items.length - drop > this.maxItems)) drop++;
    if (drop) this.items.splice(0, drop);
  }
}

/** Plain-text rendering of a context window for an agent prompt. */
export function describeWindow(w: ContextWindow, maxChars = 6000): string {
  const lines: string[] = [];
  const merged = [...w.windows, ...w.transcript, ...w.ocr].sort((a, b) => a.t - b.t);
  for (const o of merged) {
    const time = o.at.slice(11, 19);
    if (o.kind === 'transcript.final') lines.push(`${time} [${o.source === 'microphone' ? 'microphone' : 'audio'}${o.speaker ? `; utterance-local ${o.speaker}` : ''}] ${o.text}`);
    else if (o.kind === 'screen.window_changed') lines.push(`${time} [window] ${o.app}: ${o.title}`);
    else lines.push(`${time} [screen text] ${o.text.replace(/\s+/g, ' ').slice(0, 600)}`);
  }
  const text = lines.join('\n');
  return text.length > maxChars ? `…${text.slice(-maxChars)}` : text;
}
