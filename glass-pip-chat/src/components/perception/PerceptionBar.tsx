import { useRef, useState } from 'react';
import { AudioLines, Mic, Monitor, Radio } from 'lucide-react';
import type { PerceptionState } from '@/hooks/usePerception';
import type { Chat } from '@/types/chat';
import type { CaptureToggles } from '@/types/perception';
import CollapsedMeetingControls from '../chat/CollapsedMeetingControls';
import { cn } from '@/lib/utils';

/** The same meeting surface in the pill and chat; capture owns its original chat. */
export default function PerceptionBar({ perception, chat, onOpenSession }: {
  perception: PerceptionState;
  chat?: Chat | null;
  onOpenSession: () => void;
}) {
  const [setup, setSetup] = useState(false);
  const [capture, setCapture] = useState<CaptureToggles>({ microphone: false, systemAudio: true, screen: true });
  const [pending, setPending] = useState(false);
  const starting = useRef(false);
  const [error, setError] = useState('');
  const { api, status } = perception;
  if (!api) return null;
  const session = status?.session;
  if (session && session.state !== 'stopped') return <>
    {(!chat?.agent || chat.agent.provider !== session.provider || chat.agent.sessionId !== session.sessionId) &&
      <p className="border-t border-white/10 px-3 pt-2 text-[11px] text-foreground/55">Meeting stays in <button className="underline hover:text-foreground" onClick={onOpenSession}>{session.title}</button></p>}
    <CollapsedMeetingControls perception={perception} onOpenSetup={() => setSetup(true)} onOpenSession={onOpenSession} />
  </>;

  const start = async () => {
    if (starting.current || !chat?.agent?.sessionId) return;
    // Snapshot before awaiting. Navigation never changes this request's destination.
    const target = { provider: chat.agent.provider, sessionId: chat.agent.sessionId, title: chat.title, cwd: chat.agent.cwd };
    starting.current = true; setPending(true); setError('');
    try { await api.start({ ...target, mode: 'meeting', capture: { ...capture } }); setSetup(false); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { starting.current = false; setPending(false); }
  };
  return <section aria-label="Meeting" className="border-t border-white/10 px-2 py-1.5 text-[11px]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
    <button type="button" disabled={pending} aria-expanded={setup} onClick={() => setSetup(!setup)} className="flex items-center gap-1.5 rounded-md px-1 py-1 text-foreground/55 hover:text-foreground"><Radio className="size-3.5" />Meeting</button>
    {setup && <div className="space-y-2 px-1 pb-1 pt-1">
      <p className="truncate text-foreground/65" title={chat?.title}>Notes and answers in <span className="text-foreground">{chat?.title || 'the selected chat'}</span></p>
      <p className="text-foreground/45">Choose what Ally can listen to and see.</p>
      <div className="flex flex-wrap gap-1">
        {([{ key: 'systemAudio', label: 'Computer audio', Icon: AudioLines }, { key: 'microphone', label: 'Microphone', Icon: Mic }, { key: 'screen', label: 'Screen', Icon: Monitor }] as const).map(({ key, label, Icon }) =>
          <button key={key} type="button" disabled={pending} aria-pressed={capture[key]} onClick={() => setCapture(previous => ({ ...previous, [key]: !previous[key] }))} className={cn('flex items-center gap-1 rounded-md px-2 py-1.5 disabled:opacity-40', capture[key] ? 'bg-white/10 text-foreground/85' : 'text-foreground/40')}><Icon className="size-3" />{label}</button>)}
      </div>
      {!chat?.agent?.sessionId && <p className="text-foreground/50">Open an existing chat or send its first message before starting a meeting.</p>}
      <button type="button" disabled={pending || !chat?.agent?.sessionId || !Object.values(capture).some(Boolean)} onClick={() => void start()} className="rounded-md bg-foreground px-3 py-1.5 text-background disabled:opacity-40">{pending ? 'Starting meeting…' : 'Start meeting'}</button>
    </div>}
    {error && <p role="alert" className="px-1 py-1 text-amber-200">{error}</p>}
  </section>;
}
