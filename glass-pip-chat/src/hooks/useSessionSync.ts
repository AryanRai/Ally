import { useEffect, useRef } from 'react';
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

/** Follow the selected on-disk conversation without acquiring an agent writer. */
export function useSessionSync(chats: ChatsApi, locallyRunning: boolean) {
  const latest = useRef(chats);
  latest.current = chats;
  const chatId = chats.activeChat?.id;
  const provider = chats.activeChat?.agent?.provider;
  const sessionId = chats.activeChat?.agent?.sessionId;
  useEffect(() => {
    const api = window.pip?.agent;
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
        if (!snapshot.unchanged) latest.current.syncAgentSession(chatId, provider, sessionId, sessionMessages(sessionId, snapshot.messages), snapshot.cwd);
      } catch { /* A writer may rename its file. Keep the current view and retry. */ }
      finally { inFlight = false; }
    };
    const unsubscribe = api.onSessionsChanged(changed => { if (changed === provider) void refresh(); });
    const interval = setInterval(refresh, 2000);
    window.addEventListener('focus', refresh);
    void refresh();
    return () => { disposed = true; unsubscribe(); clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [chatId, provider, sessionId, locallyRunning]);
}
