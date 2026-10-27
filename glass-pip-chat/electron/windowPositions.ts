export type FloatingMode = 'collapsed' | 'expanded';
export type WindowPoint = { x: number; y: number };

/** Keep each view's preferred position across size clamping and mode changes. */
export class WindowPositions {
  private mode?: FloatingMode;
  private positions: Partial<Record<FloatingMode, WindowPoint>> = {};
  constructor(saved: unknown = {}) {
    if (saved && typeof saved === 'object') for (const mode of ['collapsed', 'expanded'] as const) {
      const point = (saved as Record<string, WindowPoint>)[mode];
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) this.positions[mode] = { x: point.x, y: point.y };
    }
  }
  move(point: WindowPoint) { if (this.mode) this.positions[this.mode] = { ...point }; }
  switch(mode: FloatingMode | undefined, current: WindowPoint) {
    if (!mode || mode === this.mode) return current;
    // Programmatic size clamping must not overwrite the other mode's location.
    this.mode = mode;
    if (!this.positions[mode]) this.positions[mode] = { ...current };
    return this.positions[mode] ?? current;
  }
  snapshot() { return { ...this.positions }; }
}
