import { useState } from 'react';
import { AudioLines, Mic, Monitor, Pause, Play, Radio, Square } from 'lucide-react';
import type { PerceptionState } from '@/hooks/usePerception';
import type { Chat } from '@/types/chat';
import type { CaptureToggles } from '@/types/perception';
import { cn } from '@/lib/utils';

/** Only surface the meeting turn in the chat explicitly selected for that session. */
export function meetingReply(perception: PerceptionState, chat?: Chat | null) {
  const session = perception.status?.session;
  if (!session || session.state === 'stopped' || !chat?.agent || chat.agent.sessionId !== session.sessionId || chat.agent.provider !== session.provider) return;
  const since = Date.parse(session.startedAt);
  const turn = perception.status?.activeTurn ?? [...perception.turns].reverse().find(turn => Date.parse(turn.startedAt ?? '') >= since);
  if (!turn) return;
  // Native history takes over once it contains the completed response or a newer turn.
  if (!['running', 'queued'].includes(turn.state) && (chat.messages.at(-1)?.timestamp ?? 0) >= Date.parse(turn.startedAt ?? '')) return;
  return turn;
}

/** Meeting capture remains visible and controllable without opening the full chat. */
export default function CollapsedMeetingControls({ perception, onOpenSetup, onOpenSession }: {
  perception: PerceptionState;
  onOpenSetup: () => void;
  onOpenSession: () => void;
}) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const { api, status } = perception;
  if (!api) return null;
  const session = status?.session;
  if (!session || session.state === 'stopped') return <button type="button" onClick={onOpenSetup} className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-foreground/50 hover:text-foreground"><Radio className="size-3" />Meeting controls</button>;
  const running = session.state === 'running';
  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setPending(false); }
  };
  const sources = [
    { key: 'systemAudio' as const, label: 'Computer audio', icon: AudioLines, state: status?.audio.system_audio },
    { key: 'microphone' as const, label: 'Microphone', icon: Mic, state: status?.audio.microphone },
    { key: 'screen' as const, label: 'Screen', icon: Monitor, state: status?.screen },
  ];
  const enabled = sources.filter(source => session.capture[source.key]);
  const failed = enabled.some(source => source.state === 'error');
  const capturing = running && enabled.some(source => source.state && !['off', 'error'].includes(source.state));
  const label = !running ? 'Paused' : failed ? 'Capture needs attention' : capturing ? 'Live' : enabled.length ? 'Starting capture' : 'Capture off';
  const transcript = [...perception.observations].reverse().find(observation =>
    (observation.kind === 'transcript.partial' || observation.kind === 'transcript.final')
    && Date.parse(observation.at) >= Date.parse(session.startedAt)
    && session.capture[observation.source === 'microphone' ? 'microphone' : 'systemAudio']);
  const button = 'grid size-7 shrink-0 place-items-center rounded-md text-foreground/55 hover:bg-white/10 disabled:opacity-40 [&>svg]:size-3.5';
  return <section aria-label="Meeting capture" className="border-t border-white/10 px-2 py-1.5">
    <div className="flex min-w-0 items-center gap-1.5">
      <span className={cn('size-1.5 shrink-0 rounded-full', capturing ? 'animate-pulse bg-red-400' : failed ? 'bg-amber-400' : 'bg-foreground/30')} />
      <span className="shrink-0 text-[10px] text-foreground/65">{label}</span>
      <button type="button" onClick={onOpenSession} title={`Open meeting chat: ${session.title}`} className="min-w-0 flex-1 truncate text-left text-[10px] text-foreground/45 hover:text-foreground">{session.title}</button>
      <button type="button" disabled={pending} onClick={() => void run(() => running ? api.pause() : api.resume())} className={button} aria-label={running ? 'Pause capture' : 'Resume capture'} title={running ? 'Pause capture' : 'Resume capture'}>{running ? <Pause /> : <Play />}</button>
      <button type="button" disabled={pending} onClick={() => void run(api.stop)} className={button} aria-label="End meeting session" title="End meeting session"><Square /></button>
    </div>
    <div className="mt-1 flex flex-wrap gap-1">
      {sources.map(({ key, label, icon: Icon, state }) => <button key={key} type="button" disabled={pending} aria-pressed={session.capture[key]} aria-label={label} title={`${label}: ${running ? state : 'paused'}`} onClick={() => void run(() => api.setCapture({ [key]: !session.capture[key] } as Partial<CaptureToggles>))} className={cn('flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] disabled:opacity-40', session.capture[key] ? 'bg-white/8 text-foreground/75' : 'text-foreground/35', state === 'error' && 'text-amber-300')}><Icon className="size-3" />{label}{!session.capture[key] && ' off'}</button>)}
    </div>
    {transcript && (transcript.kind === 'transcript.partial' || transcript.kind === 'transcript.final') && <p className="mt-1 line-clamp-2 break-words text-[11px] text-foreground/55" style={{ userSelect: 'text' }} title={transcript.text}>{transcript.source === 'microphone' ? 'Mic' : 'Computer'} · {transcript.text}</p>}
    {(error || failed) && <p role="alert" className="mt-1 text-[10px] text-amber-200">{error || 'A capture source failed. Open meeting controls to check it.'}</p>}
  </section>;
}
