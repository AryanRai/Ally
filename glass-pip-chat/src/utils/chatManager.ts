import { Chat, Message, ChatState } from '../types/chat';

const CHAT_STORAGE_KEY = 'glass_pip_chats';

/** Keep reported usage and interrupted output omitted by app-server history. */
function retainUsage(previous: Message[], incoming: Message[]): Message[] {
  const key = (m: Message) => `${m.role}:${m.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()}`;
  const candidates = new Map<string, Message[]>();
  for (const m of previous) candidates.set(key(m), [...(candidates.get(key(m)) ?? []), m]);
  let previousUser = -1;
  return incoming.map(m => {
    if (m.role === 'user') {
      previousUser = previous.findIndex((old, index) => index > previousUser && old.role === 'user' && key(old) === key(m));
    }
    const localReply = previousUser >= 0 ? previous[previousUser + 1] : undefined;
    if (m.role === 'assistant' && m.content.trim() === '⏹️ Stopped' && localReply?.role === 'assistant' && localReply.content.endsWith('⏹️ Stopped')) {
      return { ...m, content: localReply.content, metadata: { ...localReply.metadata, usage: { ...localReply.metadata?.usage, ...m.metadata?.usage } } };
    }
    const old = candidates.get(key(m))?.shift();
    if (!old?.metadata?.usage) return m;
    return { ...m, metadata: { ...m.metadata, usage: { ...old.metadata.usage, ...m.metadata?.usage } } };
  });
}

export class ChatManager {
  private static instance: ChatManager;
  private state: ChatState;

  private constructor() {
    this.state = this.loadState();
  }

  static getInstance(): ChatManager {
    if (!ChatManager.instance) {
      ChatManager.instance = new ChatManager();
    }
    return ChatManager.instance;
  }

  private loadState(): ChatState {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatState;
        // Ensure we have at least one chat
        if (parsed.chats.length === 0) {
          return this.createInitialState();
        }
        for (const chat of parsed.chats) {
          const first = chat.messages.find(m => m.timestamp > 0)?.timestamp;
          if (chat.agent?.sessionId && first) chat.createdAt = Math.min(chat.createdAt, first);
        }
        return parsed;
      }
    } catch (error) {
      console.error('Failed to load chat state:', error);
    }
    return this.createInitialState();
  }

  private createInitialState(): ChatState {
    const now = Date.now();
    const initialChat: Chat = {
      id: `chat_${now}_${Math.random().toString(36).substr(2, 9)}`,
      title: 'Welcome Chat',
      messages: [
        {
          id: '1',
          role: 'assistant',
          content: [
            "Hi, I'm Ally. Pick **Claude Code** or **Codex** in the model menu, choose a working folder, and talk to it here.",
            '',
            '• **Agent sessions** (bottom of the sidebar) continue chats you started in Claude Code or Codex',
            '• **Ctrl+Shift+C** shows or hides me from anywhere',
            '• Copy something, then hit **Explain** to ask about it',
          ].join('\n'),
          timestamp: now
        }
      ],
      createdAt: now,
      updatedAt: now
    };

    return {
      chats: [initialChat],
      activeChat: initialChat.id
    };
  }

  private saveState(): void {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('Failed to save chat state:', error);
    }
  }

  createNewChat(title?: string): Chat {
    const now = Date.now();
    const chat: Chat = {
      id: `chat_${now}_${Math.random().toString(36).substr(2, 9)}`,
      title: title || `Chat ${this.state.chats.length + 1}`,
      messages: [],
      createdAt: now,
      updatedAt: now
    };

    this.state.chats.push(chat);
    this.state.activeChat = chat.id;
    this.saveState();
    return chat;
  }

  deleteChat(chatId: string): boolean {
    const chatIndex = this.state.chats.findIndex(chat => chat.id === chatId);
    if (chatIndex === -1) return false;

    // Don't allow deleting the last chat
    if (this.state.chats.length === 1) {
      return false;
    }

    this.state.chats.splice(chatIndex, 1);

    // If we deleted the active chat, switch to another one
    if (this.state.activeChat === chatId) {
      this.state.activeChat = this.state.chats[0]?.id || null;
    }

    this.saveState();
    return true;
  }

  switchToChat(chatId: string): boolean {
    const chat = this.state.chats.find(c => c.id === chatId);
    if (!chat) return false;

    this.state.activeChat = chatId;
    this.saveState();
    return true;
  }

  addMessage(chatId: string, message: Message): boolean {
    const chat = this.state.chats.find(c => c.id === chatId);
    if (!chat) return false;

    chat.messages.push(message);
    chat.updatedAt = Date.now();

    // Auto-generate title from first user message if it's still default
    if (chat.messages.length === 1 && message.role === 'user' && chat.title.startsWith('Chat ')) {
      chat.title = this.generateChatTitle(message.content);
    }

    this.saveState();
    return true;
  }

  updateChatTitle(chatId: string, title: string): boolean {
    const chat = this.state.chats.find(c => c.id === chatId);
    if (!chat) return false;

    chat.title = title.trim() || `Chat ${this.state.chats.indexOf(chat) + 1}`;
    chat.updatedAt = Date.now();
    this.saveState();
    return true;
  }

  private generateChatTitle(content: string): string {
    // Extract first meaningful words from the message
    const words = content.trim().split(/\s+/).slice(0, 4);
    let title = words.join(' ');
    
    // Remove command prefixes for cleaner titles
    title = title.replace(/^\/(?:run|cmd|exec)(?:@\w+)?\s*/, '');
    
    // Limit length
    if (title.length > 30) {
      title = title.substring(0, 27) + '...';
    }
    
    return title || 'New Chat';
  }

  getActiveChat(): Chat | null {
    if (!this.state.activeChat) return null;
    return this.state.chats.find(c => c.id === this.state.activeChat) || null;
  }

  getAllChats(): Chat[] {
    return [...this.state.chats].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  }

  getChatById(chatId: string): Chat | null {
    return this.state.chats.find(c => c.id === chatId) || null;
  }

  editMessage(chatId: string, messageId: string, newContent: string): boolean {
    const chat = this.state.chats.find(c => c.id === chatId);
    if (!chat) return false;

    const messageIndex = chat.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return false;

    // Create a new chat with messages up to and including the edited message
    const forkedMessages = chat.messages.slice(0, messageIndex + 1);
    
    // Update the last message with new content
    forkedMessages[forkedMessages.length - 1] = {
      ...forkedMessages[forkedMessages.length - 1],
      content: newContent,
      timestamp: Date.now()
    };

    // Create a new forked chat
    const now = Date.now();
    const forkedChat: Chat = {
      id: `chat_${now}_${Math.random().toString(36).substr(2, 9)}`,
      title: `${chat.title} (edited)`,
      messages: forkedMessages,
      createdAt: now,
      updatedAt: now,
      // Same agent and folder, but a fresh session: the history has diverged
      agent: chat.agent && { provider: chat.agent.provider, cwd: chat.agent.cwd },
    };

    // Add the forked chat and switch to it
    this.state.chats.push(forkedChat);
    this.state.activeChat = forkedChat.id;
    this.saveState();
    return true;
  }

  updateMessage(chatId: string, messageId: string, newContent: string): boolean {
    const chat = this.state.chats.find(c => c.id === chatId);
    if (!chat) return false;

    const message = chat.messages.find(m => m.id === messageId);
    if (!message) return false;

    message.content = newContent;
    message.timestamp = Date.now();
    chat.updatedAt = Date.now();
    this.saveState();
    return true;
  }

  deleteMessage(chatId: string, messageId: string): boolean {
    const chat = this.state.chats.find(c => c.id === chatId);
    if (!chat) return false;

    const messageIndex = chat.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return false;

    chat.messages.splice(messageIndex, 1);
    chat.updatedAt = Date.now();
    this.saveState();
    return true;
  }

  getState(): ChatState {
    return { ...this.state };
  }

  /** Keep send feedback independent of the periodically replaced native transcript. */
  setSendFailure(chatId: string, failure?: Chat['sendFailure']): boolean {
    const chat = this.getChatById(chatId);
    if (!chat) return false;
    chat.sendFailure = failure;
    this.saveState();
    return true;
  }

  /** Link (or re-link) a chat to a Claude Code / Codex session */
  setChatAgent(chatId: string, agent: Chat['agent']): boolean {
    const chat = this.state.chats.find(c => c.id === chatId);
    if (!chat) return false;
    chat.agent = agent;
    this.saveState();
    return true;
  }

  /**
   * Open an existing agent session as a chat. Reuses the chat already linked to
   * that session (refreshing its messages) instead of creating a duplicate.
   */
  openAgentSession(agent: NonNullable<Chat['agent']>, title: string, messages: Message[], createdAt?: number): Chat {
    let chat = this.state.chats.find(c => c.agent?.provider === agent.provider && (c.agent?.sessionId === agent.sessionId || (!!agent.originalSessionId && c.agent?.sessionId === agent.originalSessionId)));
    const now = Date.now();
    if (chat) {
      chat.messages = retainUsage(chat.messages, messages);
      chat.agent = agent;
      if (createdAt && agent.sessionId) chat.createdAt = Math.min(chat.createdAt, createdAt);
    } else {
      chat = { id: `chat_${now}_${Math.random().toString(36).substr(2, 9)}`, title, messages, createdAt: createdAt ?? messages.find(m => m.timestamp > 0)?.timestamp ?? 0, updatedAt: messages.at(-1)?.timestamp ?? 0, agent };
      this.state.chats.push(chat);
    }
    this.state.activeChat = chat.id;
    this.saveState();
    return chat;
  }

  /** Refresh a linked transcript without changing selection, drafts or its local title. */
  syncAgentSession(chatId: string, provider: 'claude' | 'codex', sessionId: string, messages: Message[], cwd?: string): boolean {
    const chat = this.getChatById(chatId);
    if (!chat?.agent || chat.agent.provider !== provider || chat.agent.sessionId !== sessionId) return false;
    messages = retainUsage(chat.messages, messages);
    if (JSON.stringify(chat.messages) === JSON.stringify(messages) && (!cwd || chat.agent.cwd === cwd)) return false;
    chat.messages = messages;
    if (cwd) chat.agent.cwd = cwd;
    chat.updatedAt = messages.at(-1)?.timestamp ?? chat.updatedAt;
    this.saveState();
    return true;
  }

}
