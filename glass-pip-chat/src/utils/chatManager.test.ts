// Simple test file to verify ChatManager functionality
// Run this in browser console to test

import { ChatManager } from './chatManager';

export function testChatManager() {
  console.log('Testing ChatManager...');
  
  // Clear any existing data
  localStorage.removeItem('glass_pip_chats');
  
  // Create new instance
  const chatManager = ChatManager.getInstance();
  
  // Test 1: Initial state
  console.log('Test 1: Initial state');
  const initialChats = chatManager.getAllChats();
  console.log('Initial chats count:', initialChats.length);
  console.log('Active chat:', chatManager.getActiveChat()?.title);
  
  // Test 2: Create new chat
  console.log('\nTest 2: Create new chat');
  const newChat = chatManager.createNewChat('Test Chat');
  console.log('New chat created:', newChat.title);
  console.log('Total chats:', chatManager.getAllChats().length);
  
  // Test 3: Add message
  console.log('\nTest 3: Add message');
  const success = chatManager.addMessage(newChat.id, {
    id: 'msg1',
    role: 'user',
    content: 'Hello world!',
    timestamp: Date.now()
  });
  console.log('Message added:', success);
  console.log('Chat messages:', chatManager.getChatById(newChat.id)?.messages.length);
  
  // Test 4: Rename chat
  console.log('\nTest 4: Rename chat');
  chatManager.updateChatTitle(newChat.id, 'Renamed Chat');
  console.log('Chat renamed to:', chatManager.getChatById(newChat.id)?.title);
  
  // Test 5: Switch chat
  console.log('\nTest 5: Switch chat');
  const firstChat = chatManager.getAllChats()[0];
  chatManager.switchToChat(firstChat.id);
  console.log('Switched to:', chatManager.getActiveChat()?.title);
  
  console.log('\nAll tests completed!');
  return chatManager;
}

// Export for browser testing
(window as any).testChatManager = testChatManager;