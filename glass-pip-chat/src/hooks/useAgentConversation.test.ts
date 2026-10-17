import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAgentConversation } from './useAgentConversation';
import { useChats } from './useChats';
import { ChatManager } from '../utils/chatManager';

const agent = vi.hoisted(() => ({ runTurn: vi.fn(), config: { defaultCwd: '/work' } }));
vi.mock('./useAgentChat', () => ({ useAgentChat: () => agent }));
vi.mock('./useSessionSync', () => ({ useSessionSync: () => false, sessionMessages: () => [] }));
afterEach(() => vi.clearAllMocks());

describe('failed desktop sends', () => {
  it('returns the failure, saves the original text, releases busy state and allows a retry', async () => {
    localStorage.clear();
    (ChatManager as unknown as { instance?: ChatManager }).instance = undefined;
    const manager = ChatManager.getInstance();
    const chat = manager.openAgentSession({ provider: 'codex', sessionId: 's', cwd: '/work' }, 'Chat', []);
    agent.runTurn.mockResolvedValueOnce({ text: '', thinking: '', segments: [], error: 'Already owned' });
    const { result } = renderHook(() => useAgentConversation({ chats: useChats(), robotMode: false }));
    let sendResult: unknown;
    await act(async () => { sendResult = await result.current.send('Original follow-up', 'text', { context: 'Clipboard context' }); });
    expect(sendResult).toEqual({ error: 'Already owned' });
    expect(manager.getChatById(chat.id)?.sendFailure).toEqual({ message: 'Already owned', text: 'Original follow-up' });
    expect(result.current.isTyping).toBe(false);
    agent.runTurn.mockResolvedValueOnce({ text: 'Received', thinking: '', segments: [] });
    await act(async () => { await result.current.send('Original follow-up'); });
    expect(manager.getChatById(chat.id)?.sendFailure).toBeUndefined();
    expect(agent.runTurn).toHaveBeenCalledTimes(2);
  });
});
