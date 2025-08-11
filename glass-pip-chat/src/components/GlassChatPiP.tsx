import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { useEditState } from '../hooks/useEditState';
import { useWindowManagement } from '../hooks/useWindowManagement';
import { useContextMonitoring } from '../hooks/useContextMonitoring';
import { useOllamaIntegration } from '../hooks/useOllamaIntegration';
import { useCommandExecution } from '../hooks/useCommandExecution';

// Components
import SettingsModal from './SettingsModal';
import ChatSidebar from './ChatSidebar';
import EditableMessage from './EditableMessage';
import MarkdownRenderer from './MarkdownRenderer';
import ClickAwayHandler from './ClickAwayHandler';
import CollapsedHeader from './chat/CollapsedHeader';
import ExpandedHeader from './chat/ExpandedHeader';
import ContextDisplay from './chat/ContextDisplay';
import ChatInput from './chat/ChatInput';

// Utils & Types
import { ChatManager } from '../utils/chatManager';
import { SettingsManager } from '../utils/settingsManager';
import { Chat, Message } from '../types/chat';
import { AppSettings } from '../types/settings';

export default function GlassChatPiP() {
  // Window and UI management
  const {
    state,
    platform,
    theme,
    isResizing,
    setIsResizing,
    serverStatus,
    sizePx,
    handleSizeChange,
    handleCollapseToggle,
    handleHide
  } = useWindowManagement();

  // Context monitoring
  const contextMonitoring = useContextMonitoring();

  // Ollama integration
  const ollamaIntegration = useOllamaIntegration();

  // Command execution
  const { runningCommands, executeSystemCommand, runInTerminal } = useCommandExecution();

  // Chat management
  const [chatManager] = useState(() => ChatManager.getInstance());
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Settings management
  const [settingsManager] = useState(() => SettingsManager.getInstance());
  const [appSettings, setAppSettings] = useState<AppSettings>(() => settingsManager.getSettings());

  // UI state
  const [input, setInput] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [lastAssistantMessage, setLastAssistantMessage] = useState<string>('');

  // Copy functionality state
  const [copiedCode, setCopiedCode] = useState<Set<string>>(new Set());
  const [expandedContexts, setExpandedContexts] = useState<Set<string>>(new Set());

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Header title editing
  const headerTitleEdit = useEditState({
    initialValue: activeChat?.title || 'Chat',
    onSave: (newTitle) => {
      if (activeChat && chatManager.updateChatTitle(activeChat.id, newTitle)) {
        refreshChatState();
      }
    }
  });

  // Helper function to refresh chat state
  const refreshChatState = () => {
    setChats(chatManager.getAllChats());
    setActiveChat(chatManager.getActiveChat());
  };

  // Chat management functions
  const handleChatSelect = (chatId: string) => {
    chatManager.switchToChat(chatId);
    refreshChatState();
  };

  const handleChatCreate = () => {
    chatManager.createNewChat();
    refreshChatState();
  };

  const handleChatDelete = (chatId: string) => {
    if (chatManager.deleteChat(chatId)) {
      refreshChatState();
    }
  };

  const handleChatRename = (chatId: string, newTitle: string) => {
    if (chatManager.updateChatTitle(chatId, newTitle)) {
      refreshChatState();
    }
  };

  const addMessageToActiveChat = (message: Message) => {
    if (activeChat && chatManager.addMessage(activeChat.id, message)) {
      refreshChatState();
    }
  };

  const handleMessageEdit = (messageId: string, newContent: string) => {
    if (activeChat && chatManager.updateMessage(activeChat.id, messageId, newContent)) {
      refreshChatState();
    }
  };

  const handleMessageFork = (messageId: string, newContent: string) => {
    if (activeChat && chatManager.editMessage(activeChat.id, messageId, newContent)) {
      refreshChatState();
    }
  };

  const handleMessageDelete = (messageId: string) => {
    if (activeChat && chatManager.deleteMessage(activeChat.id, messageId)) {
      refreshChatState();
    }
  };

  const handleMessageCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  // Copy to clipboard function
  const copyToClipboard = async (text: string, codeId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(prev => new Set([...prev, codeId]));

      setTimeout(() => {
        setCopiedCode(prev => {
          const newSet = new Set(prev);
          newSet.delete(codeId);
          return newSet;
        });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Initialize chat management
  useEffect(() => {
    const loadChats = () => {
      const allChats = chatManager.getAllChats();
      setChats(allChats);
      setActiveChat(chatManager.getActiveChat());
    };
    loadChats();
  }, [chatManager]);

  // Listen for settings changes
  useEffect(() => {
    const unsubscribe = settingsManager.subscribe((newSettings) => {
      setAppSettings(newSettings);
    });
    return unsubscribe;
  }, [settingsManager]);

  // Sync window size when size state changes
  useEffect(() => {
    if (!window.pip) {
      console.warn('window.pip not available');
      return;
    }

    setIsResizing(true);
    const dims = sizePx[state.size];
    const sidebarWidth = state.collapsed ? 0 : (sidebarCollapsed ? 48 : 280);
    const width = dims.w + sidebarWidth + 16; // Add 16px for spacing (8px padding on each side)
    const height = (state.collapsed ? 120 : dims.h) + 16; // Add 16px for spacing (8px padding on top/bottom)

    console.log('Resizing window to:', width, 'x', height, 'collapsed:', state.collapsed, 'sidebar:', sidebarWidth);

    // Use a small delay to ensure state has settled
    const resizeTimeout = setTimeout(() => {
      try {
        window.pip.resizeWindow(width, height);
      } catch (error) {
        console.error('Failed to resize window:', error);
      }
    }, 50);

    // Reset resizing state after animation
    const resetTimeout = setTimeout(() => setIsResizing(false), 400);

    return () => {
      clearTimeout(resizeTimeout);
      clearTimeout(resetTimeout);
    };
  }, [state.size, state.collapsed, sidebarCollapsed]);

  // Track last assistant message for preview
  useEffect(() => {
    const messages = activeChat?.messages || [];
    const lastAssistant = messages.filter(m => m.role === 'assistant').slice(-1)[0];
    if (lastAssistant) {
      setLastAssistantMessage(lastAssistant.content);
    }
  }, [activeChat?.messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  // Focus input on custom event
  useEffect(() => {
    const handleFocusInput = () => {
      inputRef.current?.focus();
    };
    window.addEventListener('focus-chat-input', handleFocusInput);
    return () => window.removeEventListener('focus-chat-input', handleFocusInput);
  }, []);

  // Handle stop typing
  const handleStop = () => {
    setIsTyping(false);
  };

  // Main send function
  const handleSend = async (messageInput?: string, fromQuickInput?: boolean) => {
    const textToSend = messageInput || input.trim();
    if (!textToSend) return;

    // Check if this is a command execution request
    const isCommand = textToSend.startsWith('/run ') || textToSend.startsWith('/cmd ') || textToSend.startsWith('/exec ');

    if (isCommand) {
      await executeSystemCommand(
        textToSend,
        fromQuickInput || false,
        serverStatus,
        addMessageToActiveChat,
        setQuickInput,
        setInput,
        setIsTyping
      );
      return;
    }

    // Build message content with context if appropriate
    let messageContent = textToSend;
    const shouldIncludeContext = contextMonitoring.shouldIncludeContext(fromQuickInput || false, state.collapsed);

    if (shouldIncludeContext) {
      messageContent += contextMonitoring.buildContextMessage();
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: Date.now()
    };

    addMessageToActiveChat(userMessage);

    // Clear context flags if context was included
    if (shouldIncludeContext) {
      contextMonitoring.clearNewContextFlag();
    }

    // Auto-maximize if sending from minimized mode
    if (fromQuickInput && state.collapsed) {
      handleCollapseToggle();
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }

    // Clear input
    if (fromQuickInput) {
      setQuickInput('');
    } else {
      setInput('');
    }

    setIsTyping(true);

    try {
      const messages = activeChat?.messages || [];

      if (ollamaIntegration.ollamaAvailable && ollamaIntegration.currentModel) {
        // Create a temporary message for streaming
        const tempMessageId = (Date.now() + 1).toString();
        const streamingMessage: Message = {
          id: tempMessageId,
          role: 'assistant',
          content: '',
          timestamp: Date.now()
        };

        addMessageToActiveChat(streamingMessage);

        await ollamaIntegration.sendMessageToOllama(messages, messageContent, (update) => {
          if (activeChat) {
            const updatedMessages = activeChat.messages.map(msg =>
              msg.id === tempMessageId ? {
                ...msg,
                content: update.type === 'thinking'
                  ? `💭 **Thinking...**\n\n${update.thinking}\n\n---\n\n${update.response}`
                  : update.thinking
                    ? `💭 **Thinking Process:**\n\n${update.thinking}\n\n---\n\n**Response:**\n\n${update.response}`
                    : update.response
              } : msg
            );
            activeChat.messages = updatedMessages;
            setActiveChat({ ...activeChat });

            if (update.type === 'done') {
              chatManager.getChatById(activeChat.id)!.messages = updatedMessages;
            }
          }
        });
      } else {
        // Fallback response when Ollama is not available
        const reason = ollamaIntegration.getUnavailableReason();
        const response = `⚠️ **Ollama Unavailable**\n\nReason: ${reason}\n\nPlease:\n1. Make sure Ollama is installed and running\n2. Check that you have models installed (\`ollama list\`)\n3. Try refreshing the connection in Settings`;

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response,
          timestamp: Date.now()
        };

        addMessageToActiveChat(assistantMessage);
      }
    } catch (error) {
      console.error('Error getting response:', error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
        timestamp: Date.now()
      };

      addMessageToActiveChat(errorMessage);
    } finally {
      setIsTyping(false);
    }
  };

  const dims = sizePx[state.size];
  const messages = activeChat?.messages || [];

  return (
    <motion.div
      className="fixed bg-transparent flex items-center justify-center"
      style={{
        width: state.collapsed ? dims.w + 16 : (sidebarCollapsed ? dims.w + 48 + 16 : dims.w + 280 + 16),
        height: state.collapsed ? 120 + 16 : dims.h + 16,
        zIndex: 50
      } as React.CSSProperties}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: isResizing ? 1.02 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
    >
      <motion.div
        layout
        className={cn(
          "overflow-hidden relative flex transition-all duration-300",
          platform === 'win32' ? "rounded-3xl" : "rounded-2xl",
          "border border-white/20 shadow-[0_8px_40px_rgba(0,0,0,0.4)]",
          isResizing && "shadow-lg scale-[1.01]",
          platform === 'win32'
            ? "bg-transparent backdrop-blur-2xl backdrop-saturate-150"
            : theme === 'dark'
              ? "bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl backdrop-saturate-150"
              : "bg-gradient-to-b from-black/[0.08] to-black/[0.02] backdrop-blur-2xl backdrop-saturate-150",
          theme === 'dark' ? "text-white/90" : "text-black/90"
        )}
        style={{
          width: state.collapsed ? dims.w : (sidebarCollapsed ? dims.w + 48 : dims.w + 280),
          height: state.collapsed ? 120 : dims.h
        } as React.CSSProperties}
      >
        {/* Chat Sidebar */}
        {!state.collapsed && (
          <ChatSidebar
            chats={chats}
            activeChat={activeChat?.id || null}
            onChatSelect={handleChatSelect}
            onChatCreate={handleChatCreate}
            onChatDelete={handleChatDelete}
            onChatRename={handleChatRename}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            theme={theme}
            platform={platform}
          />
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2 border-b transition-all duration-200",
              "cursor-grab active:cursor-grabbing relative z-10 min-h-[44px]",
              state.collapsed && "flex-col items-stretch gap-2 pb-3 border-b-0",
              platform === 'win32'
                ? "border-white/10 hover:bg-white/5 hover:border-blue-500/30"
                : theme === 'dark'
                  ? "border-white/10 hover:bg-white/5 hover:border-blue-500/30"
                  : "border-black/10 hover:bg-black/5 hover:border-blue-500/30"
            )}
            style={{
              WebkitAppRegion: state.collapsed ? 'no-drag' : 'drag',
              WebkitUserSelect: 'none',
              userSelect: 'none'
            } as React.CSSProperties}
            title={state.collapsed ? "" : "Drag to move window"}
          >
            {state.collapsed ? (
              <CollapsedHeader
                platform={platform}
                theme={theme}
                isTyping={isTyping}
                lastAssistantMessage={lastAssistantMessage}
                quickInput={quickInput}
                setQuickInput={setQuickInput}
                onSend={handleSend}
                onStop={handleStop}
                onCollapseToggle={handleCollapseToggle}
                onSizeChange={handleSizeChange}
                onHide={handleHide}
                isResizing={isResizing}
                size={state.size}
                ollamaAvailable={ollamaIntegration.ollamaAvailable}
                serverStatus={serverStatus}
                hasNewContext={contextMonitoring.hasNewContext}
                contextData={contextMonitoring.contextData}
                contextToggleEnabled={contextMonitoring.contextToggleEnabled}
              />
            ) : (
              <ExpandedHeader
                platform={platform}
                theme={theme}
                isResizing={isResizing}
                sidebarCollapsed={sidebarCollapsed}
                onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                activeChat={activeChat}
                headerTitleEdit={headerTitleEdit}
                ollamaAvailable={ollamaIntegration.ollamaAvailable}
                serverStatus={serverStatus}
                hasNewContext={contextMonitoring.hasNewContext}
                contextData={contextMonitoring.contextData}
                showContext={contextMonitoring.showContext}
                onContextToggle={() => contextMonitoring.setShowContext(!contextMonitoring.showContext)}
                contextToggleEnabled={contextMonitoring.contextToggleEnabled}
                onContextToggleChange={contextMonitoring.setContextToggleEnabled}
                availableModels={ollamaIntegration.availableModels}
                currentModel={ollamaIntegration.currentModel}
                showModelSelector={ollamaIntegration.showModelSelector}
                onModelSelectorToggle={() => ollamaIntegration.setShowModelSelector(!ollamaIntegration.showModelSelector)}
                onModelSelect={(model) => {
                  ollamaIntegration.setCurrentModel(model);
                  ollamaIntegration.setShowModelSelector(false);
                }}
                onSizeChange={handleSizeChange}
                onSettings={() => setShowSettings(true)}
                onCollapseToggle={handleCollapseToggle}
                onHide={handleHide}
                size={state.size}
              />
            )}
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {!state.collapsed && (
              <motion.div
                key="content"
                className="flex flex-col h-[calc(100%-44px)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Context Display */}
                <ContextDisplay
                  platform={platform}
                  theme={theme}
                  showContext={contextMonitoring.showContext}
                  contextToggleEnabled={contextMonitoring.contextToggleEnabled}
                  hasNewContext={contextMonitoring.hasNewContext}
                  contextData={contextMonitoring.contextData}
                  recentlySelected={contextMonitoring.recentlySelected}
                  contextCollapsed={contextMonitoring.contextCollapsed}
                  setContextCollapsed={contextMonitoring.setContextCollapsed}
                  includeContextInMessage={contextMonitoring.includeContextInMessage}
                  setIncludeContextInMessage={contextMonitoring.setIncludeContextInMessage}
                  isMonitoring={contextMonitoring.isMonitoring}
                  onDismiss={() => contextMonitoring.setHasNewContext(false)}
                />

                {/* Messages */}
                <div className={cn(
                  "flex-1 overflow-y-auto p-3 select-text",
                  appSettings.ui.messageSpacing === 'compact' ? 'space-y-2' :
                    appSettings.ui.messageSpacing === 'normal' ? 'space-y-3' : 'space-y-4',
                  platform === 'win32'
                    ? "scrollbar-thin scrollbar-thumb-white/10"
                    : theme === 'dark' ? "scrollbar-thin scrollbar-thumb-white/10" : "scrollbar-thin scrollbar-thumb-black/10"
                )}>
                  {messages.map((message, index) => (
                    <EditableMessage
                      key={message.id}
                      message={message}
                      isLast={index === messages.length - 1}
                      onEdit={handleMessageEdit}
                      onFork={handleMessageFork}
                      onDelete={handleMessageDelete}
                      onCopy={handleMessageCopy}
                      onCopyCode={copyToClipboard}
                      onRunCode={(command, codeId) => runInTerminal(command, codeId, addMessageToActiveChat)}
                      theme={theme}
                      platform={platform}
                      uiSettings={appSettings.ui}
                    />
                  ))}
                  {isTyping && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-1 px-3 py-2"
                    >
                      <div className={cn(
                        "w-2 h-2 rounded-full animate-bounce",
                        platform === 'win32' ? "bg-white/40" : theme === 'dark' ? "bg-white/40" : "bg-black/40"
                      )} style={{ animationDelay: '0ms' }} />
                      <div className={cn(
                        "w-2 h-2 rounded-full animate-bounce",
                        platform === 'win32' ? "bg-white/40" : theme === 'dark' ? "bg-white/40" : "bg-black/40"
                      )} style={{ animationDelay: '150ms' }} />
                      <div className={cn(
                        "w-2 h-2 rounded-full animate-bounce",
                        platform === 'win32' ? "bg-white/40" : theme === 'dark' ? "bg-white/40" : "bg-black/40"
                      )} style={{ animationDelay: '300ms' }} />
                    </motion.div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chat Input */}
                <ChatInput
                  platform={platform}
                  theme={theme}
                  input={input}
                  setInput={setInput}
                  onSend={handleSend}
                  isTyping={isTyping}
                  onStop={handleStop}
                  contextData={contextMonitoring.contextData}
                  onExplainClipboard={() => {
                    setInput(`Explain this: ${contextMonitoring.contextData.clipboard}`);
                    contextMonitoring.clearNewContextFlag();
                  }}
                  onHelpSelected={() => {
                    setInput(`Help with: ${contextMonitoring.contextData.selectedText}`);
                    contextMonitoring.clearNewContextFlag();
                  }}
                  onRunCommand={() => setInput('/run ')}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Click away handlers */}
      <ClickAwayHandler
        isActive={ollamaIntegration.showModelSelector}
        onClickAway={() => ollamaIntegration.setShowModelSelector(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        platform={platform}
        theme={theme}
        contextToggleEnabled={contextMonitoring.contextToggleEnabled}
        onContextToggleChange={contextMonitoring.setContextToggleEnabled}
        appSettings={appSettings}
        onSettingsChange={(updates) => settingsManager.updateSettings(updates)}
      />
    </motion.div>
  );
}