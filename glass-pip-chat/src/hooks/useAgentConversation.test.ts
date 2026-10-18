import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAgentConversation } from './useAgentConversation';
import { useChats } from './useChats';
import { ChatManager } from '../utils/chatManager';

const agent = vi.hoisted(() => ({ runTurn: vi.fn(), steer: vi.fn(), stop: vi.fn(), config: { defaultCwd: '/work' } }));
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
  it('adds guidance to the running chat without starting or stopping another turn', async () => {
    localStorage.clear();
    (ChatManager as unknown as { instance?: ChatManager }).instance = undefined;
    const manager = ChatManager.getInstance();
    const chat = manager.openAgentSession({ provider: 'codex', sessionId: 's', cwd: '/work' }, 'Chat', []);
    let finish!: (result: unknown) => void;
    agent.runTurn.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    agent.steer.mockResolvedValueOnce('steered');
    const { result } = renderHook(() => useAgentConversation({ chats: useChats(), robotMode: false }));
    let turn!: ReturnType<typeof result.current.send>;
    await act(async () => { turn = result.current.send('original'); });
    await act(async () => { await result.current.send('also test reconnects'); });
    expect(agent.steer).toHaveBeenCalledWith('also test reconnects', undefined, chat.id);
    expect(agent.runTurn).toHaveBeenCalledOnce();
    expect(agent.stop).not.toHaveBeenCalled();
    expect(result.current.isTyping).toBe(true);
    expect(result.current.inputStatus).toBe('Added to current work');
    expect(manager.getChatById(chat.id)?.messages.filter(m => m.role === 'user').map(m => m.content)).toEqual(['original', 'also test reconnects']);
    await act(async () => { finish({ text: 'Done', thinking: '', segments: [] }); await turn; });
  });

  it('keeps failed extra input for retry while the original work continues', async () => {
    localStorage.clear();
    (ChatManager as unknown as { instance?: ChatManager }).instance = undefined;
    const manager = ChatManager.getInstance();
    const chat = manager.openAgentSession({ provider: 'codex', sessionId: 's', cwd: '/work' }, 'Chat', []);
    let finish!: (result: unknown) => void;
    agent.runTurn.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    agent.steer.mockRejectedValueOnce(new Error('Delivery unconfirmed'));
    const { result } = renderHook(() => useAgentConversation({ chats: useChats(), robotMode: false }));
    let turn!: ReturnType<typeof result.current.send>;
    await act(async () => { turn = result.current.send('original'); });
    await act(async () => { expect(await result.current.send('extra')).toEqual({ error: 'Delivery unconfirmed' }); });
    expect(manager.getChatById(chat.id)?.sendFailure?.text).toBe('extra');
    expect(result.current.isTyping).toBe(true); expect(agent.stop).not.toHaveBeenCalled();
    await act(async () => { finish({ text: 'Done', thinking: '', segments: [] }); await turn; });
  });

});


it('projects only the selected stream and saves background results in their original chats', async () => {
  localStorage.clear();
  (ChatManager as unknown as { instance?: ChatManager }).instance = undefined;
  const manager = ChatManager.getInstance();
  const first = manager.openAgentSession({ provider: 'codex', sessionId: 'one', cwd: '/work' }, 'First', []);
  const second = manager.openAgentSession({ provider: 'codex', sessionId: 'two', cwd: '/work' }, 'Second', []);
  manager.switchToChat(first.id);
  const pending = new Map<string, { cb: any; finish: (result: any) => void }>();
  agent.runTurn.mockImplementation((_opts, cb, id) => new Promise(resolve => pending.set(id, { cb, finish: resolve })));
  const { result } = renderHook(() => { const chats = useChats(); return { chats, conversation: useAgentConversation({ chats, robotMode: false }) }; });
  let a!: Promise<unknown>, b!: Promise<unknown>;
  await act(async () => { a = result.current.conversation.send('A'); });
  act(() => { pending.get(first.id)!.cb.onText('first live'); result.current.chats.select(second.id); });
  expect(result.current.conversation.isTyping).toBe(false); expect(result.current.conversation.currentResponse).toBe('');
  await act(async () => { b = result.current.conversation.send('B'); });
  act(() => { pending.get(first.id)!.cb.onText('first newer'); pending.get(second.id)!.cb.onText('second live'); });
  expect(result.current.conversation.currentResponse).toBe('second live');
  act(() => result.current.conversation.stop()); expect(agent.stop).toHaveBeenCalledWith(second.id);
  await act(async () => { pending.get(first.id)!.finish({ text: 'first done', thinking: '', segments: [] }); await a; });
  expect(result.current.conversation.isTyping).toBe(true); expect(result.current.conversation.currentResponse).toBe('second live');
  expect(manager.getChatById(first.id)!.messages.at(-1)!.content).toBe('first done');
  await act(async () => { pending.get(second.id)!.finish({ text: 'second done', thinking: '', segments: [] }); await b; });
  expect(manager.getChatById(second.id)!.messages.at(-1)!.content).toBe('second done');
});
