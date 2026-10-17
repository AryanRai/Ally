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
});

function freshManagerKeepingStorage(): ChatManager {
  (ChatManager as unknown as { instance?: ChatManager }).instance = undefined;
  return ChatManager.getInstance();
}
