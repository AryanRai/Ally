import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useWindowSizing } from './useWindowSizing';

afterEach(() => { cleanup(); vi.useRealTimers(); });

it('grows without a timer and preserves the shrink fade, cancelling stale sizes on reversal', () => {
  vi.useFakeTimers();
  const resizeWindow = vi.fn(), resizing = vi.fn();
  window.pip = { resizeWindow } as any;
  const view = renderHook(({ collapsed, width, height }) => useWindowSizing(width, height, collapsed, resizing), { initialProps: { collapsed: false, width: 448, height: 560 } });
  expect(resizeWindow).toHaveBeenLastCalledWith(448, 560, 'expanded');
  view.rerender({ collapsed: true, width: 360, height: 96 });
  act(() => vi.advanceTimersByTime(150));
  expect(resizeWindow).toHaveBeenCalledTimes(1);
  view.rerender({ collapsed: false, width: 620, height: 700 });
  expect(resizeWindow).toHaveBeenLastCalledWith(620, 700, 'expanded');
  act(() => vi.advanceTimersByTime(100));
  expect(resizeWindow).toHaveBeenCalledTimes(2);
  view.rerender({ collapsed: true, width: 360, height: 180 });
  act(() => vi.advanceTimersByTime(200));
  expect(resizeWindow).toHaveBeenLastCalledWith(360, 180, 'collapsed');
  view.unmount();
  const calls = resizing.mock.calls.length;
  act(() => vi.advanceTimersByTime(1000));
  expect(resizing).toHaveBeenCalledTimes(calls);
});
