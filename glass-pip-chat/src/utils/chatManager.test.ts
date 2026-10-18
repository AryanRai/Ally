import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatManager } from './chatManager';

// ChatManager is a singleton that loads once; reset its private instance per test
function freshManager(): ChatManager {
  localStorage.clear();
  (ChatManager as unknown as { instance?: ChatManager }).instance = undefined;
  return ChatManager.getInstance();
}

const message = (id: string, role: 'user' | 'assistant' = 'user') => ({ id, role, content: `msg ${id}`, timestamp: Date.now() });

describe('ChatManager', () => {
  let manager: ChatManager;
  beforeEach(() => {
    manager = freshManager();
  });
  it('retains repeated-question stopped output in order across a long native refresh', () => {
    const history = Array.from({ length: 1000 }, (_, i) => [
      { id: `u${i}`, role: 'user' as const, content: 'Same question', timestamp: i * 2 },
      { id: `a${i}`, role: 'assistant' as const, content: `Partial ${i}\n\n⏹️ Stopped`, timestamp: i * 2 + 1 },
    ]).flat();
    const chat = manager.openAgentSession({ provider: 'codex', sessionId: 'long' }, 'Long', history);
    const incoming = history.map(message => message.role === 'assistant' ? { ...message, content: '⏹️ Stopped' } : { ...message });
    manager.syncAgentSession(chat.id, 'codex', 'long', incoming);
    expect(chat.messages.filter(message => message.role === 'assistant').map(message => message.content)).toEqual(history.filter(message => message.role === 'assistant').map(message => message.content));
  });

  it('keeps creation order through browsing, streaming, renaming, sending and restart', () => {
    const old = manager.openAgentSession({provider:'codex',sessionId:'old'}, 'Old', [{...message('u'),timestamp:10}], 5);
    const newer = manager.openAgentSession({provider:'claude',sessionId:'new'}, 'New', [{...message('v'),timestamp:20}], 15);
    const order = () => manager.getAllChats().map(c=>c.id);
    const before = order();
    manager.switchToChat(old.id);
    manager.openAgentSession(old.agent!, 'Old', [{...message('reply','assistant'),timestamp:500}], 5);
    manager.updateChatTitle(old.id, 'Renamed');
    manager.addMessage(old.id, message('follow-up'));
    manager.syncAgentSession(old.id,'codex','old',[{...message('done','assistant'),timestamp:999}]);
    expect(order()).toEqual(before);
    expect(order().indexOf(newer.id)).toBeLessThan(order().indexOf(old.id));
    manager = freshManagerKeepingStorage();
    expect(order()).toEqual(before);
    expect(manager.createNewChat('Newest').id).toBe(order()[0]);
  });

  it('starts with a welcome chat', () => {
    expect(manager.getAllChats()).toHaveLength(1);
    expect(manager.getActiveChat()?.messages[0].role).toBe('assistant');
  });

  it('persists exact selection without serializing or rewriting any transcript', () => {
    const first = manager.openAgentSession({ provider: 'codex', sessionId: 'same' }, 'First', [message('one')]);
    manager.openAgentSession({ provider: 'claude', sessionId: 'same' }, 'Other provider', [message('two')]);
    localStorage.setItem('ally-chat-drafts', JSON.stringify({ [first.id]: 'Unsent draft' }));
    const transcript = localStorage.getItem('glass_pip_chats');
    const stringify = vi.spyOn(JSON, 'stringify');
    manager.switchToChat(first.id);
    expect(stringify).toHaveBeenCalledTimes(1);
    expect(stringify.mock.calls[0][0]).not.toHaveProperty('messages');
    stringify.mockRestore();
    expect(localStorage.getItem('glass_pip_chats')).toBe(transcript);
    expect(freshManagerKeepingStorage().getActiveChat()).toEqual(first);
    expect(JSON.parse(localStorage.getItem('ally-chat-drafts')!)[first.id]).toBe('Unsent draft');
  });

  it('retains exact local and session identity if a transcript exceeds storage quota', () => {
    const original = Storage.prototype.setItem;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
      if (key === 'glass_pip_chats') throw new DOMException('Full', 'QuotaExceededError');
      original.call(this, key, value);
    });
    const chat = manager.openAgentSession({ provider: 'codex', sessionId: 'unavailable', originalSessionId: 'old', cwd: '/exact' }, 'Exact title', [message('huge')]);
    storage.mockRestore(); log.mockRestore();
    const reloaded = freshManagerKeepingStorage();
    expect(reloaded.getActiveChat()).toMatchObject({ id: chat.id, agent: chat.agent, title: chat.title, messages: [] });
    expect(reloaded.getAllChats().filter(c => c.agent?.sessionId === 'unavailable')).toHaveLength(1);
  });

  it('uses a saved migration alias only within its original provider', () => {
    const codex = manager.openAgentSession({ provider: 'codex', sessionId: 'new', originalSessionId: 'old' }, 'Migrated');
    manager.openAgentSession({ provider: 'claude', sessionId: 'old' }, 'Different provider');
    localStorage.setItem('ally-active-chat', JSON.stringify({ id: 'missing-local-id', title: 'Original', agent: { provider: 'codex', sessionId: 'old' } }));
    localStorage.setItem('ally-chat-drafts', JSON.stringify({'missing-local-id':'Original draft'}));
    const reloaded = freshManagerKeepingStorage();
    expect(reloaded.getActiveChat()?.id).toBe(codex.id);
    expect(JSON.parse(localStorage.getItem('ally-chat-drafts')!)[codex.id]).toBe('Original draft');
    expect(reloaded.getAllChats()).toHaveLength(manager.getAllChats().length);
    reloaded.switchToChat(reloaded.getAllChats().find(c => c.agent?.provider === 'claude')!.id);
    expect(freshManagerKeepingStorage().getActiveChat()?.agent?.provider).toBe('claude');
  });

  it('keeps legacy selected chats and ignores corrupt selection metadata', () => {
    const chat = manager.createNewChat('Legacy');
    localStorage.removeItem('ally-active-chat');
    expect(freshManagerKeepingStorage().getActiveChat()?.id).toBe(chat.id);
    localStorage.setItem('ally-active-chat', JSON.stringify({ id: 123, title: 'Invalid' }));
    expect(freshManagerKeepingStorage().getActiveChat()?.id).toBe(chat.id);
  });

  it('creates, switches to and persists chats', () => {
    const chat = manager.createNewChat('Test');
    manager.addMessage(chat.id, message('a'));
    expect(manager.getActiveChat()?.id).toBe(chat.id);

    const reloaded = freshManagerKeepingStorage();
    expect(reloaded.getChatById(chat.id)?.messages).toHaveLength(1);
  });

  it('links a chat to an agent session', () => {
    const chat = manager.createNewChat();
    manager.setChatAgent(chat.id, { provider: 'claude', sessionId: 's1', cwd: 'C:\\proj' });
    expect(manager.getChatById(chat.id)?.agent).toEqual({ provider: 'claude', sessionId: 's1', cwd: 'C:\\proj' });
  });

  it('reuses the chat already linked to an imported session', () => {
    const agent = { provider: 'codex' as const, sessionId: 'thread-1', cwd: 'C:\\proj' };
    const first = manager.openAgentSession(agent, 'Imported', [message('a')]);
    const again = manager.openAgentSession(agent, 'Imported', [message('a'), message('b', 'assistant')]);
    expect(again.id).toBe(first.id);
    expect(manager.getChatById(first.id)?.messages).toHaveLength(2);
    expect(manager.getActiveChat()?.id).toBe(first.id);
  });

  it('forks into a new chat that keeps the agent but not the session', () => {
    const chat = manager.createNewChat();
    manager.addMessage(chat.id, message('a'));
    manager.addMessage(chat.id, message('b', 'assistant'));
    manager.setChatAgent(chat.id, { provider: 'claude', sessionId: 's1', cwd: 'C:\\proj' });

    manager.editMessage(chat.id, 'a', 'edited');
    const fork = manager.getActiveChat()!;
    expect(fork.id).not.toBe(chat.id);
    expect(fork.messages.map(m => m.content)).toEqual(['edited']);
    expect(fork.agent).toEqual({ provider: 'claude', cwd: 'C:\\proj' });
  });

  it('keeps locally reported usage when API history omits token counts', () => {
    const chat = manager.openAgentSession({ provider: 'codex', sessionId: 's' }, 'Chat', [{ id: 'a', role: 'assistant', content: '<think>Check</think>\n\nDone', timestamp: 1, metadata: { usage: { inputTokens: 10, outputTokens: 2 } } }]);
    manager.syncAgentSession(chat.id, 'codex', 's', [{ id: 'remote', role: 'assistant', content: 'Done', timestamp: 2, metadata: { usage: { durationMs: 100 } } }]);
    expect(chat.messages[0].metadata?.usage).toEqual({ inputTokens: 10, outputTokens: 2, durationMs: 100 });
  });
  it('retains partial stopped output across history sync without resurrecting reverted turns', () => {
    const prompt = message('prompt');
    const partial = { ...message('reply', 'assistant'), content: '1 2 3\n\n⏹️ Stopped' };
    const chat = manager.openAgentSession({ provider: 'codex', sessionId: 's' }, 'Chat', [prompt, partial]);
    manager.syncAgentSession(chat.id, 'codex', 's', [prompt, { ...partial, id: 'remote', content: '⏹️ Stopped' }]);
    expect(chat.messages[1].content).toBe(partial.content);
    manager.syncAgentSession(chat.id, 'codex', 's', []);
    expect(chat.messages).toEqual([]);
  });
  it('preserves a rejected send and its draft across native history sync, reopen and restart', () => {
    const agent = { provider: 'codex' as const, sessionId: 'owned' };
    const chat = manager.openAgentSession(agent, 'Owned chat', [message('saved')]);
    const failure = { message: 'Codex desktop still owns this chat', text: 'My unsent follow-up' };
    manager.setSendFailure(chat.id, failure);
    manager.syncAgentSession(chat.id, 'codex', 'owned', [message('remote')]);
    manager.openAgentSession(agent, 'Owned chat', [message('reopened')]);
    manager = freshManagerKeepingStorage();
    expect(manager.getChatById(chat.id)?.sendFailure).toEqual(failure);
    manager.setSendFailure(chat.id);
    expect(freshManagerKeepingStorage().getChatById(chat.id)?.sendFailure).toBeUndefined();
  });
});

function freshManagerKeepingStorage(): ChatManager {
  (ChatManager as unknown as { instance?: ChatManager }).instance = undefined;
  return ChatManager.getInstance();
}
