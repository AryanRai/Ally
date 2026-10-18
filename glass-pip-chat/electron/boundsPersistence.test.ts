import { afterEach, expect, it, vi } from 'vitest';
import { boundsPersistence } from './boundsPersistence';
afterEach(() => vi.useRealTimers());
it('coalesces resize/move bursts, persists final geometry and flushes on exit', () => {
  vi.useFakeTimers();
  let width = 400;
  const writes: number[] = [];
  const persistence = boundsPersistence(() => writes.push(width));
  for (let i = 0; i < 1000; i++) { width = 400 + i; persistence.schedule(); }
  expect(writes).toEqual([]);
  vi.advanceTimersByTime(150);
  expect(writes).toEqual([1399]);
  width = 480; persistence.schedule(); persistence.flush();
  vi.runAllTimers();
  expect(writes).toEqual([1399, 480]);
  expect(persistence.flush()).toBe(false);
});
