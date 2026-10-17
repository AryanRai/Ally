import { describe, expect, it } from 'vitest';
import { ChangeDetector, dHash, hashDistance } from './screenHash';
import { describeWindow, Timeline } from './timeline';
import type { Observation } from './types';

const final = (t: number, text: string, source: 'microphone' | 'system_audio' = 'system_audio'): Observation =>
  ({ kind: 'transcript.final', t, at: new Date(t).toISOString(), source, utteranceId: `u${t}`, text, startT: t - 500, endT: t });

describe('Timeline', () => {
  it('keeps monotonic order and answers "last N seconds"', () => {
    const tl = new Timeline();
    tl.push(final(1000, 'a'));
    tl.push(final(3000, 'c'));
    tl.push(final(2000, 'b')); // late arrival
    expect(tl.recent(10_000).map(o => (o as any).text)).toEqual(['a', 'b', 'c']);
    expect(tl.window(1500).transcript.map(o => o.text)).toEqual(['b', 'c']);
  });

  it('drops entries older than the retention window', () => {
    const tl = new Timeline(5_000);
    tl.push(final(1000, 'old'));
    tl.push(final(7000, 'new'));
    expect(tl.size).toBe(1);
  });

  it('renders a readable prompt excerpt', () => {
    const tl = new Timeline();
    tl.push({ kind: 'screen.window_changed', t: 1, at: '2026-10-17T09:30:10.000Z', title: 'PID Control.pdf', app: 'Acrobat' });
    tl.push({ ...final(2, 'Why do we need anti windup?'), at: '2026-10-17T09:30:15.000Z' });
    expect(describeWindow(tl.window(60_000, 3))).toBe('09:30:10 [window] Acrobat: PID Control.pdf\n09:30:15 [audio] Why do we need anti windup?');
  });
});

describe('screen change detection', () => {
  const frame = (fill: (x: number, y: number) => number, w = 64, h = 36) => {
    const px = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = fill(x, y);
      px.set([v, v, v, 255], (y * w + x) * 4);
    }
    return px;
  };
  const slideA = frame(x => (x < 32 ? 30 : 220));
  const slideB = frame((_x, y) => (y < 18 ? 230 : 20));
  const slideAWithCursor = frame((x, y) => (x === 10 && y === 10 ? 255 : x < 32 ? 30 : 220));

  it('ignores tiny changes like a cursor', () => {
    const d = new ChangeDetector();
    d.feed(slideA, 64, 36);
    expect(d.feed(slideAWithCursor, 64, 36)).toBeNull();
    expect(d.feed(slideAWithCursor, 64, 36)).toBeNull();
  });

  it('reports a slide change once it has settled', () => {
    const d = new ChangeDetector();
    d.feed(slideA, 64, 36);
    expect(d.feed(slideB, 64, 36)).toBeNull(); // first frame of the change
    expect(d.feed(slideB, 64, 36)).toBeGreaterThan(0.1); // still there → commit
    expect(d.feed(slideB, 64, 36)).toBeNull(); // no repeat
  });

  it("dHash distance separates different layouts", () => {
    const stripes = frame(x => (x % 16 < 8 ? 230 : 20));
    expect(hashDistance(dHash(slideA, 64, 36), dHash(slideA, 64, 36))).toBe(0);
    expect(hashDistance(dHash(slideA, 64, 36), dHash(stripes, 64, 36))).toBeGreaterThan(0.1);
  });
});
