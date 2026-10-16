/**
 * AIBackdrop — glowy floating orbs inside the glass panel, visible when the AI is active.
 */

import { motion, Transition } from 'framer-motion';

export interface AIBackdropProps {
  state: 'idle' | 'thinking' | 'streaming' | 'tool_executing' | 'speaking';
  intensity?: number;
}

type OrbState = AIBackdropProps['state'];

interface OrbDef {
  background: string;
  opacity: number[];
  scale: number[];
  x?: number[];
  y?: number[];
  transition: Transition & { delay?: number };
}

const orbVariants: Record<OrbState, OrbDef[]> = {
  idle: [
    {
      background: 'radial-gradient(circle, rgba(139,92,246,0.6) 0%, transparent 70%)',
      opacity: [0.06, 0.10, 0.06],
      scale: [1, 1.05, 1],
      transition: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(99,102,241,0.5) 0%, transparent 70%)',
      opacity: [0.04, 0.08, 0.04],
      scale: [1, 1.04, 1],
      transition: { duration: 10, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(147,51,234,0.5) 0%, transparent 70%)',
      opacity: [0.03, 0.06, 0.03],
      scale: [1, 1.03, 1],
      transition: { duration: 12, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(59,130,246,0.4) 0%, transparent 70%)',
      opacity: [0.03, 0.05, 0.03],
      scale: [1, 1.03, 1],
      transition: { duration: 9, repeat: Infinity, ease: 'easeInOut' },
    },
  ],
  thinking: [
    {
      background: 'radial-gradient(circle, rgba(167,92,255,1) 0%, rgba(109,40,217,0.6) 40%, transparent 70%)',
      opacity: [0.30, 0.50, 0.30],
      scale: [1, 1.35, 1],
      x: [-20, 20, -20],
      transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(196,181,253,0.9) 0%, rgba(139,92,246,0.5) 40%, transparent 70%)',
      opacity: [0.22, 0.38, 0.22],
      scale: [1, 1.25, 1],
      y: [-15, 15, -15],
      transition: { duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
    },
    {
      background: 'radial-gradient(circle, rgba(139,92,246,0.8) 0%, rgba(99,102,241,0.4) 40%, transparent 70%)',
      opacity: [0.18, 0.30, 0.18],
      scale: [1, 1.2, 1],
      x: [10, -10, 10],
      transition: { duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1.2 },
    },
    {
      background: 'radial-gradient(circle, rgba(124,58,237,0.7) 0%, transparent 70%)',
      opacity: [0.15, 0.25, 0.15],
      scale: [1, 1.15, 1],
      y: [10, -10, 10],
      transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.3 },
    },
  ],
  streaming: [
    {
      background: 'radial-gradient(circle, rgba(56,189,248,1) 0%, rgba(6,182,212,0.6) 40%, transparent 70%)',
      opacity: [0.28, 0.45, 0.28],
      scale: [1, 1.3, 1],
      x: [-25, 25, -25],
      transition: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(99,102,241,0.9) 0%, rgba(139,92,246,0.5) 40%, transparent 70%)',
      opacity: [0.22, 0.38, 0.22],
      scale: [1, 1.22, 1],
      y: [-18, 18, -18],
      transition: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.4 },
    },
    {
      background: 'radial-gradient(circle, rgba(34,211,238,0.8) 0%, rgba(59,130,246,0.4) 40%, transparent 70%)',
      opacity: [0.18, 0.30, 0.18],
      scale: [1, 1.18, 1],
      x: [15, -15, 15],
      transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.8 },
    },
    {
      background: 'radial-gradient(circle, rgba(168,85,247,0.7) 0%, transparent 70%)',
      opacity: [0.14, 0.24, 0.14],
      scale: [1, 1.2, 1],
      y: [12, -12, 12],
      transition: { duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 1.0 },
    },
  ],
  tool_executing: [
    {
      background: 'radial-gradient(circle, rgba(251,191,36,1) 0%, rgba(217,119,6,0.6) 40%, transparent 70%)',
      opacity: [0.32, 0.52, 0.32],
      scale: [1, 1.45, 1],
      x: [-12, 12, -12],
      transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(249,115,22,0.9) 0%, rgba(245,158,11,0.5) 40%, transparent 70%)',
      opacity: [0.25, 0.42, 0.25],
      scale: [1, 1.35, 1],
      y: [-14, 14, -14],
      transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.2 },
    },
    {
      background: 'radial-gradient(circle, rgba(253,224,71,0.8) 0%, rgba(251,191,36,0.4) 40%, transparent 70%)',
      opacity: [0.20, 0.35, 0.20],
      scale: [1, 1.25, 1],
      transition: { duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 },
    },
    {
      background: 'radial-gradient(circle, rgba(245,158,11,0.7) 0%, transparent 70%)',
      opacity: [0.16, 0.28, 0.16],
      scale: [1, 1.2, 1],
      x: [8, -8, 8],
      transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
    },
  ],
  speaking: [
    {
      background: 'radial-gradient(circle, rgba(52,211,153,0.9) 0%, rgba(5,150,105,0.5) 40%, transparent 70%)',
      opacity: [0.24, 0.40, 0.24],
      scale: [1, 1.28, 1],
      y: [-10, 10, -10],
      transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
    },
    {
      background: 'radial-gradient(circle, rgba(20,184,166,0.8) 0%, rgba(16,185,129,0.4) 40%, transparent 70%)',
      opacity: [0.18, 0.32, 0.18],
      scale: [1, 1.22, 1],
      x: [-8, 8, -8],
      transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.2 },
    },
    {
      background: 'radial-gradient(circle, rgba(110,231,183,0.7) 0%, rgba(52,211,153,0.35) 40%, transparent 70%)',
      opacity: [0.14, 0.24, 0.14],
      scale: [1, 1.15, 1],
      transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 },
    },
    {
      background: 'radial-gradient(circle, rgba(16,185,129,0.6) 0%, transparent 70%)',
      opacity: [0.10, 0.18, 0.10],
      scale: [1, 1.12, 1],
      y: [8, -8, 8],
      transition: { duration: 1.3, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
    },
  ],
};

const ORB_POSITIONS = [
  { left: '-5%',  top: '50%'  },
  { right: '-5%', top: '20%'  },
  { left: '30%',  top: '-5%'  },
  { right: '15%', bottom: '-5%' },
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
        const opacityArr = v.opacity.map((o) => o * intensity);
        return (
          <motion.div
            key={i}
            style={{
              position: 'absolute',
              width: '28rem',
              height: '28rem',
              borderRadius: '9999px',
              background: v.background,
              filter: 'blur(72px)',
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
