import { describe, expect, it, vi } from 'vitest';
import { createShakeDetector } from './shake';

/** Feed a triangle wave: `swings` sweeps of `amplitude` px, each lasting `swingMs`. */
function wiggle(feed: (x: number, t: number) => void, { swings, amplitude, swingMs, start = 0 }: { swings: number; amplitude: number; swingMs: number; start?: number }) {
  const steps = Math.max(2, Math.round(swingMs / 16));
  let t = start;
  for (let s = 0; s < swings; s++) {
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      const x = s % 2 === 0 ? amplitude * progress : amplitude * (1 - progress);
      feed(500 + x, (t += 16));
    }
  }
  return t;
}

describe('shake detector', () => {
  it('fires on a quick side-to-side shake', () => {
    const onShake = vi.fn();
    wiggle(createShakeDetector(onShake), { swings: 7, amplitude: 150, swingMs: 100 });
    expect(onShake).toHaveBeenCalledTimes(1);
  });

  it('ignores slow back-and-forth movement', () => {
    const onShake = vi.fn();
    wiggle(createShakeDetector(onShake), { swings: 7, amplitude: 150, swingMs: 400 });
    expect(onShake).not.toHaveBeenCalled();
  });

  it('ignores small jitter', () => {
    const onShake = vi.fn();
    wiggle(createShakeDetector(onShake), { swings: 12, amplitude: 20, swingMs: 60 });
    expect(onShake).not.toHaveBeenCalled();
  });

  it('cools down between shakes', () => {
    const onShake = vi.fn();
    const feed = createShakeDetector(onShake);
    const t = wiggle(feed, { swings: 7, amplitude: 150, swingMs: 100 });
    wiggle(feed, { swings: 7, amplitude: 150, swingMs: 100, start: t });
    expect(onShake).toHaveBeenCalledTimes(1);
    wiggle(feed, { swings: 7, amplitude: 150, swingMs: 100, start: t + 3000 });
    expect(onShake).toHaveBeenCalledTimes(2);
  });
});
