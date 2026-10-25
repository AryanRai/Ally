import { useEffect, useRef, useState } from 'react';
import type { Chat } from '@/types/chat';
import type { AgentPermission, AgentSessionSummary } from '@/types/agent';
import type { SelectionSnapshot } from '../../electron/agent/selection';

const identity = (chat: Chat | null) => chat?.agent?.sessionId ? `${chat.agent.provider}:${chat.agent.sessionId}` : chat?.id ?? '';

/** Navigation only: opening a native session never submits or forks a turn. */
export function useSharedChatSelection(chat: Chat | null, restored: boolean, permission: AgentPermission, openSession: (session: AgentSessionSummary) => Promise<unknown>) {
  const latest = useRef({ chat, restored, permission, openSession });
  latest.current = { chat, restored, permission, openSession };
  const state = useRef<SelectionSnapshot | undefined>(undefined);
  const lastLocal = useRef('');
  const serial = useRef(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const receive = useRef<(value: SelectionSnapshot, initial?: boolean) => void>(() => {});
  receive.current = (value, initial = false) => {
    state.current = value;
    setReady(true); setError('');
    if (!initial && value.origin === 'desktop') return;
    const selected = value.selected;
    if (!selected) return;
    // Remember the current local selection before opening, so a metadata render
    // cannot republish it while the requested session is being selected.
    lastLocal.current = identity(latest.current.chat);
    if (selected.sessionId && identity(latest.current.chat) !== `${selected.provider}:${selected.sessionId}`) {
      void latest.current.openSession({ provider: selected.provider, id: selected.sessionId, title: selected.title, cwd: selected.cwd, updatedAt: 0 }).catch(e => setError(`Chat sync: ${String(e)}`));
    }
  };
  useEffect(() => {
    const agent = window.pip?.agent;
    if (!agent?.getSelection || !agent.onSelection) return;
    let alive = true, events = 0;
    const stop = agent.onSelection(value => { events++; if (alive) receive.current(value); });
    void agent.getSelection().then(value => { if (alive && !events) receive.current(value, true); }).catch(e => { if (alive) setError(`Chat sync unavailable: ${String(e)}`); });
    return () => { alive = false; stop(); };
  }, []);
  const key = identity(chat);
  useEffect(() => {
    if (!ready || !restored || key === lastLocal.current) return;
    lastLocal.current = key;
    const linked = chat?.agent;
    if (linked?.sessionId && state.current?.selected?.provider === linked.provider && state.current.selected.sessionId === linked.sessionId) return;
    serial.current = serial.current.catch(() => {}).then(async () => {
      if (key !== identity(latest.current.chat) || !state.current) return;
      const current = latest.current.chat, agent = current?.agent;
      const result = await window.pip.agent!.setSelection(agent?.sessionId ? {
        chatId: `${agent.provider}:${agent.sessionId}`, provider: agent.provider, sessionId: agent.sessionId,
        title: current!.title, cwd: agent.cwd, permission: latest.current.permission,
      } : null, state.current.version);
      if (!result.accepted && key === identity(latest.current.chat)) receive.current(result, true);
    }).catch(e => setError(`Chat sync unavailable: ${String(e)}`));
  }, [key, ready, restored]);
  return error;
}
