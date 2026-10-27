import { expect, it } from 'vitest';
import { resizePanel } from './resizePanel';
const rect = { left: 100, top: 100, width: 400, height: 300 }, view = { width: 1000, height: 800 };
it('grows from a corner without moving the opposite corner', () => {
  expect(resizePanel(rect, 'se', 200, 150, view)).toEqual({ ...rect, width: 600, height: 450 });
  expect(resizePanel(rect, 'nw', -50, -50, view)).toEqual({ left: 50, top: 50, width: 450, height: 350 });
});
it('keeps every edge on screen and enforces a usable minimum', () => {
  expect(resizePanel(rect, 'se', 5000, 5000, view)).toEqual({ ...rect, width: 890, height: 690 });
  expect(resizePanel(rect, 'nw', -5000, -5000, view)).toEqual({ left: 10, top: 10, width: 490, height: 390 });
  expect(resizePanel(rect, 'se', -5000, -5000, view)).toEqual({ ...rect, width: 280, height: 180 });
  expect(resizePanel(rect, 'nw', 5000, 5000, view)).toEqual({ left: 220, top: 220, width: 280, height: 180 });
});
it('resizes only the requested axis at an edge', () => {
  expect(resizePanel(rect, 'e', 50, 100, view)).toEqual({ ...rect, width: 450 });
  expect(resizePanel(rect, 's', 50, 100, view)).toEqual({ ...rect, height: 400 });
});
