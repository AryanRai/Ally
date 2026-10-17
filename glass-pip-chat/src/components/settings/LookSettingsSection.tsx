import { useState } from 'react';
import { useLook } from '@/lib/look';
import { cn } from '@/lib/utils';
import AgentPresence from '../glow/AgentPresence';
import { AnimatedPanelGlowWeb } from '../glow/PanelGlow';
import { LIVE_ORB_STYLES, PANEL_GLOW_STYLES } from '../glow/styles';
import { LIVE_ORB_PALETTE_PRESETS, type LiveOrbPaletteColors } from '../glow/livePalette';

export default function LookSettingsSection({ dark }: { dark: boolean }) {
  const { look, colors, update, reset } = useLook();
  const [sensing, setSensing] = useState(false);
  const choice = (selected: boolean) => cn(
    'rounded-lg border px-2 py-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2',
    dark ? 'border-white/15 hover:bg-white/10' : 'border-black/15 hover:bg-black/5',
    selected && (dark ? 'bg-white/15 border-white/50' : 'bg-black/10 border-black/40'),
  );
  const field = cn('w-full rounded-lg border p-2 text-xs', dark ? 'bg-zinc-900 border-white/20' : 'bg-white border-black/20');
  const changeColor = (index: number, value: string) => {
    const custom: LiveOrbPaletteColors = [...colors];
    custom[index] = value;
    update({ palette: { preset: 'custom', custom } });
  };

  return (
    <section aria-labelledby="look-heading" className="space-y-4 border-t border-current/10 pt-4">
      <div className="flex items-center justify-between">
        <h3 id="look-heading" className="text-sm font-medium">Orb, glow & robot</h3>
        <button type="button" onClick={reset} className="text-xs opacity-60 hover:opacity-100">Reset look</button>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-current/10 p-5">
        <div aria-hidden className="pointer-events-none absolute inset-0"><AnimatedPanelGlowWeb active inward colors={colors} styleId={look.glowStyle} borderRadius={12} intensity={look.glowIntensity / 100} /></div>
        <div className="relative flex items-center gap-4">
          <AgentPresence size={52} mood={sensing ? 'listening' : 'busy'} sensing={sensing} robotStatus="listening" trackGlobalCursor={false} />
          <div className="min-w-0 space-y-2">
            <p className="text-xs opacity-60">Live preview</p>
            <button type="button" className={choice(sensing)} aria-pressed={sensing} onClick={() => setSensing(!sensing)}>
              {sensing ? 'Preview orb' : 'Preview seeing / hearing'}
            </button>
          </div>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-medium">Orb style</legend>
        <div className="grid grid-cols-2 gap-2">
          {LIVE_ORB_STYLES.map(style => <button key={style.id} type="button" aria-pressed={look.orbStyle === style.id} className={choice(look.orbStyle === style.id)} onClick={() => update({ orbStyle: style.id })}>{style.name}</button>)}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-medium">Shared colour palette</legend>
        <div className="grid grid-cols-2 gap-2">
          {LIVE_ORB_PALETTE_PRESETS.map(preset => (
            <button key={preset.id} type="button" aria-pressed={look.palette.preset === preset.id} className={choice(look.palette.preset === preset.id)} onClick={() => update({ palette: { ...look.palette, preset: preset.id } })}>
              <span aria-hidden className="mb-1 flex justify-center gap-1">{preset.colors.map(color => <span key={color} className="size-3 rounded-full" style={{ backgroundColor: color }} />)}</span>
              {preset.name}
            </button>
          ))}
          <button type="button" aria-pressed={look.palette.preset === 'custom'} className={cn(choice(look.palette.preset === 'custom'), 'col-span-2')} onClick={() => update({ palette: { ...look.palette, preset: 'custom' } })}>Custom colours</button>
        </div>
        {look.palette.preset === 'custom' && (
          <div className="grid grid-cols-3 gap-2">
            {look.palette.custom.map((color, index) => <label key={index} className="text-xs opacity-80">Colour {index + 1}<input type="color" value={color} onChange={e => changeColor(index, e.target.value)} className="mt-1 h-8 w-full cursor-pointer rounded border border-current/20 bg-transparent" /></label>)}
          </div>
        )}
        <p className="text-xs opacity-50">Used by the orb, composer and window glow.</p>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-medium">Window glow</legend>
        <div className="grid grid-cols-2 gap-2">
          {PANEL_GLOW_STYLES.map(style => <button key={style.id} type="button" aria-pressed={look.glowStyle === style.id} className={choice(look.glowStyle === style.id)} onClick={() => update({ glowStyle: style.id })}>{style.name}</button>)}
        </div>
        <label className="block text-xs">Glow intensity · {look.glowIntensity}%<input type="range" min={0} max={100} value={look.glowIntensity} onChange={e => update({ glowIntensity: Number(e.target.value) })} className="mt-2 w-full" /></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={look.responseGlow} onChange={e => update({ responseGlow: e.target.checked })} />While the agent works</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={look.inputGlow} onChange={e => update({ inputGlow: e.target.checked })} />While I type</label>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-medium">Robot</legend>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={look.morphToRobot} onChange={e => update({ morphToRobot: e.target.checked })} />Morph when seeing or hearing</label>
        <label className="flex items-center justify-between text-xs">Body colour<input type="color" value={look.robot.color} onChange={e => update({ robot: { color: e.target.value } })} className="h-8 w-12 cursor-pointer rounded border border-current/20 bg-transparent" /></label>
        <label className="block text-xs">Head roundness · {look.robot.headRoundness}%<input type="range" min={0} max={100} value={look.robot.headRoundness} onChange={e => update({ robot: { headRoundness: Number(e.target.value) } })} className="mt-2 w-full" /></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={look.robot.antennaFlash} onChange={e => update({ robot: { antennaFlash: e.target.checked } })} />Antenna flash</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={look.robot.followCursor} onChange={e => update({ robot: { followCursor: e.target.checked } })} />Eyes follow cursor</label>
        <label className="block space-y-1 text-xs"><span>Sleep after · {look.robot.autoSleepMinutes === 0 ? 'Never' : `${look.robot.autoSleepMinutes} minutes`}</span><input aria-label="Sleep after (minutes, 0 for never)" type="range" min={0} max={30} step={1} value={look.robot.autoSleepMinutes} onChange={e => update({ robot: { autoSleepMinutes: Number(e.target.value) } })} className="w-full" /></label>
        <label className="block space-y-1 text-xs"><span>Robot motion</span><select value={look.robot.motion} onChange={e => update({ robot: { motion: e.target.value as typeof look.robot.motion } })} className={field}><option value="auto">Follow system preference</option><option value="reduce">Reduced</option><option value="full">Full</option></select></label>
      </fieldset>
    </section>
  );
}
