import { beforeEach, describe, expect, it } from 'vitest';
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
