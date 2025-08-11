# Multichat Features

This document outlines the new multichat functionality added to Glass PiP Chat.

## Features Added

### 1. Multiple Chat Sessions
- **Chat Management**: Create, switch between, and manage multiple chat sessions
- **Persistent Storage**: All chats are automatically saved to localStorage
- **Auto-naming**: Chat titles are automatically generated from the first user message

### 2. Chat Sidebar
- **Chat List**: View all your chat sessions in a collapsible sidebar
- **Quick Actions**: Rename, delete, and switch between chats
- **Visual Indicators**: See last message preview and timestamp for each chat
- **Responsive Design**: Sidebar can be collapsed to save space

### 3. Chat Operations
- **Create New Chat**: Click the "+" button or use the new chat option
- **Switch Chats**: Click on any chat in the sidebar to switch to it
- **Rename Chats**: Right-click or use the menu to rename any chat
- **Delete Chats**: Remove unwanted chats (minimum of 1 chat required)

### 4. UI Improvements
- **Sidebar Toggle**: Show/hide the chat sidebar with the menu button
- **Dynamic Sizing**: Window automatically resizes based on sidebar state
- **Current Chat Display**: Header shows the active chat title
- **Smooth Animations**: All transitions are animated for better UX

## Technical Implementation

### Components Added
- `ChatSidebar.tsx` - Main sidebar component for chat management
- `AnimatedOrb.tsx` - Visual indicator for chat activity
- `types/chat.ts` - TypeScript interfaces for chat data
- `utils/chatManager.ts` - Singleton class for chat state management

### Key Features
- **Singleton Pattern**: ChatManager ensures consistent state across the app
- **Auto-save**: All changes are automatically persisted to localStorage
- **Error Handling**: Graceful fallbacks for corrupted or missing data
- **Performance**: Efficient updates and minimal re-renders

## Usage

### Creating a New Chat
1. Click the "+" button in the sidebar header
2. Or use the dashed button when sidebar is collapsed
3. New chat will be created and automatically selected

### Switching Between Chats
1. Click on any chat in the sidebar list
2. The main chat area will update to show that chat's messages
3. The header will display the current chat title

### Managing Chats
1. Hover over a chat to see the menu button (⋯)
2. Click to open the context menu
3. Choose "Rename" to change the chat title
4. Choose "Delete" to remove the chat (if more than 1 exists)

### Sidebar Controls
- **Menu Button**: Toggle sidebar visibility
- **Collapse Button**: Minimize sidebar to icon-only view
- **New Chat Button**: Create a new chat session

## Keyboard Shortcuts
- All existing shortcuts remain functional
- Sidebar can be toggled with the menu button in the header

## Storage
- Chats are stored in localStorage under the key `glass_pip_chats`
- Each chat includes: ID, title, messages, creation time, and last update time
- Automatic cleanup and migration for future versions

## Backwards Compatibility
- Existing single-chat usage is preserved
- First-time users get a welcome chat with instructions
- No breaking changes to existing functionality