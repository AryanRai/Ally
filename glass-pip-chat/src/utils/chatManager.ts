import { Chat, Message, ChatState } from '../types/chat';

const CHAT_STORAGE_KEY = 'glass_pip_chats';
const SELECTION_KEY = 'ally-active-chat';
type SavedSelection = Pick<Chat, 'id' | 'title' | 'agent' | 'createdAt' | 'updatedAt'>;

/** Keep reported usage and interrupted output omitted by app-server history. */
function retainUsage(previous: Message[], incoming: Message[]): Message[] {
  const key = (m: Message) => `${m.role}:${m.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()}`;
  const candidates = new Map<string, Message[]>();
  const previousKeys = previous.map(key);
  const userPositions = new Map<string, number[]>();
  const candidateOffsets = new Map<string, number>();
  previous.forEach((message, index) => {
    const value = previousKeys[index];
    const bucket = candidates.get(value) ?? []; bucket.push(message); candidates.set(value, bucket);
    if (message.role === 'user') { const positions = userPositions.get(value) ?? []; positions.push(index); userPositions.set(value, positions); }
  });
  let previousUser = -1;
  return incoming.map(m => {
    const value = key(m);
    if (m.role === 'user') {
      const positions = userPositions.get(value) ?? [];
      // Binary search retains ordered duplicate-user matching without repeatedly
      // scanning and normalizing the entire long transcript.
      let left = 0, right = positions.length;
      while (left < right) { const middle = (left + right) >>> 1; if (positions[middle] <= previousUser) left = middle + 1; else right = middle; }
      previousUser = positions[left] ?? -1;
    }
    const localReply = previousUser >= 0 ? previous[previousUser + 1] : undefined;
    if (m.role === 'assistant' && m.content.trim() === '⏹️ Stopped' && localReply?.role === 'assistant' && localReply.content.endsWith('⏹️ Stopped')) {
      return { ...m, content: localReply.content, metadata: { ...localReply.metadata, usage: { ...localReply.metadata?.usage, ...m.metadata?.usage } } };
    }
    const offset = candidateOffsets.get(value) ?? 0;
    const old = candidates.get(value)?.[offset]; candidateOffsets.set(value, offset + 1);
    if (!old?.metadata?.usage) return m;
    return { ...m, metadata: { ...m.metadata, usage: { ...old.metadata.usage, ...m.metadata?.usage } } };
  });
}

export class ChatManager {
  private static instance: ChatManager;
  private state: ChatState;
  private compactCache = localStorage.getItem('ally-compact-chat-cache') === 'true';
  private recoveringStorage = false;
  selectionRestored = true;

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
          return this.restoreSelection(this.createInitialState());
        }
        for (const chat of parsed.chats) {
          const first = chat.messages.find(m => m.timestamp > 0)?.timestamp;
          if (chat.agent?.sessionId && first) chat.createdAt = Math.min(chat.createdAt, first);
        }
        return this.restoreSelection(parsed);
      }
    } catch (error) {
      console.error('Failed to load chat state:', error);
    }
    return this.restoreSelection(this.createInitialState());
  }

  /** Small independent record survives transcript quota failures and needs no native IO. */
  private restoreSelection(state: ChatState): ChatState {
    try {
      const selected: SavedSelection | null = JSON.parse(localStorage.getItem(SELECTION_KEY) || 'null');
      if (!selected || typeof selected.id !== 'string' || typeof selected.title !== 'string') return state;
      const agent = selected.agent;
      if (agent && (agent.provider !== 'codex' && agent.provider !== 'claude')) return state;
      const exact = state.chats.find(chat => chat.id === selected.id);
      // Only follow a persisted migration alias within the same provider.
      const linked = agent?.sessionId && state.chats.find(chat => chat.agent?.provider === agent.provider &&
        (chat.agent.sessionId === agent.sessionId || chat.agent.originalSessionId === agent.sessionId ||
          (!!agent.originalSessionId && chat.agent.sessionId === agent.originalSessionId)));
      const target = exact || linked;
      if (target) {
        state.activeChat = target.id;
        if (target.id !== selected.id) {
          // A canonical local row may have replaced an old migration alias.
          // Carry its draft forward without overwriting either saved draft.
          const drafts = JSON.parse(localStorage.getItem('ally-chat-drafts') || '{}');
          if (typeof drafts[selected.id] === 'string' && !Object.hasOwn(drafts, target.id)) {
            drafts[target.id] = drafts[selected.id];
            localStorage.setItem('ally-chat-drafts', JSON.stringify(drafts));
          }
        }
      }
      else {
        // History may not have fit in storage. Keep the exact local ID (and draft
        // key) available; normal read-only sync hydrates the linked session later.
        state.chats.push({ id: selected.id, title: selected.title, agent,
          createdAt: Number.isFinite(selected.createdAt) ? selected.createdAt : 0,
          updatedAt: Number.isFinite(selected.updatedAt) ? selected.updatedAt : 0, messages: [] });
        state.activeChat = selected.id;
      }
    } catch (error) { console.error('Failed to restore selected chat:', error); }
    return state;
  }

  private saveSelection(): void {
    try {
      const chat = this.getActiveChat();
      const selected: SavedSelection | null = chat && { id: chat.id, title: chat.title, agent: chat.agent, createdAt: chat.createdAt, updatedAt: chat.updatedAt };
      localStorage.setItem(SELECTION_KEY, JSON.stringify(selected));
    } catch (error) { this.recoverStorage(error); console.error('Failed to save selected chat:', error); }
  }

  /** Keep full overflow data before freeing the reloadable native transcript cache. */
  private recoverStorage(error: unknown): void {
    if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError' || this.recoveringStorage || typeof indexedDB === 'undefined') return;
    this.recoveringStorage = true;
    const backup = JSON.stringify(this.state), previous = localStorage.getItem(CHAT_STORAGE_KEY);
    const request = indexedDB.open('ally-chat-recovery', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onerror = () => { this.recoveringStorage = false; };
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({ previous, current: backup, savedAt: Date.now() }, 'before-compaction');
      tx.oncomplete = () => {
        db.close();
        try {
          localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(this.cachedState(true)));
          localStorage.setItem('ally-compact-chat-cache', 'true');
          this.compactCache = true;
          this.saveSelection();
        } catch (failure) { console.error('Chat cache recovery failed; full backup retained:', failure); }
        finally { this.recoveringStorage = false; }
      };
      tx.onabort = tx.onerror = () => { db.close(); this.recoveringStorage = false; };
    };
  }

  private cachedState(compact = this.compactCache): ChatState {
    if (!compact) return this.state;
    return { ...this.state, chats: this.state.chats.map(chat => chat.agent?.sessionId && !chat.sendFailure
      ? { ...chat, messages: [] } : chat) };
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
            '• **Ctrl+Shift+C** switches between my notch and floating window from anywhere',
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
    this.saveSelection();
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(this.cachedState()));
    } catch (error) {
      this.recoverStorage(error);
      console.error('Failed to save chat state:', error);
    }
  }

  createNewChat(title?: string): Chat {
    this.selectionRestored = false;
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
    this.selectionRestored = false;
    if (this.state.activeChat === chatId) return true;

    this.state.activeChat = chatId;
    this.saveSelection();
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
  openAgentSession(agent: NonNullable<Chat['agent']>, title: string, messages?: Message[], createdAt?: number): Chat {
    this.selectionRestored = false;
    let chat = this.state.chats.find(c => c.agent?.provider === agent.provider && (c.agent?.sessionId === agent.sessionId || (!!agent.originalSessionId && c.agent?.sessionId === agent.originalSessionId)));
    const now = Date.now();
    if (chat) {
      if (messages) chat.messages = retainUsage(chat.messages, messages);
      chat.agent = agent;
      if (createdAt && agent.sessionId) chat.createdAt = Math.min(chat.createdAt, createdAt);
    } else {
      chat = { id: `chat_${now}_${Math.random().toString(36).substr(2, 9)}`, title, messages: messages ?? [], createdAt: createdAt ?? messages?.find(m => m.timestamp > 0)?.timestamp ?? 0, updatedAt: messages?.at(-1)?.timestamp ?? 0, agent };
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
