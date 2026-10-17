// Ally's look: orb, glow, palette and robot styling in one persisted store, so
// the composer, the window glow, the pill and Settings all read the same values.
import { useCallback, useSyncExternalStore } from 'react';
import {
  LIVE_ORB_PALETTE_PRESETS,
  type LiveOrbPaletteColors,
  type LiveOrbPalettePresetId,
} from '@/components/glow/livePalette';
import type { LiveOrbStyle, PanelGlowStyle } from '@/components/glow/styles';

export interface RobotLook {
  /** Main body color (agent-robot-avatar `color`) */
  color: string;
  /** 0 = square head, 100 = round */
  headRoundness: number;
  antennaFlash: boolean;
  /** Eyes follow the cursor anywhere on screen */
  followCursor: boolean;
  /** Minutes idle before it dozes off; 0 never */
  autoSleepMinutes: number;
  motion: 'auto' | 'reduce' | 'full';
}

export interface Look {
  orbStyle: LiveOrbStyle;
  palette: { preset: LiveOrbPalettePresetId; custom: LiveOrbPaletteColors };
  glowStyle: PanelGlowStyle;
  /** 0–100 */
  glowIntensity: number;
  /** Window edge glows while the agent works */
  responseGlow: boolean;
  /** Window edge glows while you type */
  inputGlow: boolean;
  /** Orb turns into the robot while Ally sees or hears (capture, voice, perception tools) */
  morphToRobot: boolean;
  robot: RobotLook;
}

export const DEFAULT_LOOK: Look = {
  orbStyle: 'energy-orb',
  palette: { preset: 'sunset', custom: ['#FF6B35', '#F72585', '#FFB347'] },
  glowStyle: 'cloud',
  glowIntensity: 65,
  responseGlow: true,
  inputGlow: true,
  morphToRobot: true,
  robot: {
    color: '#08090b',
    headRoundness: 60,
    antennaFlash: true,
    followCursor: true,
    autoSleepMinutes: 3,
    motion: 'auto',
  },
};

const KEY = 'ally-look';
const listeners = new Set<() => void>();

function read(): Look {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Look> | null;
    if (!saved) return DEFAULT_LOOK;
    return { ...DEFAULT_LOOK, ...saved, palette: { ...DEFAULT_LOOK.palette, ...saved.palette }, robot: { ...DEFAULT_LOOK.robot, ...saved.robot } };
  } catch {
    return DEFAULT_LOOK;
  }
}

let current = read();

function write(next: Look) {
  current = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  listeners.forEach(l => l());
}

if (typeof window !== 'undefined') {
  // Another Ally window (or the settings page) changed it
  window.addEventListener('storage', e => {
    if (e.key === KEY) { current = read(); listeners.forEach(l => l()); }
  });
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function paletteColors(look: Look): LiveOrbPaletteColors {
  if (look.palette.preset === 'custom') return look.palette.custom;
  return LIVE_ORB_PALETTE_PRESETS.find(p => p.id === look.palette.preset)?.colors ?? DEFAULT_LOOK.palette.custom;
}

export function useLook() {
  const look = useSyncExternalStore(subscribe, () => current);
  const update = useCallback((patch: Partial<Omit<Look, 'robot'>> & { robot?: Partial<RobotLook> }) => {
    write({ ...current, ...patch, robot: { ...current.robot, ...patch.robot } });
  }, []);
  const reset = useCallback(() => write(DEFAULT_LOOK), []);
  return { look, colors: paletteColors(look), update, reset };
}
