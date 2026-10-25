export type Point = { x: number; y: number };
export type Bounds = Point & { width: number; height: number };

export function dockingDisplay(point: Point, displays: Bounds[], window?: Bounds): Bounds | undefined {
  return displays.find(b => point.x >= b.x && point.x < b.x + b.width
    && point.y >= b.y && point.y < b.y + b.height
    && (point.y <= b.y + 32 || (window !== undefined
      && Math.abs(window.y - b.y) <= 24
      && window.x < b.x + b.width && window.x + window.width > b.x
      && point.y >= window.y && point.y <= window.y + 96)));
}

export function pillBounds(point: Point, display: Bounds): Bounds {
  const width = Math.min(380, display.width), height = Math.min(112, display.height);
  return { width, height, x: Math.round(Math.max(display.x, Math.min(point.x - width / 2, display.x + display.width - width))),
    y: Math.round(Math.max(display.y, Math.min(point.y - 18, display.y + display.height - height))) };
}

/** Native pointer coordinates are physical pixels; Electron geometry is DIP. */
export function parseNativePoint(words: string[], convert: (p: Point) => Point): Point | undefined {
  if (words.length !== 3) return;
  const x = Number(words[1]), y = Number(words[2]);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || Math.abs(x) > 100000 || Math.abs(y) > 100000) return;
  return convert({ x, y });
}
