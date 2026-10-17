import { useLook } from '@/lib/look';
import { AnimatedPanelGlowWeb } from './PanelGlow';

/** Windows 11 rounds frameless windows by 8px; the glow follows that edge. */
const WINDOW_RADIUS = 8;

/**
 * Orbit Mary's panel glow around Ally's window edge (style, palette and
 * intensity from Settings › Look), drawn inward since the window is the panel.
 */
export default function WindowGlow({ agentWorking, userTyping }: { agentWorking: boolean; userTyping: boolean }) {
  const { look, colors } = useLook();
  const active = (look.responseGlow && agentWorking) || (look.inputGlow && userTyping);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30" style={{ borderRadius: WINDOW_RADIUS }}>
      <AnimatedPanelGlowWeb
        active={active}
        inward
        colors={colors}
        styleId={look.glowStyle}
        borderRadius={WINDOW_RADIUS}
        intensity={look.glowIntensity / 100}
      />
    </div>
  );
}
