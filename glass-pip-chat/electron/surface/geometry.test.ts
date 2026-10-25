import { describe, it, expect } from 'vitest';
import { dockingDisplay, parseNativePoint, pillBounds } from './geometry';
describe('notch and pill monitor handoff', () => {
  const left = { x: -1920, y: -180, width: 1920, height: 1080 };
  const right = { x: 0, y: 0, width: 2560, height: 1440 };
  it('docks only in the top band of the monitor under the pointer', () => {
    expect(dockingDisplay({ x: -800, y: -170 }, [left, right])).toBe(left);
    expect(dockingDisplay({ x: 500, y: 20 }, [left, right])).toBe(right);
    expect(dockingDisplay({ x: -800, y: 0 }, [left, right])).toBeUndefined();
    expect(dockingDisplay({ x: 500, y: -10 }, [left, right])).toBeUndefined();
  });
  it('converts native physical coordinates exactly once for mixed DPI', () => {
    expect(parseNativePoint(['DETACH', '3000', '150'], p => ({ x: p.x / 1.5, y: p.y / 1.5 }))).toEqual({ x: 2000, y: 100 });
    for (const words of [['DETACH','NaN','1'], ['DETACH','Infinity','2'], ['DETACH','3'], ['DETACH','100001','3']]) expect(parseNativePoint(words, p => p)).toBeUndefined();
  });
  it('accepts the window edge with a lower grip on a vertically offset display', () => {
    const display = { x: 2134, y: 608, width: 1600, height: 901 };
    expect(dockingDisplay({ x: 3300, y: 664 }, [right, display], { x: 3200, y: 612, width: 380, height: 112 })).toBe(display);
    expect(dockingDisplay({ x: 3300, y: 700 }, [display], { x: 3200, y: 650, width: 380, height: 112 })).toBeUndefined();
    expect(dockingDisplay({ x: 3300, y: 740 }, [display], { x: 3200, y: 608, width: 380, height: 426 })).toBeUndefined();
  });
  it('keeps the initial floating pill inside negative-coordinate and tiny displays', () => {
    expect(pillBounds({ x: -1910, y: -160 }, left)).toEqual({ x: -1920, y: -178, width: 380, height: 112 });
    expect(pillBounds({ x: 95, y: 95 }, { x: 0, y: 0, width: 100, height: 100 })).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});
