import { useState } from 'react';
import { AudioLines, Bug, ChevronDown, GitFork, Mic, Monitor, MoreHorizontal, Pause, Play, Radio, Square, VolumeX } from 'lucide-react';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { PerceptionState } from '@/hooks/usePerception';
import type { AgentSessionSummary } from '@/types/agent';
import type { CaptureToggles } from '@/types/perception';
import SessionPicker from './SessionPicker';
import { MODES } from './modes';

const iconBtn = 'grid size-6 shrink-0 place-items-center rounded-md text-foreground/55 transition-colors hover:bg-white/8 hover:text-foreground disabled:opacity-40 [&>svg]:size-3.5';

function Level({ value }: { value: number }) {
  // rms 0–~0.3 → 0–100%
  return <span className="absolute inset-x-1 bottom-0.5 h-0.5 overflow-hidden rounded bg-white/10"><span className="block h-full bg-emerald-400/80 transition-[width] duration-200" style={{ width: `${Math.min(100, value * 400)}%` }} /></span>;
}

interface PerceptionBarProps {
  perception: PerceptionState;
  sessions: AgentSessionSummary[];
  onOpenDebug: () => void;
}

/** Realtime session controls, one line above the composer. */
export default function PerceptionBar({ perception, sessions, onOpenDebug }: PerceptionBarProps) {
  const { api, status, audioLevel } = perception;
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  if (!api) return null;
  const session = status?.session;
  const run = (p: Promise<unknown> | undefined) => void p?.catch(e => setError(e instanceof Error ? e.message : String(e)));

  if (!session) {
    return (
      <>
        <div className="flex items-center gap-2 border-t border-border px-3 py-1">
          <button type="button" onClick={() => setPicking(true)} className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] text-foreground/55 transition-colors hover:bg-white/8 hover:text-foreground" title="Start a realtime meeting / lecture session on one of your chats">
            <Radio className="size-3.5" /> Realtime
          </button>
          <span className="flex-1" />
          <button type="button" className={iconBtn} onClick={onOpenDebug} title="Realtime diagnostics"><Bug /></button>
        </div>
        <SessionPicker open={picking} onOpenChange={setPicking} sessions={sessions} defaultCapture={{ microphone: false, systemAudio: true, screen: true }}
          onStart={opts => run(api.start(opts))} />
      </>
    );
  }

  const running = session.state === 'running';
  const toggle = (key: keyof CaptureToggles, icon: React.ReactNode, label: string, level?: number, state?: string) => (
    <button
      type="button"
      onClick={() => run(api.setCapture({ [key]: !session.capture[key] }))}
      className={cn(iconBtn, 'relative', session.capture[key] && 'bg-white/10 text-foreground', state === 'error' && 'text-destructive')}
      title={`${label}: ${session.capture[key] ? 'on' : 'off'}${state === 'error' ? ' (error, see diagnostics)' : ''}`}
      aria-pressed={session.capture[key]}
    >
      {icon}
      {session.capture[key] && running && level != null && <Level value={level} />}
    </button>
  );
  const turn = status?.activeTurn;

  return (
    <div className="border-t border-border px-2 py-1">
      <div className="flex min-w-0 items-center gap-1">
        <span className={cn('ml-1 size-1.5 shrink-0 rounded-full', running ? 'animate-pulse bg-red-500' : 'bg-foreground/30')} title={running ? 'Live' : 'Paused'} />
        <span className="min-w-12 flex-1 truncate text-[11px] text-foreground/80" title={`${session.title}${session.forkedFrom ? ' (Ally copy)' : ''}`}>{session.title}</span>
        <span className="px-label shrink-0">{session.provider === 'codex' ? 'cx' : 'cc'}</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" title="Mode" className="flex shrink-0 items-center gap-0.5 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-foreground/75 hover:bg-white/5 data-[state=open]:bg-white/10">
              {MODES.find(m => m.id === session.mode)?.label}<ChevronDown className="size-2.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            {MODES.map(m => (
              <DropdownMenuItem key={m.id} onSelect={() => run(api.setMode(m.id))} className="flex-col items-start gap-0 text-xs">
                <span className={cn(session.mode === m.id && 'font-medium')}>{m.label}{session.mode === m.id ? ' ✓' : ''}</span>
                <span className="text-[10.5px] text-muted-foreground">{m.hint}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {toggle('systemAudio', <AudioLines />, 'Computer audio', audioLevel.system_audio, status?.audio.system_audio)}
        {toggle('microphone', <Mic />, 'Microphone', audioLevel.microphone, status?.audio.microphone)}
        {toggle('screen', <Monitor />, 'Screen', undefined, status?.screen)}
        <button type="button" className={iconBtn} onClick={() => run(running ? api.pause() : api.resume())} title={running ? 'Pause' : 'Resume'}>{running ? <Pause /> : <Play />}</button>
        <button type="button" className={cn(iconBtn, 'hover:text-destructive')} onClick={() => run(api.stop())} title="End session"><Square /></button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn(iconBtn, 'data-[state=open]:bg-white/10', status?.quiet && 'text-foreground')} title="More"><MoreHorizontal /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuCheckboxItem checked={!!status?.quiet} onCheckedChange={v => run(api.setQuiet(!!v))} className="text-xs">
              <VolumeX className="size-3.5" /> Quiet (notes stay in the list)
            </DropdownMenuCheckboxItem>
            {session.provider === 'codex' && !session.forkedFrom && (
              <DropdownMenuItem className="text-xs" onSelect={() => { if (window.confirm('Make a separate copy of this chat for Ally to work in? The original stays as it is.')) run(api.fork()); }}>
                <GitFork className="size-3.5" /> Fork: work in a copy
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" onSelect={onOpenDebug}><Bug className="size-3.5" /> Diagnostics</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {(turn || status?.relevance.engine === 'fallback' || error) && (
        <div className="flex min-w-0 items-center gap-2 px-1 pt-0.5 text-[10px] text-foreground/45">
          {turn && <span className="truncate">{turn.state === 'queued' ? 'Queued' : turn.origin === 'explicit' ? 'Answering' : 'Thinking about what was said'}{turn.tools.length ? ` · ${turn.tools.at(-1)}` : ''}…</span>}
          {status?.relevance.engine === 'fallback' && <span className="shrink-0" title={status.relevance.degradedReason}>basic relevance (no Jev)</span>}
          {error && <button type="button" className="truncate text-destructive/80" onClick={() => setError(undefined)} title="Dismiss">{error}</button>}
        </div>
      )}
    </div>
  );
}
