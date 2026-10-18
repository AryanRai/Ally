import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSessionSync, replyReaderVisible } from './useSessionSync';
import type { ChatsApi } from './useChats';
import type { AgentSessionSnapshot } from '../../electron/agent/types';

const original = window.pip;
afterEach(() => { window.pip = original; vi.restoreAllMocks(); document.querySelector('[data-ally-reply-reader]')?.parentElement?.remove(); });
const snapshot = (text: string, revision: string): AgentSessionSnapshot => ({ revision, messages: [{ role: 'assistant', content: text, timestamp: 1 }] });

describe('selected session synchronization', () => {
  it('updates on notifications and ignores a late response after switching chats', async () => {
    let notify: (provider: 'codex') => void = () => {};
    const unsubscribe = vi.fn();
    const loadSession = vi.fn().mockResolvedValueOnce(snapshot('Initial', '1'));
    window.pip = { agent: { loadSession, onSessionsChanged: (fn: typeof notify) => { notify = fn; return unsubscribe; } } } as unknown as typeof window.pip;
    const sync = vi.fn();
    const chats = (id: string) => ({ activeChat: { id, agent: { provider: 'codex', sessionId: id } }, syncAgentSession: sync }) as unknown as ChatsApi;
    const { rerender, unmount } = renderHook(({ id }) => useSessionSync(chats(id), false), { initialProps: { id: 'first' } });
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
    let finish: (value: AgentSessionSnapshot) => void = () => {};
    loadSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    act(() => notify('codex'));
    expect(loadSession).toHaveBeenLastCalledWith('codex', 'first', '1');
    loadSession.mockResolvedValueOnce(snapshot('Second chat', '2'));
    rerender({ id: 'second' });
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
    await act(async () => finish(snapshot('Stale first chat', '3')));
    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync.mock.calls[1][0]).toBe('second');
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('pauses disk refresh while Ally owns a live turn', async () => {
    const loadSession = vi.fn().mockResolvedValue(snapshot('Saved reply', '1'));
    window.pip = { agent: { loadSession, onSessionsChanged: () => () => {} } } as unknown as typeof window.pip;
    const chats = { activeChat: { id: 'c', agent: { provider: 'claude', sessionId: 's' } }, syncAgentSession: vi.fn() } as unknown as ChatsApi;
    const { rerender, unmount } = renderHook(({ running }) => useSessionSync(chats, running), { initialProps: { running: true } });
    expect(loadSession).not.toHaveBeenCalled();
    rerender({ running: false });
    await waitFor(() => expect(chats.syncAgentSession).toHaveBeenCalledTimes(1));
    unmount();
  });
});


it('acknowledges only the exact rendered reply while its reader is visible and focused', async () => {
  let notify: (provider: 'codex') => void = () => {};
  const markRead = vi.fn().mockResolvedValue(true);
  const value = { ...snapshot('Ready', 'history'), readState: { key: 'codex:s', revision: 'reply-1', unread: true } };
  const loadSession = vi.fn().mockResolvedValue(value);
  const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  window.pip = { agent: { loadSession, markRead, onSessionsChanged: (fn: typeof notify) => { notify = fn; return () => {}; } } } as unknown as typeof window.pip;
  const clip = document.createElement('div'); clip.style.overflowY = 'auto';
  const reader = document.createElement('div'); reader.dataset.allyReplyReader = 'true'; clip.append(reader); document.body.append(clip);
  const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top } as DOMRect);
  vi.spyOn(clip, 'getBoundingClientRect').mockReturnValue(rect(0, 100));
  const bounds = vi.spyOn(reader, 'getBoundingClientRect').mockReturnValue(rect(200, 240));
  const chats = { activeChat: { id: 'c', agent: { provider: 'codex', sessionId: 's' } }, syncAgentSession: vi.fn() } as unknown as ChatsApi;
  const { unmount } = renderHook(() => useSessionSync(chats, false));
  await waitFor(() => expect(chats.syncAgentSession).toHaveBeenCalled());
  expect(markRead).not.toHaveBeenCalled();
  focus.mockReturnValue(true);
  act(() => notify('codex'));
  await waitFor(() => expect(loadSession).toHaveBeenCalledTimes(2));
  expect(replyReaderVisible()).toBe(false); expect(markRead).not.toHaveBeenCalled();
  bounds.mockReturnValue(rect(20, 80));
  act(() => notify('codex'));
  await waitFor(() => expect(markRead).toHaveBeenCalledWith('codex', 's', 'reply-1'));
  unmount();
});
