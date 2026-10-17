import { useCallback, useEffect, useState } from 'react';
import type { AgentSessionSummary } from '@/types/agent';

const LIMIT_PER_AGENT = 80;
const REFRESH_MS = 60_000;

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
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return { sessions, refresh };
}
