import { Chat, Message, ChatState } from '../types/chat';

const CHAT_STORAGE_KEY = 'glass_pip_chats';

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
          content: "Hello! I'm your glass PiP chat assistant. How can I help you today!\n\n💡 **Available commands:**\n• `/run <command>` - Execute local commands\n• `/run@target <command>` - Execute remote commands\n• `/cmd <command>` - Alternative command syntax\n• `/exec <command>` - Another command syntax\n\n🎯 **Local examples:**\n• `/run git status` - Check git status\n• `/run npm install` - Install npm packages\n• `/run code .` - Open current directory in VS Code\n\n🌐 **Remote examples:**\n• `/run@docker ps` - Run in Docker container\n• `/run@myserver uptime` - Run on custom server\n• `/run@ssh-host ls -la` - Run on SSH server",
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
    return [...this.state.chats].sort((a, b) => b.updatedAt - a.updatedAt);
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
      updatedAt: now
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
}