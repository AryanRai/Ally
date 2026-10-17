import { useEffect, useRef, useState } from 'react';
import type { AgentHistoryMessage } from '@/types/agent';
import type { Message } from '@/types/chat';
import type { ChatsApi } from './useChats';

export function sessionMessages(sessionId: string, messages: AgentHistoryMessage[]): Message[] {
  return messages.map((m, i) => ({
    id: `${m.role}-${sessionId}-${i}`,
    role: m.role, content: m.content, timestamp: m.timestamp,
    metadata: m.segments || m.images || m.usage ? { segments: m.segments, images: m.images, usage: m.usage } : undefined,
  }));
}

/**
 * Follow the selected on-disk conversation without acquiring an agent writer.
 * Returns whether that conversation is mid-turn in another app (Claude Code / Codex).
 */
export function useSessionSync(chats: ChatsApi, locallyRunning: boolean): boolean {
  const [externalRunning, setExternalRunning] = useState(false);
  const latest = useRef(chats);
  latest.current = chats;
  const chatId = chats.activeChat?.id;
  const provider = chats.activeChat?.agent?.provider;
  const sessionId = chats.activeChat?.agent?.sessionId;
  useEffect(() => {
    const api = window.pip?.agent;
    setExternalRunning(false);
    if (!api || !chatId || !provider || !sessionId || locallyRunning) return;
    let disposed = false;
    let inFlight = false;
    let revision: string | undefined;
    const refresh = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const snapshot = await api.loadSession(provider, sessionId, revision);
        if (disposed) return;
        revision = snapshot.revision;
        const title = latest.current.activeChat?.title;
        if (snapshot.title && title?.startsWith('You are Ally on a round smartwatch.')) latest.current.rename(chatId, snapshot.title);
        setExternalRunning(!!snapshot.running);
        const resolved = snapshot.sessionId ?? sessionId;
        if (resolved !== sessionId) latest.current.setAgent(chatId, { provider, sessionId: resolved, originalSessionId: snapshot.originalSessionId ?? sessionId, cwd: snapshot.cwd });
        if (!snapshot.unchanged) latest.current.syncAgentSession(chatId, provider, resolved, sessionMessages(resolved, snapshot.messages), snapshot.cwd);
      } catch { /* A writer may rename its file. Keep the current view and retry. */ }
      finally { inFlight = false; }
    };
    const unsubscribe = api.onSessionsChanged(changed => { if (changed === provider) void refresh(); });
    const interval = setInterval(refresh, 2000);
    window.addEventListener('focus', refresh);
    void refresh();
    return () => { disposed = true; unsubscribe(); clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [chatId, provider, sessionId, locallyRunning]);
  return externalRunning;
}
