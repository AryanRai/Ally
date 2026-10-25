import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentSessionSummary } from '@/types/agent';

const REFRESH_MS = 15_000;

/**
 * Sessions started in the Claude Code / Codex apps (or CLIs), read from their
 * on-disk history so the sidebar can list them next to Ally's own chats.
 */
export function useExternalSessions() {
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const refreshing = useRef<Promise<void> | undefined>(undefined);
  const mounted = useRef(false);
  const cursors = useRef<Record<'claude' | 'codex', string | null | undefined>>({ claude: undefined, codex: undefined });
  const expanded = useRef({ claude: false, codex: false });
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const scan = useCallback((more: boolean): Promise<void> => {
    if (refreshing.current) return refreshing.current;
    const agent = window.pip?.agent;
    if (!agent || !mounted.current) return Promise.resolve();
    setLoading(true);
    const providers = ['claude', 'codex'] as const;
    const pending = Promise.allSettled(providers.map(async provider => {
      if (more && cursors.current[provider] === null) return undefined;
      if (agent.listSessionsPage) return agent.listSessionsPage(provider, more ? cursors.current[provider] ?? undefined : undefined);
      return { sessions: await agent.listSessions(provider, 80), nextCursor: undefined };
    }))
      .then(results => {
        if (!mounted.current) return;
        // A failed refresh is not an authoritative empty list. Successful
        // providers still replace their rows, including legitimate removals.
        setSessions(previous => results.flatMap((result, i) => {
          const provider = providers[i], old = previous.filter(session => session.provider === provider);
          if (result.status !== 'fulfilled' || !result.value) return old;
          const rows = result.value.sessions;
          return more || expanded.current[provider] ? [...new Map([...old, ...rows].map(row => [`${row.provider}:${row.id}`, row])).values()] : rows;
        }));
        results.forEach((result, i) => {
          if (result.status !== 'fulfilled' || !result.value) return;
          const provider = providers[i];
          if (more || !expanded.current[provider]) cursors.current[provider] = result.value.nextCursor ?? null;
          if (more) expanded.current[provider] = true;
        });
        setHasMore(providers.some(provider => cursors.current[provider] !== null));
        setError(results.flatMap((result, i) => result.status === 'rejected' ? [`${providers[i] === 'codex' ? 'Codex' : 'Claude'} chats could not refresh. Retry loading chats.`] : []).join(' '));
      }).finally(() => { if (refreshing.current === pending) refreshing.current = undefined; if (mounted.current) setLoading(false); });
    refreshing.current = pending;
    return pending;
  }, []);
  const refresh = useCallback(() => scan(false), [scan]);
  const loadMore = useCallback(() => scan(true), [scan]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = window.pip?.agent?.onSessionsChanged(() => {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; void refresh(); }, 1500);
    });
    window.addEventListener('focus', refresh);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      clearTimeout(timer);
      unsubscribe?.();
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const [running, setRunning] = useState<AgentSessionSummary[]>([]);
  const [runningError, setRunningError] = useState('');
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const rows = await window.pip?.agent?.runningSessions();
        if (alive) { setRunning(rows ?? []); setRunningError(''); }
      } catch {
        if (alive) { setRunning([]); setRunningError('Live status unavailable'); }
      }
      if (alive) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return { sessions, refresh, loadMore, hasMore, loading, error, running, runningError };
}
