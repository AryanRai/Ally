// Orb and glow variants, matching Orbit's agent Mary (Orbit-Frontend lib/voice/voice-config.ts).

export type LiveOrbStyle = 'energy-orb' | 'siri-orb' | 'cloud-wave-orb' | 'agent-avatar';

export const LIVE_ORB_STYLES: { id: LiveOrbStyle; name: string }[] = [
  { id: 'energy-orb', name: 'Energy' },
  { id: 'siri-orb', name: 'Siri' },
  { id: 'cloud-wave-orb', name: 'Cloud wave' },
  { id: 'agent-avatar', name: 'Pixel' },
];

export type PanelGlowStyle = 'default' | 'violet-bloom' | 'nebula' | 'neon-pulse' | 'cloud' | 'spotlight';

export const PANEL_GLOW_STYLES: { id: PanelGlowStyle; name: string }[] = [
  { id: 'default', name: 'Default' },
  { id: 'violet-bloom', name: 'Violet Bloom' },
  { id: 'nebula', name: 'Nebula' },
  { id: 'neon-pulse', name: 'Neon Pulse' },
  { id: 'cloud', name: 'Cloud' },
  { id: 'spotlight', name: 'Spotlight' },
];
