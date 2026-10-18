import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PerceptionState } from '@/hooks/usePerception';
import type { Observation, PublicPerceptionSettings, RelevanceThresholds } from '@/types/perception';

type Tab = 'pipeline' | 'timeline' | 'decisions' | 'turns' | 'settings';

const time = (iso: string) => iso.slice(11, 19);

function ObservationRow({ o }: { o: Observation }) {
  const text =
    o.kind === 'transcript.final' || o.kind === 'transcript.partial' ? `[${o.source === 'microphone' ? 'mic' : 'audio'}${o.kind === 'transcript.final' && o.speaker ? ` · ${o.speaker}` : ''}] ${o.text}`
      : o.kind === 'audio.vad' ? `[${o.source}] ${o.speaking ? 'speech started' : 'speech ended'}`
        : o.kind === 'screen.window_changed' ? `${o.app}: ${o.title}`
          : o.kind === 'screen.changed' ? `change ${(o.change * 100).toFixed(0)}% (${o.reason})`
            : o.kind === 'screen.snapshot' ? `${o.width}×${o.height} ${o.path.split(/[\\/]/).pop()}`
              : o.kind === 'screen.ocr' ? o.text.replace(/\s+/g, ' ').slice(0, 220)
                : `${o.component}: ${o.message}`;
  return (
    <div className={cn('flex gap-2 py-0.5 font-mono text-[10.5px]', o.kind === 'perception.error' && 'text-destructive/90', o.kind === 'transcript.partial' && 'text-foreground/40')}>
      <span className="shrink-0 text-foreground/35">{time(o.at)}</span>
      <span className="w-32 shrink-0 truncate text-foreground/50">{o.kind}</span>
      <span className="min-w-0 break-words">{text}</span>
    </div>
  );
}

/** Everything the realtime pipeline is doing, for tuning and debugging. */
export default function PerceptionDebug({ open, onOpenChange, perception }: { open: boolean; onOpenChange: (o: boolean) => void; perception: PerceptionState }) {
  const { status, observations, decisions, turns, api } = perception;
  const [tab, setTab] = useState<Tab>('settings');
  const [settings, setSettings] = useState<PublicPerceptionSettings | null>(null);
  const [key, setKey] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => { if (open) void api?.getSettings().then(setSettings); }, [open, api]);

  const save = async (patch: Partial<PublicPerceptionSettings> & { jevApiKey?: string }) => {
    if (!api) return;
    try { setSettings(await api.updateSettings(patch)); setSaveError(''); }
    catch { setSaveError('Could not save relevance settings. Try again.'); }
  };
  const threshold = (k: keyof RelevanceThresholds, label: string, min: number, max: number, step: number, scale = 1) => settings && (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-40 text-muted-foreground">{label}</span>
      <input type="range" min={min} max={max} step={step} value={settings.thresholds[k] / scale} className="flex-1"
        onChange={e => void save({ thresholds: { ...settings.thresholds, [k]: Number(e.target.value) * scale } })} />
      <span className="w-12 text-right font-mono">{(settings.thresholds[k] / scale).toFixed(step < 1 ? 2 : 0)}</span>
    </label>
  );

  const s = status;
  const row = (k: string, v: React.ReactNode) => <div className="flex gap-2 py-0.5 text-xs"><span className="w-36 shrink-0 text-muted-foreground">{k}</span><span className="min-w-0 break-words">{v}</span></div>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-2">
        <DialogHeader><DialogTitle>Meeting settings & diagnostics</DialogTitle></DialogHeader>
        <div className="flex gap-1 border-b border-border pb-1.5">
          {(['pipeline', 'timeline', 'decisions', 'turns', 'settings'] as Tab[]).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cn('rounded px-2 py-0.5 text-xs capitalize', tab === t ? 'bg-white/12 text-foreground' : 'text-muted-foreground hover:bg-white/5')}>{t}</button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {tab === 'pipeline' && s && (
            <div>
              {row('Session', s.session ? `${s.session.title} · ${s.session.provider} · ${s.session.state} · ${s.session.mode}${s.session.forkedFrom ? ` · copy of ${s.session.forkedFrom}` : ''}` : 'none')}
              {row('Chat id', <span className="font-mono">{s.session?.sessionId ?? '-'}</span>)}
              {row('Computer audio', s.audio.system_audio)}
              {row('Microphone', s.audio.microphone)}
              {row('Screen', `${s.screen} · OCR ${s.ocr}`)}
              {row('Relevance', `${s.relevance.engine === 'vertex' ? 'Gemini (Google Vertex AI)' : s.relevance.engine === 'jev' ? 'Jev (TypeSafe)' : 'basic heuristics'}${s.relevance.degradedReason ? `: ${s.relevance.degradedReason}` : ''}`)}
              {row('Agent turn', s.activeTurn ? `${s.activeTurn.origin} · ${s.activeTurn.state}${s.activeTurn.tools.length ? ` · tools: ${s.activeTurn.tools.join(', ')}` : ''}` : 'idle')}
              {row('Queue depth', s.queueDepth)}
              {row('Quiet mode', s.quiet ? 'on' : 'off')}
              {row('Counts', `${s.metrics.observations} observations · ${s.metrics.decisions} decisions · ${s.metrics.triggers} triggers · ${s.metrics.turns} turns`)}
              {row('Last decision', s.metrics.lastDecisionMs != null ? `${s.metrics.lastDecisionMs} ms` : '-')}
              {s.session && row('Chat scope', <pre className="whitespace-pre-wrap font-mono text-[10.5px] text-foreground/70">{s.session.scope}</pre>)}
            </div>
          )}
          {tab === 'timeline' && (observations.length ? [...observations].reverse().map((o, i) => <ObservationRow key={i} o={o} />) : <p className="text-xs text-muted-foreground">Nothing observed yet.</p>)}
          {tab === 'decisions' && (decisions.length ? [...decisions].reverse().map(d => (
            <div key={d.id} className="border-b border-border/50 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-foreground/40">{time(d.at)}</span>
                <span className={cn('rounded px-1 font-mono text-[10px]', d.outcome.startsWith('INVOKE') || d.outcome === 'HIGH_PRIORITY_TRIGGER' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/8 text-foreground/60')}>{d.outcome}</span>
                <span className="text-foreground/50">{d.engine} · {d.scores.category} · {d.latencyMs} ms</span>
              </div>
              <p className="mt-0.5 text-foreground/80">{d.excerpt}</p>
              <p className="mt-0.5 font-mono text-[10px] text-foreground/45">
                rel {d.scores.relevant.toFixed(2)} · q {d.scores.question.toFixed(2)} · help {d.scores.canHelp.toFixed(2)} · proactive {d.scores.proactiveUseful.toFixed(2)} · interrupt {d.scores.interrupt.toFixed(2)} · urgency {d.scores.urgency.toFixed(2)} · topic “{d.topic}”
              </p>
              <p className="font-mono text-[10px] text-foreground/40">{d.reasons.join(' · ')}</p>
            </div>
          )) : <p className="text-xs text-muted-foreground">No decisions yet.</p>)}
          {tab === 'turns' && (turns.length ? [...turns].reverse().map(t => (
            <div key={t.id} className="border-b border-border/50 py-1.5 text-xs">
              <div className="flex gap-2 text-foreground/50"><span>{t.origin}</span><span>{t.state}</span>{t.startedAt && <span className="font-mono">{time(t.startedAt)}</span>}{t.tools.length > 0 && <span>tools: {t.tools.join(', ')}</span>}</div>
              {t.error && <p className="text-destructive/90">{t.error}</p>}
              {t.text && <pre className="mt-0.5 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10.5px] text-foreground/75">{t.text}</pre>}
            </div>
          )) : <p className="text-xs text-muted-foreground">No agent turns yet.</p>)}
          {tab === 'settings' && settings && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!status?.quiet} onChange={e => { void api?.setQuiet(e.target.checked).catch(() => setSaveError('Could not change quiet mode.')); }} />Quiet meeting notes</label>
              {saveError && <p role="alert" className="text-xs text-destructive">{saveError}</p>}
              <div className="space-y-1.5">
                <p className="px-label">Relevance provider</p>
                <label className="flex items-center gap-2 text-xs">Provider
                  <select aria-label="Relevance provider" value={settings.relevanceProvider} onChange={e => void save({ relevanceProvider: e.target.value as PublicPerceptionSettings['relevanceProvider'] })} className="rounded border border-border bg-background px-2 py-1">
                    <option value="vertex">Gemini · Google Cloud</option>
                    <option value="jev">Jev · TypeSafe</option>
                    <option value="heuristic">Basic · local only</option>
                  </select>
                </label>
                <p className="text-[11px] text-muted-foreground">Remote providers receive recent transcript text, screen text and the selected chat scope during an enabled realtime session. Basic relevance uses no remote classifier; speech transcription keeps its own provider.</p>
              </div>
              {settings.relevanceProvider === 'vertex' && <div className="space-y-1.5">
                <p className="px-label">Google Vertex AI</p>
                <label className="block text-xs">Google Cloud project<Input aria-label="Google Cloud project" defaultValue={settings.vertexProject} onBlur={e => void save({ vertexProject: e.target.value.trim() })} placeholder="Project ID" className="mt-1 h-7 text-xs" /></label>
                <label className="block text-xs">Location<Input aria-label="Vertex AI location" defaultValue={settings.vertexLocation} onBlur={e => void save({ vertexLocation: e.target.value.trim() })} className="mt-1 h-7 text-xs" /></label>
                <label className="block text-xs">Model<Input aria-label="Gemini model" defaultValue={settings.vertexModel} onBlur={e => void save({ vertexModel: e.target.value.trim() })} className="mt-1 h-7 text-xs" /></label>
                <p className="text-[11px] text-muted-foreground">Uses this computer's Google Application Default Credentials and bills the selected project. No API key needed. Gemini scores are estimates; thresholds and cooldowns still apply.</p>
              </div>}
              {settings.relevanceProvider === 'jev' && <div className="space-y-1.5">
                <p className="px-label">Jev (TypeSafe)</p>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.jevEnabled} onChange={e => void save({ jevEnabled: e.target.checked })} /> Use Jev for relevance (basic heuristics otherwise)</label>
                <div className="flex gap-2">
                  <Input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder={settings.jevKeySet ? 'API key saved (enter to replace)' : 'TypeSafe API key'} className="h-7 text-xs" />
                  <Button size="sm" variant="outline" disabled={!key.trim()} onClick={() => { void save({ jevApiKey: key.trim() }); setKey(''); }}>Save</Button>
                  {settings.jevKeySet && <Button size="sm" variant="ghost" onClick={() => void save({ jevApiKey: '' })}>Remove</Button>}
                </div>
                <p className="text-[11px] text-muted-foreground">Stored in Ally's settings on this computer, used only by the main process. Get a key at the TypeSafe console.</p>
              </div>}
              <div className="space-y-1.5">
                <p className="px-label">Thresholds</p>
                {threshold('quiet', 'Quiet note at', 0.2, 0.9, 0.01)}
                {threshold('invoke', 'Desktop note at', 0.3, 0.95, 0.01)}
                {threshold('highPriority', 'Interrupt at', 0.5, 1, 0.01)}
                {threshold('topicCooldownMs', 'Topic cooldown (s)', 0, 900, 15, 1000)}
                {threshold('maxTriggersPer10Min', 'Max notes / 10 min', 1, 30, 1)}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
