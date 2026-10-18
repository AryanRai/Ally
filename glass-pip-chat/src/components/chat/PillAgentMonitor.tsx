import { useEffect, useState } from 'react';
import { Activity, ChevronDown } from 'lucide-react';
import type { AssistantActivityRow } from '../../../electron/watch/assistantActivity';

const labels = { running: 'Working', needs_input: 'Needs input', unread: 'Unread', completed: 'Completed', stopped: 'Stopped', error: 'Error' };
export default function PillAgentMonitor({ onOpen, compact = false }: { onOpen?: (row: AssistantActivityRow) => Promise<void>; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AssistantActivityRow[]>([]);
  const [checked, setChecked] = useState(false);
  const [stale, setStale] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let alive = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await window.pip?.agent?.activity?.();
        if (!result) throw Error('Status unavailable');
        if (alive) { setRows(result.chats); setChecked(true); setStale(false); }
      } catch { if (alive) setStale(true); }
      if (alive) timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [open]);
  const active = rows.filter(r => r.status === 'running' || r.status === 'needs_input').length;
  const summary = stale ? 'Status unavailable' : !checked ? 'Checking…' : `${active} active · ${rows.filter(r => r.unread).length} unread`;
  return <div className={compact ? 'relative shrink-0' : 'px-2 pb-1'} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
    <button type="button" aria-label="Agent status" aria-expanded={open} aria-controls="pill-agent-status" title="Check other agents" onClick={() => { setOpen(value => !value); setError(''); }}
      className="flex h-5 items-center gap-1 rounded px-1 text-[10px] text-foreground/45 transition-colors hover:bg-white/5 hover:text-foreground/75">
      <Activity className="size-2.5" /><span>{open && !compact ? summary : 'Agents'}</span><ChevronDown className={`size-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div id="pill-agent-status" role="region" aria-label="Agent statuses" className={`${compact ? 'mt-1 w-64 max-w-full bg-zinc-950/95' : 'mt-1 bg-white/[0.03]'} max-h-28 overflow-y-auto rounded-lg border border-white/10 p-1`}>
      {compact && <p className="px-1 py-1 text-[10px] text-foreground/45">{summary}</p>}
      {!rows.length && <p className="px-1 py-1 text-[10px] text-foreground/45">{stale ? 'Reconnect to check agents' : checked ? 'No active or unread agents' : 'Checking agents…'}</p>}
      {rows.map(row => <button key={`${row.provider}:${row.sessionId ?? row.id}`} type="button" disabled={opening || !onOpen} onClick={async () => {
        if (!onOpen) return;
        setOpening(true); setError('');
        try { await onOpen(row); } catch { setError('Chat unavailable · try again'); } finally { setOpening(false); }
      }} title={`${row.title} · ${row.detail}`} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[10px] text-foreground/65 hover:bg-white/5 disabled:opacity-50">
        <span className="min-w-0 flex-1 truncate">{row.title}</span><span className="shrink-0 text-[9px] text-foreground/45">{stale ? 'Last seen · ' : ''}{labels[row.status]} · {row.provider}</span>
      </button>)}
      {error && <p role="alert" className="px-1 text-[10px] text-amber-200">{error}</p>}
    </div>}
  </div>;
}
