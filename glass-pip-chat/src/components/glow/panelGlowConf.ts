/** Web port of react-native-animated-glow presets (SidePanel border glow). */

import {
  DEFAULT_LIVE_ORB_PALETTE,
  boostPaletteColors,
  hexToRgb,
  mapPanelGlowColors,
  resolvePaletteColors,
  rgbToHex,
  type LiveOrbPaletteColors,
} from "./livePalette"
import type { PanelGlowStyle } from "./styles"

export const PANEL_GLOW_FADE_IN_MS = 520
export const PANEL_GLOW_FADE_OUT_MS = 520

/** One full border spin at animationSpeed=1 (matches RN builder default feel). */
export const PANEL_GLOW_ROTATION_S = 4

/**
 * Settings style-picker tiles are ~68×44px. The same absolute px blur/spread that reads
 * as a subtle edge ring on SidePanel fills most of a preview tile (dual-pass halos stack),
 * so scale down opacity and spread in preview only.
 */
export const PANEL_GLOW_PREVIEW_APPEARANCE_SCALE = 0.58

export type GlowLayerPlacement = "behind" | "over"

export type PanelGlowLayerDef = {
  placement?:       GlowLayerPlacement
  colors?:          readonly string[] | "palette"
  glowSize:          number | readonly number[]
  opacity:           number
  speedMultiplier?:  number
  coverage?:         number
  relativeOffset?:   number
  reverseAngle?:     boolean
}

export type PanelGlowPresetDef = {
  cornerRadius:           number
  outlineWidth:           number
  backgroundColor:          string
  animationSpeed:           number
  borderSpeedMultiplier?:   number
  borderColor?:             string | readonly string[] | "palette"
  glowLayers:               PanelGlowLayerDef[]
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

function parseColorToHex(color: string): string {
  const c = color.trim()
  if (c === "transparent") return "transparent"
  if (/^#[0-9a-f]{3,8}$/i.test(c)) return c.toLowerCase()
  const rgb = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (rgb) {
    return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]))
  }
  return c
}

function tintPresetColors(
  presetColors: readonly string[],
  orb: LiveOrbPaletteColors,
  weight = 0.45,
): string[] {
  const [c1, c2, c3] = boostPaletteColors(orb, true)
  const palette = [c1, c2, c3, lightenHex(c1, 0.72)]
  return presetColors.map((color, i) => {
    if (color === "transparent") return "transparent"
    const base = parseColorToHex(color)
    if (base === "transparent") return "transparent"
    return mixHex(base, palette[i % palette.length], weight)
  })
}

function paletteLayerColors(orb: LiveOrbPaletteColors, count: number): string[] {
  const mapped = mapPanelGlowColors(orb)
  const cycle = [...mapped.layer1Colors, mapped.layer2Colors[0], mapped.layer2Colors[1]]
  return Array.from({ length: count }, (_, i) => cycle[i % cycle.length])
}

function cloudLayerColors(orb: LiveOrbPaletteColors): string[] {
  const [c1, c2, c3] = boostPaletteColors(orb, true)
  return [lightenHex(c1, 0.62), lightenHex(c2, 0.68), lightenHex(c3, 0.62)]
}

function spotlightLayerColors(orb: LiveOrbPaletteColors, warm: string): string[] {
  const [c1] = boostPaletteColors(orb, true)
  return [mixHex(warm, lightenHex(c1, 0.55), 0.25)]
}

export const PANEL_GLOW_PRESETS: Record<PanelGlowStyle, PanelGlowPresetDef> = {
  default: {
    cornerRadius:    10,
    outlineWidth:    4,
    backgroundColor: "#222",
    animationSpeed:  1,
    borderColor:     "palette",
    glowLayers: [
      { glowSize: [8, 30], opacity: 0.6 },
      { glowSize: 4, opacity: 1 },
    ],
  },
  "violet-bloom": {
    cornerRadius:    10,
    outlineWidth:    3,
    backgroundColor: "#222",
    animationSpeed:  2,
    borderSpeedMultiplier: 1,
    borderColor: [
      "rgba(255, 171, 203, 1)",
      "rgba(112, 49, 164, 1)",
      "rgba(35, 21, 50, 1)",
    ],
    glowLayers: [
      {
        placement: "behind",
        colors: ["#483D8B", "#8A2BE2", "#9370DB"],
        glowSize: 20,
        opacity: 0.1,
      },
      {
        placement: "behind",
        colors: [
          "rgba(185, 185, 250, 1)",
          "rgba(199, 129, 199, 1)",
          "rgba(77, 61, 175, 1)",
        ],
        glowSize: [2, 6],
        opacity: 0.6,
      },
      {
        placement: "over",
        colors: ["rgba(185, 185, 250, 1)", "rgba(225, 133, 242, 1)"],
        glowSize: [0, 12],
        opacity: 0.05,
        speedMultiplier: 1.2,
        coverage: 0.5,
      },
      {
        placement: "over",
        colors: ["rgba(185, 185, 250, 1)", "rgba(255, 140, 255, 1)"],
        glowSize: [0, 1],
        opacity: 1,
        speedMultiplier: 1.2,
        coverage: 0.3,
        relativeOffset: 0.9,
      },
    ],
  },
  nebula: {
    cornerRadius:    90,
    outlineWidth:    0,
    backgroundColor: "rgba(10, 10, 10, 1)",
    animationSpeed:  1,
    borderColor:     "rgba(0, 0, 0, 1)",
    glowLayers: [
      {
        placement: "behind",
        colors: ["rgba(145, 46, 166, 1)", "#5a4ff9"],
        glowSize: [30, 40, 30],
        opacity: 0.1,
      },
      {
        placement: "behind",
        colors: ["rgba(190, 84, 245, 1)", "rgba(88, 47, 236, 1)"],
        glowSize: 1,
        opacity: 0.5,
      },
      {
        placement: "over",
        colors: ["rgba(194, 106, 255, 1)", "rgba(226, 114, 255, 1)"],
        glowSize: [0, 30],
        opacity: 0.05,
        speedMultiplier: 2,
        coverage: 0.6,
      },
      {
        placement: "behind",
        colors: ["rgba(0, 0, 0, 1)", "rgba(255, 118, 118, 1)"],
        glowSize: [0, 1],
        opacity: 1,
        speedMultiplier: 2,
        coverage: 0.5,
      },
    ],
  },
  "neon-pulse": {
    cornerRadius:    10,
    outlineWidth:    0,
    backgroundColor: "rgba(0, 0, 0, 1)",
    animationSpeed:  2,
    borderColor:     "white",
    glowLayers: [
      {
        placement: "behind",
        colors: ["rgba(255, 75, 169, 1)", "#01CDFE", "#05ffd2", "transparent", "transparent"],
        glowSize: 5,
        opacity: 0.5,
      },
      {
        placement: "behind",
        colors: ["rgba(255, 76, 156, 1)", "#01CDFE", "#05ffd2", "transparent", "transparent"],
        glowSize: 10,
        opacity: 0.5,
      },
      {
        placement: "behind",
        colors: ["#66d3ff", "#ff67ef"],
        glowSize: 4,
        opacity: 0.9,
        speedMultiplier: 0.8,
      },
    ],
  },
  cloud: {
    cornerRadius:    60,
    outlineWidth:    0,
    backgroundColor: "#222",
    animationSpeed:  0.6,
    borderSpeedMultiplier: 1,
    borderColor:     "white",
    glowLayers: [
      { colors: "palette", glowSize: [0, 5],  opacity: 0.1, speedMultiplier: 1,   coverage: 0.6, relativeOffset: 0   },
      { colors: "palette", glowSize: [0, 8],  opacity: 0.2, speedMultiplier: 1.5, coverage: 0.6, relativeOffset: 0.1 },
      { colors: "palette", glowSize: [0, 5],  opacity: 0.34, speedMultiplier: 1,  coverage: 0.6, relativeOffset: 0.2 },
      { colors: "palette", glowSize: [0, 7],  opacity: 0.2, speedMultiplier: 1.3, coverage: 0.5, relativeOffset: 0.5 },
      { colors: "palette", glowSize: [0, 3],  opacity: 0.2, speedMultiplier: 1,   coverage: 0.5, relativeOffset: 0.6 },
      { colors: "palette", glowSize: [0, 5],  opacity: 0.3, speedMultiplier: 1,   coverage: 0.5, relativeOffset: 0.8 },
      { colors: "palette", glowSize: 20,      opacity: 0.1, speedMultiplier: 1,   coverage: 1,   relativeOffset: 0   },
    ],
  },
  spotlight: {
    cornerRadius:    10,
    outlineWidth:    0,
    backgroundColor: "#222",
    animationSpeed:  -1,
    borderSpeedMultiplier: 1,
    borderColor:     "rgb(179,179,179)",
    glowLayers: [
      { colors: ["#ffffff"], glowSize: [0, 30], opacity: 0.2, coverage: 0.6 },
      { colors: ["rgb(255,197,150)"], glowSize: [0, 20], opacity: 0.3 },
      { colors: ["rgb(245,224,207)"], glowSize: [0, 5],  opacity: 0.5 },
      { placement: "over", colors: ["rgb(245,224,207)"], glowSize: [0, 5], opacity: 0.2, relativeOffset: 0.5 },
      { colors: ["#ffffff"], glowSize: 1, opacity: 1, coverage: 1 },
      { colors: ["rgb(245,224,207)"], glowSize: 4, opacity: 0.5, coverage: 1 },
      { colors: ["rgb(255,239,178)"], glowSize: 20, opacity: 0.1, coverage: 1 },
    ],
  },
}

/** @deprecated Use PANEL_GLOW_PRESETS.default */
export const PANEL_GLOW_PRESET = PANEL_GLOW_PRESETS.default

export type ResolvedGlowLayer = {
  placement:        GlowLayerPlacement
  colors:           readonly string[]
  glowSizeMin:      number
  glowSizeMax:      number
  glowSizeMid:      number | null
  opacity:          number
  speedMultiplier:  number
  coverage:         number
  relativeOffset:   number
  reverseAngle:     boolean
}

export type ResolvedPanelGlow = {
  cornerRadius:          number
  outlineWidth:          number
  backgroundColor:       string
  animationSpeed:        number
  borderSpeedMultiplier: number
  borderStops:           readonly string[] | null
  layers:                ResolvedGlowLayer[]
}

function resolveGlowSize(size: number | readonly number[]): {
  min: number
  max: number
  mid: number | null
} {
  if (typeof size === "number") return { min: size, max: size, mid: null }
  if (size.length === 1) return { min: size[0], max: size[0], mid: null }
  if (size.length === 2) return { min: size[0], max: size[1], mid: null }
  return { min: size[0], max: size[2], mid: size[1] }
}

function resolveLayerColors(
  styleId: PanelGlowStyle,
  layer: PanelGlowLayerDef,
  orb: LiveOrbPaletteColors,
  layerIndex: number,
): string[] {
  if (layer.colors === "palette" || styleId === "default") {
    if (styleId === "cloud") return cloudLayerColors(orb)
    if (styleId === "default") {
      const mapped = mapPanelGlowColors(orb)
      return layerIndex === 0
        ? [...mapped.layer1Colors]
        : [...mapped.layer2Colors]
    }
    return paletteLayerColors(orb, 3)
  }

  if (styleId === "spotlight") {
    const warm = layer.colors?.[0] ?? "#ffffff"
    return spotlightLayerColors(orb, parseColorToHex(warm))
  }

  if (styleId === "neon-pulse") {
    const [c1, c2, c3] = boostPaletteColors(orb, true)
    const neon = [c1, c2, c3, "transparent", "transparent"]
    return (layer.colors ?? []).map((color, i) => {
      if (color === "transparent") return "transparent"
      return mixHex(parseColorToHex(color), neon[i % neon.length], 0.5)
    })
  }

  return tintPresetColors(layer.colors ?? [], orb)
}

function resolveBorderStops(
  styleId: PanelGlowStyle,
  preset: PanelGlowPresetDef,
  orb: LiveOrbPaletteColors,
): readonly string[] | null {
  if (preset.outlineWidth <= 0) return null
  if (preset.borderColor === "palette" || styleId === "default") {
    return mapPanelGlowColors(orb).borderStops
  }
  if (typeof preset.borderColor === "string") {
    const base = parseColorToHex(preset.borderColor)
    const tinted = tintPresetColors([base], orb, 0.3)[0]
    return [lightenHex(tinted, 0.35), tinted, tinted, lightenHex(tinted, 0.35)]
  }
  if (!Array.isArray(preset.borderColor)) return null
  const tinted = tintPresetColors(preset.borderColor, orb, 0.4)
  const [a, b, c] = tinted
  return [lightenHex(a, 0.5), a, b, c]
}

export function getPanelGlowPreset(styleId: PanelGlowStyle = "default"): PanelGlowPresetDef {
  return PANEL_GLOW_PRESETS[styleId] ?? PANEL_GLOW_PRESETS.default
}

export function resolvePanelGlowColors(
  styleId: PanelGlowStyle = "default",
  orb?: LiveOrbPaletteColors,
): ResolvedPanelGlow {
  const colors = orb ?? resolvePaletteColors(DEFAULT_LIVE_ORB_PALETTE)
  const preset = getPanelGlowPreset(styleId)
  const borderStops = resolveBorderStops(styleId, preset, colors)

  const layers: ResolvedGlowLayer[] = preset.glowLayers.map((layer, index) => {
    const { min, max, mid } = resolveGlowSize(layer.glowSize)
    return {
      placement:       layer.placement ?? "behind",
      colors:          resolveLayerColors(styleId, layer, colors, index),
      glowSizeMin:     min,
      glowSizeMax:     max,
      glowSizeMid:     mid,
      opacity:         layer.opacity,
      speedMultiplier: layer.speedMultiplier ?? 1,
      coverage:        layer.coverage ?? 1,
      relativeOffset:  layer.relativeOffset ?? 0,
      reverseAngle:    layer.reverseAngle ?? false,
    }
  })

  return {
    cornerRadius:          preset.cornerRadius,
    outlineWidth:          preset.outlineWidth,
    backgroundColor:       preset.backgroundColor,
    animationSpeed:        preset.animationSpeed,
    borderSpeedMultiplier: preset.borderSpeedMultiplier ?? 1,
    borderStops,
    layers,
  }
}
