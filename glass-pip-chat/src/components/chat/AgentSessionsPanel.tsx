import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, RefreshCw, Bot, Terminal } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AgentProvider, AgentSessionSummary } from '../../types/agent';

interface AgentSessionsPanelProps {
  onOpen: (session: AgentSessionSummary) => void;
}

function relativeTime(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : new Date(ts).toLocaleDateString();
}

function folderName(p?: string): string {
  if (!p) return '';
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || p;
}

/** Sidebar section listing existing Claude Code / Codex sessions so they can be continued in Ally. */
export default function AgentSessionsPanel({ onOpen }: AgentSessionsPanelProps) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<AgentProvider>('claude');
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!window.pip?.agent) return;
    setLoading(true);
    setError(null);
    try {
      setSessions(await window.pip.agent.listSessions(provider, 40));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!window.pip?.agent) return null;

  return (
    <div className="border-t border-white/10">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-white/70 hover:bg-white/5"
      >
        <span className="flex items-center gap-1.5"><Bot className="w-3.5 h-3.5 text-purple-400" />Agent sessions</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-1 px-2 pb-2">
              {(['claude', 'codex'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md border transition-colors',
                    provider === p
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                      : 'border-white/10 text-white/50 hover:bg-white/5'
                  )}
                >
                  {p === 'claude' ? <Bot className="w-3 h-3" /> : <Terminal className="w-3 h-3" />}
                  {p === 'claude' ? 'Claude Code' : 'Codex'}
                </button>
              ))}
              <button onClick={load} className="ml-auto p-1 rounded hover:bg-white/10 text-white/50" title="Refresh">
                <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto pb-1">
              {error && <div className="px-3 py-2 text-[11px] text-red-300">{error}</div>}
              {!loading && !error && sessions.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-white/40">No sessions found</div>
              )}
              {sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => onOpen(s)}
                  className="w-full text-left px-3 py-1.5 hover:bg-white/5 transition-colors"
                  title={`${s.title}\n${s.cwd ?? ''}\nClick to continue in Ally`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-white/85 truncate">{s.title}</span>
                    <span className="text-[10px] text-white/40 flex-shrink-0">{relativeTime(s.updatedAt)}</span>
                  </div>
                  {s.cwd && <div className="text-[10px] text-white/40 truncate">{folderName(s.cwd)}</div>}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
