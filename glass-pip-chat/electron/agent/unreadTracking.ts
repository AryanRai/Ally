import { hiddenConversation } from './codexDiscovery.js';
import { reconcileNativeUnread } from './codexUnread.js';
import { listRunningSessions, isManagedSessionRunning } from './runningSessions.js';
import { loadAgentSession } from './sessions.js';
import { loadCodexChat } from './codexHistory.js';
import { completeUnread, chatKey, trackUnread, trackedUnread } from './unread.js';
import type { AgentSessionSummary } from './types.js';
/** Track external running -> finished with read-only history confirmation.
 * A disappearing/offline row alone never means a completed unread reply. */
export function startUnreadTracking() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const pending = new Map<string, AgentSessionSummary>(trackedUnread().flatMap(key => {
    const match = /^(codex|claude):(.+)$/.exec(key);
    return match ? [[key, { provider: match[1] as AgentSessionSummary['provider'], id: match[2], title: '', updatedAt: 0 }]] : [];
  }));
  const poll = async () => {
    try {
      const running = await listRunningSessions();
      if (stopped) return;
      const keys = new Set(running.map(s => chatKey(s.provider, s.id)));
      for (const s of running) if (!isManagedSessionRunning(s.provider, s.id)) { pending.set(chatKey(s.provider, s.id), s); trackUnread(s.provider, s.id); }
      for (const [key, s] of pending) {
        if (stopped) break;
        if (hiddenConversation(s.provider, s.id)) { pending.delete(key); continue; }
        if (isManagedSessionRunning(s.provider, s.id)) { pending.delete(key); continue; }
        if (keys.has(key)) continue;
        try {
          const snapshot = s.provider === 'codex' ? await loadCodexChat(s.id) : await loadAgentSession(s.provider, s.id);
          if (!stopped && !snapshot.running && snapshot.messages.at(-1)?.role === 'assistant') {
            if (s.provider !== 'codex' || !await reconcileNativeUnread(snapshot.sessionId ?? s.id)) completeUnread(s.provider, snapshot.sessionId ?? s.id, 'history:' + snapshot.revision);
            pending.delete(key);
          }
        } catch { /* Retain candidate and retry after connection recovers. */ }
      }
    } catch { /* Poll failure is not completion. */ }
    if (!stopped) timer = setTimeout(poll, 5000);
  };
  void poll();
  return () => { stopped = true; clearTimeout(timer); pending.clear(); };
}
