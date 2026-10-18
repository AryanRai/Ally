import { describe, expect, it } from 'vitest';
import { selectionBounds, selectionPanel } from './selection';

describe('unified screen selection', () => {
  it('supports reverse rectangle drags and freehand extrema with bounded padding', () => {
    const points = [{ x: 400, y: 300 }, { x: 600, y: 500 }, { x: 100, y: 100 }];
    expect(selectionBounds(points, 'rectangle', 800, 600)).toEqual({ x: 100, y: 100, width: 300, height: 200 });
    expect(selectionBounds(points, 'freehand', 800, 600)).toEqual({ x: 90, y: 90, width: 520, height: 420 });
    expect(selectionBounds([{ x: 2, y: 3 }, { x: 900, y: 700 }], 'freehand', 800, 600)).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
  it('rejects clicks and tiny movements before padding can turn them into a crop', () => {
    expect(selectionBounds([{ x: 100, y: 100 }], 'freehand', 800, 600)).toBeNull();
    expect(selectionBounds([{ x: 100, y: 100 }, { x: 101, y: 101 }], 'freehand', 800, 600)).toBeNull();
  });
  it('anchors at the pill and clamps at display edges and on small screens', () => {
    expect(selectionPanel({ width: 1920, height: 1080 }, { x: 120, y: 90, width: 360, height: 200 })).toMatchObject({ left: 120, top: 90 });
    const edge = selectionPanel({ width: 360, height: 640 }, { x: 300, y: 620, width: 360, height: 400 });
    expect(edge).toEqual({ left: 12, top: 518, width: 336 });
    expect(selectionPanel({ width: 800, height: 600 }, { x: -1920, y: 20, width: 360, height: 400 })).toMatchObject({ left: 200, top: 24 });
  });
  it('places the question above selections at the bottom without leaving the display', () => {
    expect(selectionPanel({ width: 800, height: 600 }, undefined, { x: 750, y: 500, width: 50, height: 80 }, 220)).toEqual({ left: 388, top: 268, width: 400 });
  });
});
