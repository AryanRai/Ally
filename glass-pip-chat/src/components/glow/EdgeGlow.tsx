import { boostPalette, type GlowPalette } from './palette';

interface EdgeGlowProps {
  active: boolean;
  colors: GlowPalette;
}

// Keep only the padding ring of an element (the border band), like a gradient border
const RING_MASK = {
  WebkitMask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
  mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
} as React.CSSProperties;

// Mary's glow is bottom-weighted: faint along the top, strongest near the composer
const BOTTOM_WEIGHT = {
  WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.55) 45%, #000)',
  maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.55) 45%, #000)',
} as React.CSSProperties;

/**
 * The side glow from Orbit's Mary panel, drawn inside the window edge (Ally's
 * window has no room for an outward halo): a spinning gradient rim plus a soft
 * blurred bloom, shown while the agent is working.
 */
export default function EdgeGlow({ active, colors }: EdgeGlowProps) {
  const [c0, c1, c2] = boostPalette(colors, true);
  const gradient = `conic-gradient(from var(--edge-angle), ${c0}, ${c1}, ${c2}, ${c1}, ${c0})`;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] transition-opacity duration-500"
      style={{ opacity: active ? 1 : 0, ...BOTTOM_WEIGHT }}
    >
      {/* Soft inner bloom */}
      <div
        className="absolute inset-0 animate-[edge-spin_4.5s_linear_infinite] rounded-[inherit] p-[12px] opacity-60 blur-[10px]"
        style={{ background: gradient, ...RING_MASK }}
      />
      {/* Crisp rim */}
      <div
        className="absolute inset-0 animate-[edge-spin_4.5s_linear_infinite] rounded-[inherit] p-[1.5px]"
        style={{ background: gradient, ...RING_MASK }}
      />
    </div>
  );
}
