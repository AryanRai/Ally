import { useMemo, useState } from 'react';
import { AudioLines, Mic, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AgentSessionSummary } from '@/types/agent';
import type { CaptureToggles, PerceptionMode, PerceptionStartOptions } from '@/types/perception';
import { MODES } from './modes';


const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60_000);
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

interface SessionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: AgentSessionSummary[];
  defaultCapture: CaptureToggles;
  onStart: (opts: PerceptionStartOptions) => void;
}

/** Choose the chat Ally works in, and how it should listen and watch. */
export default function SessionPicker({ open, onOpenChange, sessions, defaultCapture, onStart }: SessionPickerProps) {
  const [selected, setSelected] = useState<AgentSessionSummary | null>(null);
  const [mode, setMode] = useState<PerceptionMode>('meeting');
  const [capture, setCapture] = useState<CaptureToggles>(defaultCapture);

  const sorted = useMemo(() => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt), [sessions]);
  const codex = sorted.filter(s => s.provider === 'codex');
  const claude = sorted.filter(s => s.provider === 'claude');

  const toggle = (key: keyof CaptureToggles, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setCapture(c => ({ ...c, [key]: !c[key] }))}
      className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors',
        capture[key] ? 'border-white/30 bg-white/10 text-foreground' : 'border-border text-muted-foreground hover:bg-white/5')}
      aria-pressed={capture[key]}
    >
      {icon}{label}
    </button>
  );

  const row = (s: AgentSessionSummary) => (
    <CommandItem key={`${s.provider}:${s.id}`} value={`${s.title} ${s.cwd ?? ''} ${s.id}`} onSelect={() => setSelected(s)}
      className={cn('gap-2 text-xs', selected?.id === s.id && 'bg-white/10')}>
      <span className="min-w-0 flex-1 truncate">{s.title || 'Untitled'}</span>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{ago(s.updatedAt)}</span>
    </CommandItem>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle>Realtime session</DialogTitle>
          <DialogDescription>Ally listens and watches, and brings in this chat when something relevant comes up. Its notes are added to the chat as normal turns.</DialogDescription>
        </DialogHeader>

        <Command className="rounded-md border border-border">
          <CommandInput placeholder="Find a chat…" className="text-xs" />
          <CommandList className="max-h-56">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No chats found</CommandEmpty>
            {codex.length > 0 && <CommandGroup heading="Codex">{codex.map(row)}</CommandGroup>}
            {claude.length > 0 && <CommandGroup heading="Claude Code">{claude.map(row)}</CommandGroup>}
          </CommandList>
        </Command>

        <div className="space-y-1.5">
          <p className="px-label">Mode</p>
          <div className="flex gap-1.5">
            {MODES.map(m => (
              <button key={m.id} type="button" title={m.hint} onClick={() => setMode(m.id)}
                className={cn('flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors', mode === m.id ? 'border-white/30 bg-white/10 text-foreground' : 'border-border text-muted-foreground hover:bg-white/5')}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">{MODES.find(m => m.id === mode)?.hint}</p>
        </div>

        <div className="space-y-1.5">
          <p className="px-label">Listen &amp; watch</p>
          <div className="flex gap-1.5">
            {toggle('systemAudio', <AudioLines className="size-3.5" />, 'Computer audio')}
            {toggle('microphone', <Mic className="size-3.5" />, 'Microphone')}
            {toggle('screen', <Monitor className="size-3.5" />, 'Screen')}
          </div>
        </div>

        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" disabled={!selected} onClick={() => {
            if (!selected) return;
            onStart({ provider: selected.provider, sessionId: selected.id, title: selected.title || 'Untitled', cwd: selected.cwd, mode, capture });
            onOpenChange(false);
          }}>
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
