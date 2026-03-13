/**
 * AIBackdrop — Gemini-style animated glow that sits behind the glass panel.
 *
 * Three blurred radial-gradient orbs are absolutely-positioned and animated
 * with Framer Motion variants per AI state.  No canvas, no WebGL — pure CSS
 * with Framer Motion. All opacity values are intentionally low so the glass
 * effect is never obscured.
 */

import { motion, Transition } from 'framer-motion';

export interface AIBackdropProps {
  state: 'idle' | 'thinking' | 'streaming' | 'tool_executing' | 'speaking';
  intensity?: number; // 0–1 multiplier applied on top of per-state opacity
}

type OrbState = AIBackdropProps['state'];

interface OrbStyle {
  background: string;
  opacity: number | number[];
  scale: number | number[];
  x?: number | number[];
  y?: number | number[];
  transition?: Transition & { delay?: number };
}

const orbVariants: Record<OrbState, OrbStyle[]> = {
  idle: [
    {
      background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 70%)',
      opacity: [0.03, 0.05, 0.03],
      scale: [1, 1.04, 1],
      transition: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)',
      opacity: [0.02, 0.04, 0.02],
      scale: [1, 1.03, 1],
      transition: { duration: 10, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(147,51,234,0.35) 0%, transparent 70%)',
      opacity: [0.02, 0.03, 0.02],
      scale: [1, 1.02, 1],
      transition: { duration: 12, repeat: Infinity, ease: 'easeInOut' },
    },
  ],
  thinking: [
    {
      background: 'radial-gradient(circle, rgba(139,92,246,0.8) 0%, rgba(109,40,217,0.4) 50%, transparent 70%)',
      opacity: [0.10, 0.14, 0.10],
      scale: [1, 1.3, 1],
      x: [-10, 10, -10],
      transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(167,139,250,0.7) 0%, rgba(139,92,246,0.3) 50%, transparent 70%)',
      opacity: [0.08, 0.12, 0.08],
      scale: [1, 1.2, 1],
      y: [-8, 8, -8],
      transition: { duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 },
    },
    {
      background: 'radial-gradient(circle, rgba(196,181,253,0.6) 0%, rgba(139,92,246,0.2) 50%, transparent 70%)',
      opacity: [0.06, 0.10, 0.06],
      scale: [1, 1.15, 1],
      transition: { duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 },
    },
  ],
  streaming: [
    {
      background: 'radial-gradient(circle, rgba(59,130,246,0.7) 0%, rgba(6,182,212,0.4) 50%, transparent 70%)',
      opacity: [0.07, 0.11, 0.07],
      scale: [1, 1.15, 1],
      x: [-15, 15, -15],
      transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(34,211,238,0.6) 0%, rgba(59,130,246,0.3) 50%, transparent 70%)',
      opacity: [0.06, 0.10, 0.06],
      scale: [1, 1.12, 1],
      y: [-12, 12, -12],
      transition: { duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 },
    },
    {
      background: 'radial-gradient(circle, rgba(96,165,250,0.55) 0%, rgba(34,211,238,0.2) 50%, transparent 70%)',
      opacity: [0.05, 0.09, 0.05],
      scale: [1, 1.1, 1],
      transition: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
    },
  ],
  tool_executing: [
    {
      background: 'radial-gradient(circle, rgba(245,158,11,0.8) 0%, rgba(217,119,6,0.4) 50%, transparent 70%)',
      opacity: [0.12, 0.17, 0.12],
      scale: [1, 1.4, 1],
      x: [-8, 8, -8],
      transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(251,191,36,0.7) 0%, rgba(245,158,11,0.35) 50%, transparent 70%)',
      opacity: [0.10, 0.15, 0.10],
      scale: [1, 1.3, 1],
      y: [-10, 10, -10],
      transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.2 },
    },
    {
      background: 'radial-gradient(circle, rgba(252,211,77,0.65) 0%, rgba(245,158,11,0.25) 50%, transparent 70%)',
      opacity: [0.08, 0.13, 0.08],
      scale: [1, 1.2, 1],
      transition: { duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 },
    },
  ],
  speaking: [
    {
      background: 'radial-gradient(circle, rgba(16,185,129,0.7) 0%, rgba(5,150,105,0.35) 50%, transparent 70%)',
      opacity: [0.06, 0.10, 0.06],
      scale: [1, 1.2, 1],
      y: [-6, 6, -6],
      transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(52,211,153,0.6) 0%, rgba(16,185,129,0.3) 50%, transparent 70%)',
      opacity: [0.05, 0.08, 0.05],
      scale: [1, 1.15, 1],
      x: [-4, 4, -4],
      transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.2 },
    },
    {
      background: 'radial-gradient(circle, rgba(110,231,183,0.55) 0%, rgba(16,185,129,0.2) 50%, transparent 70%)',
      opacity: [0.04, 0.07, 0.04],
      scale: [1, 1.1, 1],
      transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 },
    },
  ],
};

const ORB_POSITIONS = [
  { left: '-10%', top: '55%' },
  { right: '-5%', top: '25%' },
  { left: '35%', top: '-8%' },
];

export default function AIBackdrop({ state, intensity = 1 }: AIBackdropProps) {
  const variants = orbVariants[state] ?? orbVariants.idle;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        borderRadius: 'inherit',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {ORB_POSITIONS.map((pos, i) => {
        const v = variants[i];
        const opacityArr = Array.isArray(v.opacity) ? v.opacity.map((o) => o * intensity) : v.opacity * intensity;
        return (
          <motion.div
            key={i}
            style={{
              position: 'absolute',
              width: '24rem', // w-96
              height: '24rem', // h-96
              borderRadius: '9999px',
              background: v.background,
              filter: 'blur(64px)', // blur-3xl
              mixBlendMode: 'screen',
              ...pos,
            }}
            animate={{
              opacity: opacityArr,
              scale: v.scale,
              x: v.x,
              y: v.y,
            }}
            transition={v.transition}
          />
        );
      })}
    </div>
  );
}
