import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedPanelGlowWeb } from './PanelGlow';

let now = 0;
let frames: Map<number, FrameRequestCallback>;
let nextFrame = 0;
let reduced = false;
let mediaChange: () => void;
let resize: () => void;
let height = 540;

function advance(ms: number, step = 1000 / 60) {
  const end = now + ms;
  while (now < end) {
    now = Math.min(end, now + step);
    const queued = [...frames.values()];
    frames.clear();
    act(() => queued.forEach(callback => callback(now)));
  }
}

beforeEach(() => {
  now = 0; nextFrame = 0; reduced = false; height = 540; frames = new Map();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: 440, height } as DOMRect));
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++nextFrame, cb); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { resize = cb; } observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener: (_: string, cb: () => void) => { mediaChange = cb; }, removeEventListener() {} }));
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const glow = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-panel-glow]')!;
const value = (element: HTMLElement, property: string) => parseFloat(element.style.getPropertyValue(`--panel-glow-${property}`));

describe('panel glow lifecycle', () => {
  it('reverses a partial fade smoothly and stops scheduling after fading out', () => {
    const view = render(<AnimatedPanelGlowWeb active inward />);
    advance(200);
    const halfway = value(glow(view.container), 'intensity');
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(1);
    view.rerender(<AnimatedPanelGlowWeb active={false} inward />);
    expect(value(glow(view.container), 'intensity')).toBeCloseTo(halfway);
    advance(600);
    expect(value(glow(view.container), 'intensity')).toBe(0);
    expect(frames.size).toBe(0);
    view.rerender(<AnimatedPanelGlowWeb active inward />);
    advance(600);
    expect(value(glow(view.container), 'intensity')).toBe(1);
  });

  it('rotates at the same speed on 60Hz and 120Hz displays', () => {
    const first = render(<AnimatedPanelGlowWeb active />);
    advance(1000);
    const angle60 = value(glow(first.container), 'angle');
    first.unmount(); now = 0;
    const second = render(<AnimatedPanelGlowWeb active />);
    advance(1000, 1000 / 120);
    expect(value(glow(second.container), 'angle')).toBeCloseTo(angle60, 5);
  });

  it('retains transparent sections in the neon preset', () => {
    const view = render(<AnimatedPanelGlowWeb active styleId="neon-pulse" />);
    const gradient = glow(view.container).style.getPropertyValue('--panel-glow-layer-0-gradient');
    expect(gradient.match(/transparent/g)?.length).toBe(2);
  });

  it('updates halo bounds when a full window collapses', () => {
    const view = render(<AnimatedPanelGlowWeb active inward />);
    expect(value(glow(view.container), 'limit')).toBeCloseTo(440 / 6);
    height = 120; act(() => resize());
    expect(value(glow(view.container), 'limit')).toBe(20);
    expect(glow(view.container).style.overflow).toBe('hidden');
    expect(glow(view.container).style.pointerEvents).toBe('none');
  });

  it('settles reduced motion without losing the active halo and wakes on preference changes', () => {
    reduced = true;
    const view = render(<AnimatedPanelGlowWeb active />);
    advance(600);
    expect(value(glow(view.container), 'angle')).toBe(0);
    expect(value(glow(view.container), 'intensity')).toBe(1);
    expect(frames.size).toBe(0);
    reduced = false; act(() => mediaChange()); advance(100);
    expect(value(glow(view.container), 'angle')).toBeGreaterThan(0);
  });

  it('fades from a preview into an inactive live view', () => {
    const view = render(<AnimatedPanelGlowWeb active={false} preview />);
    expect(value(glow(view.container), 'intensity')).toBe(1);
    view.rerender(<AnimatedPanelGlowWeb active={false} />);
    advance(600);
    expect(value(glow(view.container), 'intensity')).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('does not animate a zero-strength glow and cleans up on unmount', () => {
    const view = render(<AnimatedPanelGlowWeb active intensity={0} />);
    expect(frames.size).toBe(0);
    view.rerender(<AnimatedPanelGlowWeb active intensity={1} />);
    expect(frames.size).toBe(1);
    view.unmount();
    expect(frames.size).toBe(0);
  });
});
