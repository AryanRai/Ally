
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
  const usable = colors
  if (usable.length === 0) return "transparent"
  if (usable.length === 1 && coverage >= 1) return usable[0]

  const span = Math.max(0.08, Math.min(1, coverage)) * 360
  const stops = usable.map((color, i) => {
    const phase = i / Math.max(1, coverage >= 1 ? usable.length : usable.length - 1)
    const pct = (coverage >= 1 ? phase : 0.08 + phase * 0.84) * span
    return `${color} ${pct.toFixed(1)}deg`
  })
  if (coverage < 1) {
    // Fade the exposed ends instead of cutting a hard wedge through the halo.
    stops.unshift("transparent 0deg")
    stops.push(`transparent ${span.toFixed(1)}deg`, "transparent 360deg")
  } else {
    stops.push(`${usable[0]} 360deg`)
  }
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
): number {
  const dir = layer.reverseAngle ? -1 : 1
  const offset = layer.relativeOffset * 360
  return baseAngle * dir * layer.speedMultiplier + offset
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

  // The host changes size when the sidebar/pill opens. Cap halo widths against
  // both dimensions so a short collapsed window never becomes a solid fill.
  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => {
      const { width, height } = root.getBoundingClientRect()
      root.style.setProperty("--panel-glow-limit", `${Math.max(0, Math.min(width, height) / 6)}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const target = active || preview ? 1 : 0
    const from = intensityRef.current
    const started = performance.now()
    const duration = target ? PANEL_GLOW_FADE_IN_MS : PANEL_GLOW_FADE_OUT_MS
    const rotationPeriodMs = PANEL_GLOW_ROTATION_S * 1000 /
      (Math.abs(resolved.animationSpeed) || 1) / (resolved.borderSpeedMultiplier || 1)
    let last = started

    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - started) / duration))
      intensityRef.current = preview ? 1 : from + (target - from) * easeInOutCubic(t)
      if (!mq.matches) {
        const step = resolved.animationSpeed < 0 ? -1 : 1
        const elapsed = Math.min(64, Math.max(0, now - last))
        angleRef.current = (angleRef.current + step * 360 * elapsed / rotationPeriodMs) % 360
      }
      last = now
      root.style.setProperty("--panel-glow-intensity", String(intensityRef.current))
      root.style.setProperty("--panel-glow-angle", `${angleRef.current}deg`)
      resolved.layers.forEach((layer, index) => {
        // Intensity dims the inward light, rather than shrinking it out of existence.
        const spread = animatedSpread(layer, layerAngle(angleRef.current, layer)) * (inward ? 1 : renderStrength)
        root.style.setProperty(`--panel-glow-layer-${index}-spread`, `${spread}px`)
        root.style.setProperty(`--panel-glow-layer-${index}-gradient`,
          buildConicGradient(layerAngle(angleRef.current, layer), layer.colors, layer.coverage))
      })
      if (resolved.borderStops) {
        root.style.setProperty("--panel-glow-border-gradient",
          buildConicGradient(angleRef.current, resolved.borderStops, 1))
      }
      // Idle, hidden and settled reduced-motion glows consume no animation frames.
      if (!document.hidden && renderStrength > 0 && (t < 1 || (target && !mq.matches))) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    const wake = () => {
      cancelAnimationFrame(rafRef.current)
      last = performance.now()
      tick(last)
    }
    mq.addEventListener("change", wake)
    document.addEventListener("visibilitychange", wake)
    wake()
    return () => {
      cancelAnimationFrame(rafRef.current)
      mq.removeEventListener("change", wake)
      document.removeEventListener("visibilitychange", wake)
    }
  }, [active, preview, resolved, renderStrength, inward])

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
    const spreadVar = `min(var(--panel-glow-layer-${globalIndex}-spread, 0px), var(--panel-glow-limit, 20px))`
    const gradientVar = `var(--panel-glow-layer-${globalIndex}-gradient, transparent)`
    const scaledSize = layer.glowSizeMax * renderStrength
    const coreBlur = inward ? `max(1px, calc(${spreadVar} * 0.7))` : `${haloBlurPx(scaledSize, false)}px`
    const softBlur = inward ? `max(3px, calc(${spreadVar} * 1.4))` : `${Math.max(7, Math.round(scaledSize * 1.35))}px`
    const softRing = `calc(${spreadVar} * 1.55 + 2px)`
    // Center the light on the edge. The window clips its outer half, leaving
    // the same soft Gaussian falloff as Mary's external halo inside Ally.
    const ringInset = inward ? `calc(-1 * ${spreadVar})` : 0
    const ringRadius = inward ? `calc(${panelRadius}px + ${spreadVar})` : panelRadius
    const ringWidth = inward ? `calc(${spreadVar} * 2)` : spreadVar
    const blendMode = layer.placement === "over" ? "screen" : "plus-lighter"

    return (
      <React.Fragment key={`glow-edge-${globalIndex}`}>
        <div
          aria-hidden
          style={{
            position:            "absolute",
            inset:               ringInset,
            borderRadius:        ringRadius,
            filter:              `blur(${softBlur})`,
            opacity:             layerOpacityExpr(layer.opacity * 0.42),
            mixBlendMode:        blendMode,
            pointerEvents:       "none",
            zIndex,
          }}
        >
          <div style={{ position: 'absolute', inset: 0, borderRadius: ringRadius, boxSizing: 'border-box', padding: inward ? ringWidth : softRing, background: gradientVar, WebkitMask: EDGE_MASK, WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />
        </div>
        <div
          aria-hidden
          style={{
            position:            "absolute",
            inset:               ringInset,
            borderRadius:        ringRadius,
            filter:              `blur(${coreBlur})`,
            opacity:             layerOpacityExpr(layer.opacity),
            mixBlendMode:        blendMode,
            pointerEvents:       "none",
            zIndex,
          }}
        >
          <div style={{ position: 'absolute', inset: 0, borderRadius: ringRadius, boxSizing: 'border-box', padding: ringWidth, background: gradientVar, WebkitMask: EDGE_MASK, WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />
        </div>
      </React.Fragment>
    )
  }

  return (
    <div
      ref={rootRef}
      data-panel-glow
      data-active={active || preview}
      style={{
        position:      "relative",
        display:       "flex",
        flexDirection: "column",
        width:         "100%",
        height:        "100%",
        minHeight:     preview ? undefined : 0,
        isolation:     "isolate",
        overflow:      inward ? "hidden" : "visible",
        borderRadius:  panelRadius,
        pointerEvents: children ? undefined : "none",
        boxSizing:     "border-box",
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
