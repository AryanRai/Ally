import { useCallback, useEffect, useState } from 'react';
import type { AgentSessionSummary } from '@/types/agent';

const LIMIT_PER_AGENT = 80;
const REFRESH_MS = 15_000;

/**
 * Sessions started in the Claude Code / Codex apps (or CLIs), read from their
 * on-disk history so the sidebar can list them next to Ally's own chats.
 */
export function useExternalSessions() {
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);

  const refresh = useCallback(async () => {
    const agent = window.pip?.agent;
    if (!agent) return;
    const results = await Promise.allSettled([
      agent.listSessions('claude', LIMIT_PER_AGENT),
      agent.listSessions('codex', LIMIT_PER_AGENT),
    ]);
    setSessions(results.flatMap(r => (r.status === 'fulfilled' ? r.value : [])));
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = window.pip?.agent?.onSessionsChanged(() => {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; void refresh(); }, 1500);
    });
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      unsubscribe?.();
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return { sessions, refresh };
}
