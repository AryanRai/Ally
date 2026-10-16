import { useCallback, useState } from 'react';
import { ChatManager } from '../utils/chatManager';
import type { Chat, Message } from '../types/chat';

/**
 * React view of the persisted chat list (ChatManager owns the data in
 * localStorage; every mutation re-reads a fresh snapshot so React re-renders).
 */
export function useChats() {
  const [manager] = useState(() => ChatManager.getInstance());
  const snapshot = () => ({
    chats: manager.getAllChats().map(c => ({ ...c })),
    active: manager.getActiveChat(),
  });
  const [state, setState] = useState(snapshot);

  const refresh = useCallback(() => setState(snapshot()), [manager]);
  const mutate = useCallback(<T,>(fn: (m: ChatManager) => T): T => {
    const result = fn(manager);
    refresh();
    return result;
  }, [manager, refresh]);

  const activeChat = state.active ? { ...state.active, messages: [...state.active.messages] } : null;

  return {
    chats: state.chats,
    activeChat,
    /** Fresh read, for code that runs after an await */
    getChat: (chatId: string): Chat | null => manager.getChatById(chatId),
    select: (chatId: string) => mutate(m => m.switchToChat(chatId)),
    create: () => mutate(m => m.createNewChat()),
    remove: (chatId: string) => mutate(m => m.deleteChat(chatId)),
    rename: (chatId: string, title: string) => mutate(m => m.updateChatTitle(chatId, title)),
    addMessage: (chatId: string, message: Message) => mutate(m => m.addMessage(chatId, message)),
    updateMessage: (chatId: string, messageId: string, content: string) => mutate(m => m.updateMessage(chatId, messageId, content)),
    forkAtMessage: (chatId: string, messageId: string, content: string) => mutate(m => m.editMessage(chatId, messageId, content)),
    deleteMessage: (chatId: string, messageId: string) => mutate(m => m.deleteMessage(chatId, messageId)),
    setAgent: (chatId: string, agent: Chat['agent']) => mutate(m => m.setChatAgent(chatId, agent)),
    openAgentSession: (agent: NonNullable<Chat['agent']>, title: string, messages: Message[]) =>
      mutate(m => m.openAgentSession(agent, title, messages)),
  };
}

export type ChatsApi = ReturnType<typeof useChats>;
