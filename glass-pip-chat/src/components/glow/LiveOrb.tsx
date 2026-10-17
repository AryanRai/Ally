import EnergyOrb, { type OrbMood } from './EnergyOrb';
import AgentAvatar from './orbs/AgentAvatar';
import CloudWaveOrb from './orbs/CloudWaveOrb';
import SiriOrb from './orbs/SiriOrb';
import {
  mapAgentAvatarFilter,
  mapCloudWaveOrbColors,
  mapOrbBloomFilter,
  mapSiriOrbColors,
  type LiveOrbPaletteColors,
} from './livePalette';
import type { LiveOrbStyle } from './styles';

interface LiveOrbProps {
  style: LiveOrbStyle;
  colors: LiveOrbPaletteColors;
  size: number;
  mood?: OrbMood;
  /** 0–1 voice level */
  amplitude?: number;
}

/** Mary's live-mode orb in any of Orbit's styles (energy, Siri, cloud wave, pixel avatar). */
export default function LiveOrb({ style, colors, size, mood = 'idle', amplitude = 0 }: LiveOrbProps) {
  const active = mood !== 'idle';
  const amp = active ? Math.max(amplitude, mood === 'busy' ? 0.45 : 0.25) : 0.12;
  const bloom = style === 'agent-avatar' ? undefined : mapOrbBloomFilter(style, colors, active, amp);

  let orb: React.ReactNode;
  if (style === 'siri-orb') {
    orb = <SiriOrb size={`${size}px`} animationDuration={active ? 6 + (1 - amp) * 4 : 18} colors={mapSiriOrbColors(colors, active)} />;
  } else if (style === 'cloud-wave-orb') {
    orb = (
      <CloudWaveOrb
        size={size}
        speed={active ? 1.2 + amp * 0.6 : 0.75}
        intensity={active ? 1.25 + amp * 0.2 : 1.05}
        amplitude={amp}
        colors={mapCloudWaveOrbColors(colors, active)}
      />
    );
  } else if (style === 'agent-avatar') {
    orb = (
      <div style={{ filter: mapAgentAvatarFilter(colors, active) }}>
        <AgentAvatar seed="Orbit Live" size={size} animated />
      </div>
    );
  } else {
    orb = <EnergyOrb size={size} colors={colors} mood={mood} amplitude={amplitude} />;
  }

  return (
    <div className="grid place-items-center overflow-visible" style={{ width: size, height: size, filter: bloom }}>
      {orb}
    </div>
  );
}
