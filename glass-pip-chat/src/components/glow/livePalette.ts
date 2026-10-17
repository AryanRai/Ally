/** Shared live-orb color palette — presets, persistence shape, and per-style mappers. */

export const DEFAULT_ORB_COLORS = ["#4D80FF", "#FF4D80", "#80FF4D"] as const

export const LS_LIVE_ORB_PALETTE_KEY = "orbit_live_orb_palette"

export type LiveOrbPalettePresetId = "default" | "aurora" | "sunset" | "ocean" | "custom"

export type LiveOrbPaletteColors = [string, string, string]

export type LiveOrbPaletteState = {
  preset: LiveOrbPalettePresetId
  customColors: LiveOrbPaletteColors
}

export const LIVE_ORB_PALETTE_PRESETS: {
  id: Exclude<LiveOrbPalettePresetId, "custom">
  name: string
  colors: LiveOrbPaletteColors
}[] = [
  {
    id: "default",
    name: "Default",
    colors: [...DEFAULT_ORB_COLORS],
  },
  {
    id: "aurora",
    name: "Aurora",
    colors: ["#00D4AA", "#7B61FF", "#FF6EC7"],
  },
  {
    id: "sunset",
    name: "Sunset",
    colors: ["#FF6B35", "#F72585", "#FFB347"],
  },
  {
    id: "ocean",
    name: "Ocean",
    colors: ["#0077B6", "#00B4D8", "#90E0EF"],
  },
]

const DEFAULT_SUNSET_COLORS = LIVE_ORB_PALETTE_PRESETS.find(p => p.id === "sunset")!.colors

export const DEFAULT_LIVE_ORB_PALETTE: LiveOrbPaletteState = {
  preset: "sunset",
  customColors: [...DEFAULT_SUNSET_COLORS],
}

const PRESET_IDS = new Set<string>(["default", "aurora", "sunset", "ocean", "custom"])

const HEX_RE = /^#([a-f\d]{6})$/i

function normalizeHex(color: string, fallback: string): string {
  const c = color.trim()
  if (HEX_RE.test(c)) return c.toLowerCase()
  const short = c.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i)
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
  }
  return fallback
}

function normalizeColors(colors: unknown, fallback: LiveOrbPaletteColors): LiveOrbPaletteColors {
  if (!Array.isArray(colors) || colors.length < 3) return fallback
  return [
    normalizeHex(String(colors[0]), fallback[0]),
    normalizeHex(String(colors[1]), fallback[1]),
    normalizeHex(String(colors[2]), fallback[2]),
  ]
}

export function resolveLiveOrbPalette(raw: string | null): LiveOrbPaletteState {
  if (!raw) return { ...DEFAULT_LIVE_ORB_PALETTE, customColors: [...DEFAULT_LIVE_ORB_PALETTE.customColors] }
  try {
    const parsed = JSON.parse(raw) as Partial<LiveOrbPaletteState>
    const preset = parsed.preset && PRESET_IDS.has(parsed.preset) ? parsed.preset : "default"
    return {
      preset: preset as LiveOrbPalettePresetId,
      customColors: normalizeColors(parsed.customColors, DEFAULT_LIVE_ORB_PALETTE.customColors),
    }
  } catch {
    return { ...DEFAULT_LIVE_ORB_PALETTE, customColors: [...DEFAULT_LIVE_ORB_PALETTE.customColors] }
  }
}

export function serializeLiveOrbPalette(state: LiveOrbPaletteState): string {
  return JSON.stringify(state)
}

export function resolvePaletteColors(state: LiveOrbPaletteState): LiveOrbPaletteColors {
  if (state.preset === "custom") return [...state.customColors]
  const preset = LIVE_ORB_PALETTE_PRESETS.find(p => p.id === state.preset)
  return preset ? [...preset.colors] : [...DEFAULT_LIVE_ORB_PALETTE.customColors]
}

/** RGB 0–255 */
export function hexToRgb(hex: string): [number, number, number] {
  const m = normalizeHex(hex, "#000000").match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (!m) return [77, 128, 255]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`
}

export function hexToHue(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h = 0
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return h
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const lerp = (x: number, y: number) => x + (y - x) * t
  return rgbToHex(lerp(ar, br), lerp(ag, bg), lerp(ab, bb))
}

function lightenHex(hex: string, amount: number): string {
  return mixHex(hex, "#ffffff", amount)
}

function saturateChannel(value: number, factor: number): number {
  const centered = value - 128
  return 128 + centered * factor
}

/** Slightly boost saturation/chroma for active/listening states. */
export function boostPaletteColors(colors: LiveOrbPaletteColors, active: boolean): LiveOrbPaletteColors {
  if (!active) return colors
  const factor = 1.18
  return colors.map(hex => {
    const [r, g, b] = hexToRgb(hex)
    return rgbToHex(saturateChannel(r, factor), saturateChannel(g, factor), saturateChannel(b, factor))
  }) as LiveOrbPaletteColors
}

export function mapEnergyOrbColors(colors: LiveOrbPaletteColors, active: boolean): LiveOrbPaletteColors {
  return boostPaletteColors(colors, active)
}

export type SiriOrbColorMap = {
  bg: string
  c1: string
  c2: string
  c3: string
}

export function mapSiriOrbColors(colors: LiveOrbPaletteColors, active: boolean): SiriOrbColorMap {
  const [c1, c2, c3] = boostPaletteColors(colors, active)
  return {
    bg: active ? lightenHex(c1, 0.72) : lightenHex(c1, 0.82),
    c1,
    c2,
    c3,
  }
}

/** Same hash as agent-avatar — used to align hue-rotate tint with seed palette. */
function hashSeed(str: string): number {
  let hash = 0
  for (const char of str) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  }
  return Math.abs(hash)
}

function seedBaseHue(seed: string): number {
  let state = hashSeed(seed)
  state = (state + 0x6d_2b_79_f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return (((t ^ (t >>> 14)) >>> 0) / 4_294_967_296) * 360
}

const AGENT_AVATAR_SEED = "Orbit Live"

export function mapAgentAvatarFilter(colors: LiveOrbPaletteColors, active: boolean): string {
  const targetHue = hexToHue(colors[0])
  const baseHue = seedBaseHue(AGENT_AVATAR_SEED)
  const hueShift = targetHue - baseHue
  const sat = active ? 1.22 : 1.08
  const bright = active ? 1.06 : 1.0
  return `hue-rotate(${hueShift.toFixed(1)}deg) saturate(${sat}) brightness(${bright})`
}

export type CloudWaveOrbColorMap = {
  main: [number, number, number]
  low:  [number, number, number]
  mid:  [number, number, number]
  high: [number, number, number]
}

function hexToUnitRgb(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  return [r / 255, g / 255, b / 255]
}

export function mapCloudWaveOrbColors(colors: LiveOrbPaletteColors, active: boolean): CloudWaveOrbColorMap {
  const [c1, c2, c3] = boostPaletteColors(colors, active)
  const main = hexToUnitRgb(lightenHex(c1, active ? 0.35 : 0.45))
  const low = hexToUnitRgb(mixHex(c1, c2, 0.35))
  const mid = hexToUnitRgb(mixHex(c2, c3, 0.5))
  const high = hexToUnitRgb(lightenHex(c3, active ? 0.42 : 0.5))
  return { main, low, mid, high }
}

export function mapOrbBloomFilter(
  style: "energy-orb" | "siri-orb" | "cloud-wave-orb",
  colors: LiveOrbPaletteColors,
  active: boolean,
  amplitude: number,
): string | undefined {
  const [c1, c2, c3] = boostPaletteColors(colors, active)
  const [r1, g1, b1] = hexToRgb(c1)
  const [r2, g2, b2] = hexToRgb(c2)

  if (style === "energy-orb") {
    const a1 = active ? 0.25 + amplitude * 0.4 : 0.45
    const a2 = active ? 0.15 + amplitude * 0.2 : 0.25
    const spread1 = active ? 10 + amplitude * 14 : 8
    const spread2 = active ? 4 + amplitude * 6 : 3
    return `drop-shadow(0 0 ${spread1}px rgba(${r1},${g1},${b1},${a1})) drop-shadow(0 0 ${spread2}px rgba(${r2},${g2},${b2},${a2}))`
  }

  if (style === "cloud-wave-orb") {
    const highlight = lightenHex(c3, 0.35)
    const [rh, gh, bh] = hexToRgb(highlight)
    const a1 = active ? 0.32 + amplitude * 0.18 : 0.38
    const a2 = active ? 0.18 + amplitude * 0.12 : 0.25
    const spread1 = active ? 8 + amplitude * 10 : 6
    const spread2 = active ? 3 + amplitude * 5 : 2
    return `drop-shadow(0 0 ${spread1}px rgba(${r1},${g1},${b1},${a1})) drop-shadow(0 0 ${spread2}px rgba(${rh},${gh},${bh},${a2}))`
  }

  const mid = mixHex(c2, c3, 0.5)
  const [rm, gm, bm] = hexToRgb(mid)
  const a = active ? 0.28 + amplitude * 0.12 : 0.28
  const spread = active ? 6 + amplitude * 8 : 4
  return `drop-shadow(0 0 ${spread}px rgba(${rm},${gm},${bm},${a}))`
}

export function paletteGradientCss(colors: LiveOrbPaletteColors): string {
  return `linear-gradient(90deg, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%)`
}

/** Boosted palette stops for response-glow effects. */
export function mapResponseGlowColors(colors: LiveOrbPaletteColors): string[] {
  const [c0, c1, c2] = boostPaletteColors(colors, true)
  return [c0, c1, c2, c0]
}

/** Fixed-angle iridescent gradient — animate background-position, not transform. */
export function responseGlowBorderGradient(colors: LiveOrbPaletteColors): string {
  const [c0, c1, c2] = boostPaletteColors(colors, true)
  return `linear-gradient(115deg, ${c0} 0%, ${c1} 26%, ${c2} 52%, ${c1} 78%, ${c0} 100%)`
}

export type PanelGlowColorMap = {
  /** Spinning border: highlight → c1 → c2 → c3 → highlight */
  borderStops:  readonly [string, string, string, string]
  /** Wide bloom layer — full palette cycle */
  layer1Colors: readonly [string, string, string]
  /** Tight rim layer — mid + accent */
  layer2Colors: readonly [string, string]
}

/** SidePanel AnimatedGlow — orb palette drives border + both blur layers. */
export function mapPanelGlowColors(colors: LiveOrbPaletteColors): PanelGlowColorMap {
  const [c1, c2, c3] = boostPaletteColors(colors, true)
  const highlight = lightenHex(c1, 0.78)
  return {
    borderStops:  [highlight, c1, c2, c3],
    layer1Colors: [c1, c2, c3],
    layer2Colors: [mixHex(c1, c2, 0.4), c3],
  }
}
