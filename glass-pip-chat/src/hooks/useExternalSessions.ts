import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentSessionSummary } from '@/types/agent';

const LIMIT_PER_AGENT = 80;
const REFRESH_MS = 15_000;

/**
 * Sessions started in the Claude Code / Codex apps (or CLIs), read from their
 * on-disk history so the sidebar can list them next to Ally's own chats.
 */
export function useExternalSessions() {
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const refreshing = useRef<Promise<void> | undefined>(undefined);
  const mounted = useRef(false);

  const refresh = useCallback((): Promise<void> => {
    if (refreshing.current) return refreshing.current;
    const agent = window.pip?.agent;
    if (!agent || !mounted.current) return Promise.resolve();
    const providers = ['claude', 'codex'] as const;
    const pending = Promise.allSettled(providers.map(provider => agent.listSessions(provider, LIMIT_PER_AGENT)))
      .then(results => {
        if (!mounted.current) return;
        // A failed refresh is not an authoritative empty list. Successful
        // providers still replace their rows, including legitimate removals.
        setSessions(previous => results.flatMap((result, i) => result.status === 'fulfilled'
          ? result.value : previous.filter(session => session.provider === providers[i])));
      }).finally(() => { if (refreshing.current === pending) refreshing.current = undefined; });
    refreshing.current = pending;
    return pending;
  }, []);

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
  return { sessions, refresh, running, runningError };
}
