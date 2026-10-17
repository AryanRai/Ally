// Cheap "did the screen meaningfully change?" check: a difference hash over a
// tiny greyscale thumbnail. Cursor moves, carets and small animations flip only
// a few bits; slide changes, new windows and navigation flip many.

/** 9×8 greyscale samples from BGRA/RGBA bitmap data → 64-bit dHash (as 64 booleans). */
export function dHash(bitmap: Uint8Array, width: number, height: number, bgra = true): boolean[] {
  const cols = 9;
  const rows = 8;
  const grey: number[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Average a block, not a single pixel, so noise doesn't matter
      const x0 = Math.floor((x * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / cols));
      const y0 = Math.floor((y * height) / rows);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / rows));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy += 2) {
        for (let xx = x0; xx < x1; xx += 2) {
          const i = (yy * width + xx) * 4;
          const r = bitmap[i + (bgra ? 2 : 0)];
          const g = bitmap[i + 1];
          const b = bitmap[i + (bgra ? 0 : 2)];
          sum += 0.299 * r + 0.587 * g + 0.114 * b;
          n++;
        }
      }
      grey.push(n ? sum / n : 0);
    }
  }
  const bits: boolean[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols - 1; x++) bits.push(grey[y * cols + x] > grey[y * cols + x + 1]);
  return bits;
}

/** Fraction of differing bits (0 = identical, 1 = everything changed). */
export function hashDistance(a: boolean[], b: boolean[]): number {
  if (a.length !== b.length || !a.length) return 1;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d / a.length;
}

/** Mean absolute luminance difference between two same-size thumbnails (0–1). */
export function pixelDelta(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || !a.length) return 1;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 16) { // every 4th pixel is plenty
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    n += 3;
  }
  return sum / n / 255;
}

/**
 * Adaptive gate: a change counts once it is big enough and has settled (two
 * similar frames in a row), so mid-transition frames and animations are skipped.
 */
export class ChangeDetector {
  private committed?: { hash: boolean[]; pixels: Uint8Array };
  private pending?: { hash: boolean[]; pixels: Uint8Array };

  constructor(private hashThreshold = 0.12, private pixelThreshold = 0.035) {}

  /** Returns the change size (0–1) when a settled, meaningful change happened; otherwise null. */
  feed(pixels: Uint8Array, width: number, height: number): number | null {
    const hash = dHash(pixels, width, height);
    if (!this.committed) {
      this.committed = { hash, pixels };
      return null;
    }
    const change = Math.max(hashDistance(hash, this.committed.hash), pixelDelta(pixels, this.committed.pixels) * 2);
    if (change < this.hashThreshold && pixelDelta(pixels, this.committed.pixels) < this.pixelThreshold) {
      this.pending = undefined;
      return null;
    }
    // Wait for the new frame to hold still before calling it a change
    if (this.pending && hashDistance(hash, this.pending.hash) < 0.05) {
      this.committed = { hash, pixels };
      this.pending = undefined;
      return Math.min(1, change);
    }
    this.pending = { hash, pixels };
    return null;
  }

  reset(): void {
    this.committed = undefined;
    this.pending = undefined;
  }
}
