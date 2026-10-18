import { useEffect } from 'react';
import { RESUME_PROMPT } from '../../electron/agent/resumePrompt';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAgentConversation } from './useAgentConversation';
import { useChats } from './useChats';
import { ChatManager } from '../utils/chatManager';

const agent = vi.hoisted(() => ({ runTurn: vi.fn(), steer: vi.fn(), stop: vi.fn(), config: { defaultCwd: '/work' } }));
vi.mock('./useAgentChat', () => ({ useAgentChat: () => agent }));
const sync = vi.hoisted(() => ({ control: { token: undefined as string | undefined, canStop: false } }));
vi.mock('./useSessionSync', () => ({ useSessionSync: (_chats: unknown, _running: boolean, callback?: (value: typeof sync.control) => void) => { useEffect(() => callback?.(sync.control), [callback]); return false; }, sessionMessages: () => [] }));
afterEach(() => { vi.clearAllMocks(); sync.control = { token: undefined, canStop: false }; });

describe('failed desktop sends', () => {
  it('selects immediately, shares repeated opens and never returns to an old chat after hydration', async () => {
    localStorage.clear(); (ChatManager as unknown as { instance?: ChatManager }).instance = undefined;
    let finish!: (snapshot: unknown) => void;
    const loadSession = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    window.pip = { agent: { loadSession } } as any;
    const { result } = renderHook(() => { const chats = useChats(); return { chats, conversation: useAgentConversation({ chats, robotMode: false }) }; });
    const session = { provider: 'codex' as const, id: 'original', title: 'Study', createdAt: 10, updatedAt: 20 };
    let first!: Promise<unknown>, duplicate!: Promise<unknown>;
    act(() => { first = result.current.conversation.openSession(session); duplicate = result.current.conversation.openSession(session); });
    expect(result.current.chats.activeChat?.agent?.sessionId).toBe('original');
    expect(loadSession).toHaveBeenCalledOnce();
    act(() => { result.current.chats.create(); });
    const selected = result.current.chats.activeChat!.id;
    await act(async () => { finish({ revision: 'r', messages: [], sessionId: 'original', cwd: '/work' }); await Promise.all([first, duplicate]); });
    expect(result.current.chats.activeChat!.id).toBe(selected);
    expect(result.current.chats.chats.filter(c => c.agent?.sessionId === 'original')).toHaveLength(1);
  });
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


it('resumes the selected original provider once even when another provider is the composer default', async () => {
  localStorage.clear(); localStorage.setItem('ally-agent-model', 'claude:default');
  (ChatManager as unknown as { instance?: ChatManager }).instance = undefined;
  const manager = ChatManager.getInstance();
  const chat = manager.openAgentSession({provider:'codex',sessionId:'original',cwd:'/work'},'Stopped chat',[]);
  sync.control = {token:'stopped-receipt',canStop:false};
  let finish!: (value: unknown) => void;
  agent.runTurn.mockImplementationOnce(() => new Promise(resolve => {finish=resolve}));
  const {result} = renderHook(()=>useAgentConversation({chats:useChats(),robotMode:false}));
  expect(result.current.canResume).toBe(true);
  let resumed!: ReturnType<typeof result.current.resume>;
  await act(async()=> {resumed=result.current.resume(); await result.current.resume();});
  expect(agent.runTurn).toHaveBeenCalledOnce();
  expect(agent.runTurn.mock.calls[0][0]).toMatchObject({provider:'codex', sessionId:'original', cwd:'/work', model:'default',resumeToken:'stopped-receipt',prompt:RESUME_PROMPT});
  expect(manager.getChatById(chat.id)?.messages.filter(m=>m.role==='user')).toHaveLength(1);
  await act(async()=>{finish({text:'Continuing',thinking:'',segments:[]});await resumed;});
});
