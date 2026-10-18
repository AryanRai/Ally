import { useEffect, useRef, useState } from 'react';
import type { AgentHistoryMessage } from '@/types/agent';
import type { Message } from '@/types/chat';
import type { ChatsApi } from './useChats';
import { isDeviceProtocolTitle } from '../../electron/agent/chatTitle';

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
export function useSessionSync(chats: ChatsApi, locallyRunning: boolean, onControl?: (value: { token?: string; canStop: boolean }) => void): boolean {
  const [externalRunning, setExternalRunning] = useState(false);
  const control = useRef(onControl); control.current = onControl;
  const latest = useRef(chats);
  latest.current = chats;
  const readerEngaged = useRef(false);
  useEffect(() => {
    const engage = () => { readerEngaged.current = true; };
    const events = ['pointerdown', 'keydown', 'wheel'] as const;
    events.forEach(event => window.addEventListener(event, engage, { passive: true }));
    return () => events.forEach(event => window.removeEventListener(event, engage));
  }, []);
  const chatId = chats.activeChat?.id;
  const provider = chats.activeChat?.agent?.provider;
  const sessionId = chats.activeChat?.agent?.sessionId;
  useEffect(() => {
    const api = window.pip?.agent;
    setExternalRunning(false);
    control.current?.({ canStop: false });
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
        if (snapshot.title && title && isDeviceProtocolTitle(title)) latest.current.rename(chatId, snapshot.title);
        setExternalRunning(!!snapshot.running || !!snapshot.canStop);
        control.current?.({ token: snapshot.interrupted?.token, canStop: !!snapshot.canStop });
        const resolved = snapshot.sessionId ?? sessionId;
        if (resolved !== sessionId) latest.current.setAgent(chatId, { provider, sessionId: resolved, originalSessionId: snapshot.originalSessionId ?? sessionId, cwd: snapshot.cwd });
        if (!snapshot.unchanged) latest.current.syncAgentSession(chatId, provider, resolved, sessionMessages(resolved, snapshot.messages), snapshot.cwd);
        // Receipts are issued after the reply has reached React, only in a visible,
        // focused reader. Merely fetching history or leaving a chat selected is not reading.
        if ((!latest.current.selectionRestored || readerEngaged.current) && !snapshot.running && snapshot.readState?.unread && document.visibilityState === 'visible' && document.hasFocus()) {
          const receipt = snapshot.readState;
          requestAnimationFrame(() => {
            if (!disposed && latest.current.activeChat?.id === chatId && document.hasFocus() && document.visibilityState === 'visible'
              && replyReaderVisible()) void api.markRead?.(provider, resolved, receipt.revision).catch(() => {});
          });
        }
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

/** Check the content and every clipping ancestor, including a scrolled transcript. */
export function replyReaderVisible(): boolean {
  const reader = document.querySelector<HTMLElement>('[data-ally-reply-reader]');
  if (!reader) return false;
  let { top, bottom, left, right } = reader.getBoundingClientRect();
  top = Math.max(top, 0); bottom = Math.min(bottom, window.innerHeight);
  left = Math.max(left, 0); right = Math.min(right, window.innerWidth);
  for (let parent = reader.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden' || (style.opacity !== '' && Number(style.opacity) === 0)) return false;
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY + style.overflowX)) {
      const r = parent.getBoundingClientRect();
      top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom);
      left = Math.max(left, r.left); right = Math.min(right, r.right);
    }
  }
  return bottom - top >= 16 && right > left;
}
