
import * as React from "react"

import type { LiveOrbPaletteColors } from "./livePalette"
import type { PanelGlowStyle } from "./styles"
import {
  PANEL_GLOW_FADE_IN_MS,
  PANEL_GLOW_FADE_OUT_MS,
  PANEL_GLOW_PREVIEW_APPEARANCE_SCALE,
  PANEL_GLOW_ROTATION_S,
  resolvePanelGlowColors,
  type ResolvedGlowLayer,
} from "./panelGlowConf"

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function buildConicGradient(
  angleDeg: number,
  colors: readonly string[],
  coverage: number,
): string {
  const usable = colors.filter(c => c !== "transparent")
  if (usable.length === 0) return "transparent"
  if (usable.length === 1) return usable[0]

  const span = Math.max(0.08, Math.min(1, coverage)) * 360
  const stops = usable.map((color, i) => {
    const pct = (i / Math.max(1, usable.length - 1)) * span
    return `${color} ${pct.toFixed(1)}deg`
  })
  stops.push(`${usable[0]} ${span.toFixed(1)}deg`)
  stops.push(`transparent ${span.toFixed(1)}deg`)
  stops.push("transparent 360deg")
  return `conic-gradient(from ${angleDeg.toFixed(2)}deg, ${stops.join(", ")})`
}

function animatedSpread(layer: ResolvedGlowLayer, angleDeg: number): number {
  const { glowSizeMin, glowSizeMax, glowSizeMid } = layer
  if (glowSizeMin === glowSizeMax && glowSizeMid == null) return glowSizeMax

  const phase = ((angleDeg % 360) + 360) % 360 / 360
  if (glowSizeMid != null) {
    const t = phase
    if (t < 0.5) return glowSizeMin + (glowSizeMid - glowSizeMin) * (t * 2)
    return glowSizeMid + (glowSizeMax - glowSizeMid) * ((t - 0.5) * 2)
  }

  const wave = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)
  return glowSizeMin + (glowSizeMax - glowSizeMin) * wave
}

function layerAngle(
  baseAngle: number,
  layer: ResolvedGlowLayer,
  reverseSpin: boolean,
): number {
  const dir = layer.reverseAngle ? -1 : 1
  const spin = reverseSpin ? -1 : 1
  const offset = layer.relativeOffset * 360
  return baseAngle * dir * spin * layer.speedMultiplier + offset
}

/** Native Skia uses gaussian(abs(d), 0, glowSize) — map glowSize → blur sigma. */
function haloBlurPx(spread: number, outward: boolean): number {
  if (spread <= 0) return outward ? 3 : 2
  const sigma = outward ? 1.05 : 0.92
  return Math.max(outward ? 4 : 3, Math.round(spread * sigma))
}

const EDGE_MASK =
  "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)" as const

export type AnimatedPanelGlowWebProps = {
  active:        boolean
  colors?:       LiveOrbPaletteColors
  styleId?:      PanelGlowStyle
  borderRadius?: number
  preview?:      boolean
  /** User dial 0–1 — scales layer opacity and blur/spread. Default 1 (full). */
  intensity?:    number
  /** Ally: the window is the panel, so draw every halo inside its edge instead of outside */
  inward?:       boolean
  children?:     React.ReactNode
}

/**
 * CSS port of react-native-animated-glow for SidePanel:
 * SDF-style Gaussian halos (heavy blur + stacked layers), not flat conic rings.
 */
export function AnimatedPanelGlowWeb({
  active,
  colors,
  styleId = "default",
  borderRadius,
  preview = false,
  intensity = 1,
  inward = false,
  children,
}: AnimatedPanelGlowWebProps) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const rafRef = React.useRef(0)
  const intensityRef = React.useRef(preview ? 1 : 0)
  const angleRef = React.useRef(0)
  const animStartRef = React.useRef(0)
  const animFromRef = React.useRef(0)
  const animToRef = React.useRef(0)
  const animDurationRef = React.useRef(0)
  const activeRef = React.useRef(active || preview)
  const reducedMotionRef = React.useRef(false)

  const glowStrength = Math.max(0, Math.min(1, intensity))
  const previewScale = preview ? PANEL_GLOW_PREVIEW_APPEARANCE_SCALE : 1
  const renderStrength = glowStrength * previewScale

  const resolved = React.useMemo(
    () => resolvePanelGlowColors(styleId, colors),
    [styleId, colors],
  )

  const panelRadius = borderRadius ?? resolved.cornerRadius
  const outline = resolved.outlineWidth
  const outerRadius = panelRadius + outline

  React.useEffect(() => {
    if (preview) return
    activeRef.current = active
    animStartRef.current = performance.now()
    animFromRef.current = intensityRef.current
    animToRef.current = active ? 1 : 0
    animDurationRef.current = active ? PANEL_GLOW_FADE_IN_MS : PANEL_GLOW_FADE_OUT_MS
  }, [active, preview])

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => { reducedMotionRef.current = mq.matches }
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const speed = Math.abs(resolved.animationSpeed) || 1
    const reverseSpin = resolved.animationSpeed < 0
    const rotationPeriodMs =
      (PANEL_GLOW_ROTATION_S / speed) * 1000 / (resolved.borderSpeedMultiplier || 1)

    const tick = (now: number) => {
      if (!preview) {
        const elapsed = now - animStartRef.current
        const dur = animDurationRef.current
        const t = dur > 0 ? Math.min(1, elapsed / dur) : 1
        intensityRef.current =
          animFromRef.current + (animToRef.current - animFromRef.current) * easeInOutCubic(t)
      }

      const reduced = reducedMotionRef.current
      if (!reduced) {
        const step = reverseSpin ? -1 : 1
        angleRef.current = (angleRef.current + step * (360 / rotationPeriodMs) * (1000 / 60)) % 360
      }

      const fade = preview
        ? 1
        : reduced && activeRef.current
          ? Math.max(intensityRef.current, 0.85)
          : intensityRef.current

      root.style.setProperty("--panel-glow-intensity", String(fade))
      root.style.setProperty("--panel-glow-angle", `${angleRef.current}deg`)

      resolved.layers.forEach((layer, index) => {
        const spread = animatedSpread(layer, angleRef.current) * renderStrength
        const angle = layerAngle(angleRef.current, layer, reverseSpin)
        root.style.setProperty(`--panel-glow-layer-${index}-spread`, `${spread}px`)
        root.style.setProperty(
          `--panel-glow-layer-${index}-gradient`,
          buildConicGradient(angle, layer.colors, layer.coverage),
        )
      })

      if (resolved.borderStops) {
        root.style.setProperty(
          "--panel-glow-border-gradient",
          buildConicGradient(
            angleRef.current,
            [...resolved.borderStops, resolved.borderStops[0]],
            1,
          ),
        )
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [preview, resolved, renderStrength])

  const behindLayers = resolved.layers.filter(l => l.placement === "behind")
  const overLayers = resolved.layers.filter(l => l.placement === "over")

  const contentZIndex = 1
  const borderZIndex = 2
  const outwardOverZ = 3

  const layerOpacityExpr = (opacity: number) => {
    const scaled = opacity * renderStrength
    return preview
      ? String(scaled)
      : `calc(${scaled} * var(--panel-glow-intensity, 0))`
  }

  /** Outward "behind" halos: full fill + heavy blur, no ring mask (matches Skia gaussian bleed). */
  const renderOutwardHalo = (layer: ResolvedGlowLayer, globalIndex: number) => {
    const spreadVar = `var(--panel-glow-layer-${globalIndex}-spread, ${layer.glowSizeMax}px)`
    const gradientVar = `var(--panel-glow-layer-${globalIndex}-gradient, transparent)`
    const blurPx = haloBlurPx(layer.glowSizeMax * renderStrength, true)
    const bleed = `calc(${spreadVar} + ${blurPx}px)`

    return (
      <div
        key={`glow-outward-${globalIndex}`}
        aria-hidden
        style={{
          position:      "absolute",
          inset:         `calc(-1 * ${bleed})`,
          borderRadius:  `calc(${outerRadius}px + ${bleed})`,
          background:    gradientVar,
          filter:        `blur(${blurPx}px)`,
          opacity:       layerOpacityExpr(layer.opacity),
          mixBlendMode:  "plus-lighter",
          pointerEvents: "none",
          zIndex:        0,
        }}
      />
    )
  }

  /** Outward "over" edge halos: dual-pass soft + core ring with XOR mask. */
  const renderEdgeHalo = (layer: ResolvedGlowLayer, globalIndex: number, zIndex: number) => {
    const spreadVar = `var(--panel-glow-layer-${globalIndex}-spread, ${layer.glowSizeMax}px)`
    const gradientVar = `var(--panel-glow-layer-${globalIndex}-gradient, transparent)`
    const scaledSize = layer.glowSizeMax * renderStrength
    const coreBlur = haloBlurPx(scaledSize, false)
    const softBlur = Math.max(coreBlur + 4, Math.round(scaledSize * 1.35))
    const softRing = `calc(${spreadVar} * 1.55 + ${Math.max(2, Math.round(scaledSize * 0.25))}px)`
    const blendMode = layer.placement === "over" ? "screen" : "plus-lighter"

    return (
      <React.Fragment key={`glow-edge-${globalIndex}`}>
        <div
          aria-hidden
          style={{
            position:            "absolute",
            inset:               0,
            borderRadius:        panelRadius,
            filter:              `blur(${softBlur}px)`,
            opacity:             layerOpacityExpr(layer.opacity * 0.42),
            mixBlendMode:        blendMode,
            pointerEvents:       "none",
            zIndex,
          }}
        >
          <div style={{ position: 'absolute', inset: 0, borderRadius: panelRadius, padding: softRing, background: gradientVar, WebkitMask: EDGE_MASK, WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />
        </div>
        <div
          aria-hidden
          style={{
            position:            "absolute",
            inset:               0,
            borderRadius:        panelRadius,
            filter:              `blur(${coreBlur}px)`,
            opacity:             layerOpacityExpr(layer.opacity),
            mixBlendMode:        blendMode,
            pointerEvents:       "none",
            zIndex,
          }}
        >
          <div style={{ position: 'absolute', inset: 0, borderRadius: panelRadius, padding: spreadVar, background: gradientVar, WebkitMask: EDGE_MASK, WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />
        </div>
      </React.Fragment>
    )
  }

  return (
    <div
      ref={rootRef}
      style={{
        position:      "relative",
        display:       "flex",
        flexDirection: "column",
        width:         "100%",
        height:        "100%",
        minHeight:     preview ? undefined : 0,
        isolation:     "isolate",
        overflow:      "visible",
        boxSizing:     "border-box",
        ["--panel-glow-intensity" as string]: preview ? String(renderStrength) : "0",
        ["--panel-glow-angle" as string]:     "0deg",
      }}
    >
      {resolved.layers.map((layer, index) => {
        if (layer.placement !== "behind") return null
        return inward ? renderEdgeHalo(layer, index, 0) : renderOutwardHalo(layer, index)
      })}

      {children && (
        <div
          style={{
            position:      "relative",
            zIndex:        contentZIndex,
            display:       "flex",
            flexDirection: "column",
            flex:          1,
            minHeight:     0,
            width:         "100%",
            height:        "100%",
          }}
        >
          {children}
        </div>
      )}

      {outline > 0 && resolved.borderStops && (
        <div
          aria-hidden
          style={{
            position:            "absolute",
            inset:               inward ? 0 : -outline,
            borderRadius:        inward ? panelRadius : outerRadius,
            padding:             outline,
            background:          "var(--panel-glow-border-gradient, transparent)",
            opacity:             preview
              ? renderStrength
              : `calc(${renderStrength} * var(--panel-glow-intensity, 0))`,
            WebkitMask:          EDGE_MASK,
            WebkitMaskComposite: "xor",
            maskComposite:       "exclude",
            pointerEvents:       "none",
            zIndex:              borderZIndex,
          }}
        />
      )}

      {resolved.layers.map((layer, index) => {
        if (layer.placement !== "over") return null
        return renderEdgeHalo(layer, index, outwardOverZ)
      })}

      {preview && behindLayers.length === 0 && overLayers.length === 0 && (
        <div
          aria-hidden
          style={{
            position:     "absolute",
            inset:        -4,
            borderRadius: outerRadius + 4,
            border:       "1px solid rgba(255,255,255,0.12)",
            opacity:      0.5 * renderStrength,
          }}
        />
      )}
    </div>
  )
}
