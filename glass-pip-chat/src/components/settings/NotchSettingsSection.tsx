import { useEffect, useState } from 'react';
import { SettingsManager } from '@/utils/settingsManager';
import { DEFAULT_SETTINGS, type NotchSettings } from '@/types/settings';

type Native = Record<string, unknown>;

const TOGGLES: [key: string, label: string][] = [
  ['TypedTurnsRespondWithVoice', 'Speak replies to typed questions'],
  ['AgentAnnouncementsVoiceEnabled', 'Announce agent progress aloud'],
  ['ScreenHighlightEnabled', 'Highlight what Ally points at on screen'],
  ['DrawingSoundsEnabled', 'Drawing sounds'],
  ['DrawingPenSoundsEnabled', 'Pen sounds while drawing'],
  ['DrawingVoiceCaptions', 'Captions for spoken drawing steps'],
  ['CursorDocked', 'Keep the cursor companion docked'],
  ['ShowInScreenRecordings', 'Show the notch in screen recordings'],
  ['ShowInTaskbar', 'Show the notch in the taskbar'],
  ['StreamMode', 'Stream mode (larger notch for streaming)'],
];

/** One place for the floating pill and the native notch: Ally options and the notch's own preferences. */
export default function NotchSettingsSection() {
  const manager = SettingsManager.getInstance();
  const [ally, setAlly] = useState<NotchSettings>(() => ({ ...DEFAULT_SETTINGS.notch!, ...manager.getSettings().notch }));
  const [native, setNative] = useState<Native | null | undefined>();
  useEffect(() => { void window.pip?.nativeSettings?.().then(setNative).catch(() => setNative(null)); }, []);

  const changeAlly = (next: Partial<NotchSettings>) => {
    const value = { ...ally, ...next };
    setAlly(value);
    manager.updateSettings({ notch: value });
  };
  const changeNative = (key: string, value: string | number | boolean) => {
    setNative(current => current && { ...current, [key]: value });
    void window.pip?.nativeSettings?.({ key, value }).then(next => next && setNative(next));
  };
  const toggle = (checked: boolean, label: string, onChange: (value: boolean) => void) => (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
    </label>
  );

  return (
    <section aria-labelledby="notch-heading" className="space-y-3 border-t border-current/10 pt-4">
      <h3 id="notch-heading" className="text-sm font-medium">Notch & pill</h3>
      <p className="text-xs opacity-60">Drag the pill to the top edge to dock it into the notch; drag the notch's top strip down to bring the pill back.</p>
      {toggle(ally.livePreview, 'Show live replies in the notch while docked', livePreview => changeAlly({ livePreview }))}
      {toggle(ally.greetOnDock, "Show Ally's greeting when docking", greetOnDock => changeAlly({ greetOnDock }))}
      {native === undefined && <p className="text-xs opacity-50">Loading notch preferences…</p>}
      {native === null && <p className="text-xs opacity-50">Notch preferences appear here while the Ally notch is running.</p>}
      {native && Object.keys(native).length > 0 && (
        <div className="space-y-3">
          {typeof native.SpeechSpeed === 'number' && (
            <label className="block text-xs">
              Speech speed · {native.SpeechSpeed.toFixed(2)}×
              <input type="range" min={0.5} max={2} step={0.05} value={native.SpeechSpeed} className="mt-1 w-full"
                onChange={e => setNative(current => current && { ...current, SpeechSpeed: Number(e.target.value) })}
                onPointerUp={e => changeNative('SpeechSpeed', Number((e.target as HTMLInputElement).value))}
                onKeyUp={e => changeNative('SpeechSpeed', Number((e.target as HTMLInputElement).value))} />
            </label>
          )}
          {typeof native.CursorColorHex === 'string' && (
            <label className="flex items-center justify-between gap-3 text-xs">
              <span>Cursor colour</span>
              <input type="color" value={native.CursorColorHex} onChange={e => changeNative('CursorColorHex', e.target.value.toUpperCase())} className="h-6 w-10 cursor-pointer rounded border border-current/20 bg-transparent" />
            </label>
          )}
          {TOGGLES.filter(([key]) => typeof native[key] === 'boolean').map(([key, label]) => (
            <div key={key}>{toggle(native[key] as boolean, label, value => changeNative(key, value))}</div>
          ))}
        </div>
      )}
    </section>
  );
}
