import { useEffect, useRef, useState } from 'react';
import type { Chat } from '@/types/chat';
import type { AgentPermission, AgentSessionSummary } from '@/types/agent';
import type { SelectionSnapshot } from '../../electron/agent/selection';

const identity = (chat: Chat | null) => chat?.agent?.sessionId ? `${chat.agent.provider}:${chat.agent.sessionId}` : chat?.id ?? '';

/** Navigation only: opening a native session never submits or forks a turn. */
export function useSharedChatSelection(chat: Chat | null, restored: boolean, permission: AgentPermission, openSession: (session: AgentSessionSummary) => Promise<unknown>, linkSession?: (chatId: string, agent: NonNullable<Chat['agent']>) => void, options?: { setPermission?: (permission: AgentPermission) => unknown; selectLocal?: (chatId: string) => boolean }) {
  const latest = useRef({ chat, restored, permission, openSession, linkSession, options });
  latest.current = { chat, restored, permission, openSession, linkSession, options };
  const state = useRef<SelectionSnapshot | undefined>(undefined);
  const lastLocal = useRef('');
  const lastMetadata = useRef('');
  const pendingTarget = useRef<string | undefined>(undefined);
  const pendingSource = useRef('');
  const serial = useRef(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const receive = useRef<(value: SelectionSnapshot, initial?: boolean) => void>(() => {});
  receive.current = (value, initial = false) => {
    state.current = value;
    setReady(true); setError('');
    const selected = value.selected;
    const local=latest.current.chat;
    // selectionRestored means the choice came from disk, not "ready". A user
    // selection flips it false permanently; that choice must still publish.
    if (initial && !latest.current.restored) return;
    if (selected && selected.permission !== latest.current.permission) latest.current.options?.setPermission?.(selected.permission);
    // The first Study turn belongs to this same local chat. Adopt its returned
    // real session before the desktop-origin echo guard; do not open a duplicate.
    if(selected?.sessionId && selected.chatId===local?.id && !local.agent?.sessionId && local.agent?.provider===selected.provider && latest.current.linkSession) {
      lastLocal.current=`${selected.provider}:${selected.sessionId}`;
      latest.current.linkSession(local.id,{...local.agent,sessionId:selected.sessionId,cwd:selected.cwd ?? local.agent.cwd});
      return;
    }
    if (!selected) return;
    const target = selected.sessionId ? `${selected.provider}:${selected.sessionId}` : selected.chatId;
    if (!initial && value.origin === 'desktop' && target === identity(local)) return;
    // Remember the current local selection before opening, so a metadata render
    // cannot republish it while the requested session is being selected.
    lastLocal.current = identity(latest.current.chat);
    if (target === identity(local)) return;
    if (!selected.sessionId && latest.current.options?.selectLocal?.(selected.chatId)) { lastLocal.current = target; return; }
    if (selected.sessionId && identity(latest.current.chat) !== `${selected.provider}:${selected.sessionId}`) {
      pendingTarget.current = target;
      pendingSource.current = identity(local);
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
  const metadata = JSON.stringify([key, chat?.title, chat?.agent?.cwd, permission]);
  useEffect(() => {
    if (!ready || (pendingTarget.current && pendingTarget.current !== key && pendingSource.current === key) || (key === lastLocal.current && metadata === lastMetadata.current)) return;
    if (pendingTarget.current === key || (pendingTarget.current && pendingSource.current !== key)) pendingTarget.current = undefined;
    lastLocal.current = key;
    lastMetadata.current = metadata;
    const linked = chat?.agent;
    if (linked && state.current?.selected?.provider === linked.provider && state.current.selected.sessionId === linked.sessionId && state.current.selected.title === chat.title && state.current.selected.cwd === linked.cwd && state.current.selected.permission === permission) return;
    serial.current = serial.current.catch(() => {}).then(async () => {
      if (key !== identity(latest.current.chat) || !state.current) return;
      const current = latest.current.chat, agent = current?.agent;
      const version = state.current.version;
      const result = await window.pip.agent!.setSelection(agent ? {
        chatId: agent.sessionId ? `${agent.provider}:${agent.sessionId}` : current!.id, provider: agent.provider, sessionId: agent.sessionId,
        title: current!.title, cwd: agent.cwd, permission: latest.current.permission,
      } : null, version);
      if (state.current.version === version) state.current = result;
      if (!result.accepted && key === identity(latest.current.chat)) receive.current(result, true);
    }).catch(e => setError(`Chat sync unavailable: ${String(e)}`));
  }, [key, metadata, ready, restored]);
  return error;
}
