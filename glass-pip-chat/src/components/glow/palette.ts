/**
 * Orb / glow palettes, shared with Orbit's agent "Mary" (Orbit-Frontend
 * lib/voice/live-orb-palette.ts) so both products glow the same way.
 */
export type GlowPalette = [string, string, string];

export const GLOW_PALETTES = {
  sunset: ['#FF6B35', '#F72585', '#FFB347'],
  aurora: ['#00D4AA', '#7B61FF', '#FF6EC7'],
  ocean: ['#0077B6', '#00B4D8', '#90E0EF'],
  default: ['#4D80FF', '#FF4D80', '#80FF4D'],
} satisfies Record<string, GlowPalette>;

export type GlowPaletteId = keyof typeof GLOW_PALETTES;

/** Mary's default palette */
export const DEFAULT_GLOW_PALETTE: GlowPaletteId = 'sunset';

export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return [77, 128, 255];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/** 0–1 RGB for shader uniforms */
export function hexToUnitRgb(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
}

const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Mary's "active" boost: push each channel away from mid-grey for more chroma. */
export function boostPalette(colors: GlowPalette, active: boolean): GlowPalette {
  if (!active) return colors;
  const factor = 1.18;
  return colors.map(hex => {
    const [r, g, b] = hexToRgb(hex);
    const s = (v: number) => 128 + (v - 128) * factor;
    return `#${toHex(s(r))}${toHex(s(g))}${toHex(s(b))}`;
  }) as GlowPalette;
}
