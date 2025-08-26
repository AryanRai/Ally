import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import { ThemeUtils } from '../utils/themeUtils';
import { useEditState } from '../hooks/useEditState';
import { useWindowManagement } from '../hooks/useWindowManagement';
import { useContextMonitoring } from '../hooks/useContextMonitoring';
import { useOllamaIntegration } from '../hooks/useOllamaIntegration';
import { useCommandExecution } from '../hooks/useCommandExecution';
import { useAllyRemote } from '../hooks/useAllyRemote';

// Components
import SettingsModal from './SettingsModal';
import ChatSidebar from './ChatSidebar';
import EditableMessage from './EditableMessage';
import ClickAwayHandler from './ClickAwayHandler';
import CollapsedHeader from './chat/CollapsedHeader';
import ExpandedHeader from './chat/ExpandedHeader';
import ContextDisplay from './chat/ContextDisplay';
import ChatInput from './chat/ChatInput';
import { RemoteSettings } from './RemoteSettings';
import { SpeechControls } from './SpeechControls';
import { useSpeechService } from '../hooks/useSpeechService';
import { StreamingTest } from './StreamingTest';

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
  const { executeSystemCommand, runInTerminal } = useCommandExecution();

  // Remote control integration
  const allyRemote = useAllyRemote({
    allyName: 'Glass PiP Ally',
    autoConnect: true
  });

  // Speech service integration
  const speechService = useSpeechService();

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
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showSpeechControls, setShowSpeechControls] = useState(false);
  const [showStreamingTest, setShowStreamingTest] = useState(false);
  // Use voice mode state from speech service hook
  const { voiceModeEnabled, setVoiceModeEnabled, droidModeEnabled, setDroidModeEnabled } = speechService;
  // Copy functionality state
  // Local state no longer needed here

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

  // Speech recognition handler
  const handleSpeechRecognized = (text: string) => {
    console.log('Speech recognized:', text, 'Voice mode enabled:', voiceModeEnabled);
    if (!voiceModeEnabled) return;

    // If currently typing (AI is responding), interrupt it
    if (isTyping) {
      console.log('🛑 Interrupting current response for new speech input');

      // Stop current speech
      speechService.stopCurrentSpeech();

      // Stop the current Ollama request
      handleStop();

      // Small delay to ensure cleanup, then send new message
      setTimeout(() => {
        handleSendMessage(text);
      }, 200);
    } else {
      // Normal flow - just send the message
      handleSendMessage(text);
    }
  };

  // Handle sending messages (extracted for reuse)
  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || isTyping) return;

    // Clear input if using the input field
    if (!messageText) {
      setInput('');
    }

    // Add to input history
    if (!messageText) {
      setInputHistory(prev => [textToSend, ...prev.slice(0, 19)]);
      setHistoryIndex(-1);
    }

    // Create user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: Date.now(),
      metadata: messageText ? { source: 'speech' } : undefined
    };

    // Add user message to chat
    addMessageToActiveChat(userMessage);

    // Get context if enabled
    let contextualContent = textToSend;
    if (contextMonitoring.includeContextInMessage && contextMonitoring.contextData.clipboard) {
      contextualContent = `Context: ${contextMonitoring.contextData.clipboard}\n\nUser: ${textToSend}`;
      contextMonitoring.clearNewContextFlag();
    }

    setIsTyping(true);
    setCurrentResponse('');

    try {
      // Prepare messages for Ollama
      const messages = activeChat?.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })) || [];

      // Add the current message
      messages.push({
        role: 'user',
        content: contextualContent
      });

      // Stream response from Ollama with real-time thinking display
      const response = await ollamaIntegration.sendMessageToOllama(
        activeChat?.messages || [],
        contextualContent,
        (() => {
          let lastSentenceIndex = 0;
          let accumulatedResponse = '';

          return (update) => {
            let responseContent = '';

            if (update.type === 'thinking') {
              // Show thinking in real-time with typing indicator
              responseContent = `💭 **Thinking...**\n\n${update.thinking}${update.thinking.endsWith('.') || update.thinking.endsWith('!') || update.thinking.endsWith('?') ? '' : '▋'}`;
            } else if (update.type === 'response') {
              // Show both thinking (if any) and response
              if (update.thinking) {
                responseContent = `💭 **Thought Process:**\n\n${update.thinking}\n\n---\n\n**Answer:**\n\n${update.response}${update.response.endsWith('.') || update.response.endsWith('!') || update.response.endsWith('?') ? '' : '▋'}`;
              } else {
                responseContent = `${update.response}${update.response.endsWith('.') || update.response.endsWith('!') || update.response.endsWith('?') ? '' : '▋'}`;
              }

              // Stream TTS for new sentences if voice mode is enabled
              if (voiceModeEnabled && update.response) {
                accumulatedResponse = update.response;
                const sentences = accumulatedResponse.split(/(?<=[.!?])\s+/);

                // Check if we have new complete sentences to speak
                if (sentences.length > lastSentenceIndex + 1) {
                  for (let i = lastSentenceIndex; i < sentences.length - 1; i++) {
                    const sentence = sentences[i].trim();
                    if (sentence && sentence.length > 3) {
                      console.log('Streaming TTS for sentence:', sentence.substring(0, 30) + '...');
                      speechService.synthesizeSpeechStreaming(sentence).catch(error => {
                        console.error('Error in streaming TTS:', error);
                      });
                    }
                  }
                  lastSentenceIndex = sentences.length - 1;
                }
              }
            } else if (update.type === 'done') {
              // Final response without typing indicator
              if (update.thinking) {
                responseContent = `💭 **Thought Process:**\n\n${update.thinking}\n\n---\n\n**Answer:**\n\n${update.response}`;
              } else {
                responseContent = update.response;
              }

              // Speak any remaining incomplete sentence
              if (voiceModeEnabled && accumulatedResponse) {
                const sentences = accumulatedResponse.split(/(?<=[.!?])\s+/);
                const lastSentence = sentences[sentences.length - 1]?.trim();
                if (lastSentence && lastSentence.length > 3 && !lastSentence.match(/[.!?]$/)) {
                  console.log('Streaming TTS for final sentence:', lastSentence.substring(0, 30) + '...');
                  speechService.synthesizeSpeechStreaming(lastSentence).catch(error => {
                    console.error('Error in final streaming TTS:', error);
                  });
                }
              }
            }

            // Update current response for both collapsed and expanded modes
            setCurrentResponse(responseContent);
          };
        })()
      );

      if (response) {
        // Create assistant message only after streaming is complete
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response,
          timestamp: Date.now()
        };

        addMessageToActiveChat(assistantMessage);

        // TTS is already handled in real-time during streaming
      }
    } catch (error) {
      console.error('Error sending message:', error);

      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: Date.now()
      };

      addMessageToActiveChat(errorMessage);
    } finally {
      setIsTyping(false);
      setCurrentResponse('');
    }
  };

  const handleMessageRecompute = async (messageId: string) => {
    if (!activeChat) return;

    // Find the message to recompute
    const messageIndex = activeChat.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return; // Can't recompute first message or if not found

    // Get the user message that prompted this response
    const userMessage = activeChat.messages[messageIndex - 1];
    if (userMessage.role !== 'user') return;

    // Remove the current assistant response
    const updatedMessages = activeChat.messages.slice(0, messageIndex);
    const updatedChat = {
      ...activeChat,
      messages: updatedMessages
    };
    setActiveChat(updatedChat);

    // Set typing state and clear any current response
    setIsTyping(true);
    setCurrentResponse('');

    try {
      if (ollamaIntegration.ollamaAvailable && ollamaIntegration.currentModel) {
        // Get messages up to the user message (excluding the old response)
        const messagesUpToUser = updatedMessages.slice(0, messageIndex);

        const response = await ollamaIntegration.sendMessageToOllama(messagesUpToUser, userMessage.content, (() => {
          let lastSentenceIndex = 0;
          let accumulatedResponse = '';

          return (update) => {
            let responseContent = '';

            if (update.type === 'thinking') {
              // Show thinking in real-time with typing indicator
              responseContent = `💭 **Thinking...**\n\n${update.thinking}${update.thinking.endsWith('.') || update.thinking.endsWith('!') || update.thinking.endsWith('?') ? '' : '▋'}`;
            } else if (update.type === 'response') {
              // Show both thinking (if any) and response
              if (update.thinking) {
                responseContent = `💭 **Thought Process:**\n\n${update.thinking}\n\n---\n\n**Answer:**\n\n${update.response}${update.response.endsWith('.') || update.response.endsWith('!') || update.response.endsWith('?') ? '' : '▋'}`;
              } else {
                responseContent = `${update.response}${update.response.endsWith('.') || update.response.endsWith('!') || update.response.endsWith('?') ? '' : '▋'}`;
              }

              // Stream TTS for new sentences if voice mode is enabled
              if (voiceModeEnabled && update.response) {
                accumulatedResponse = update.response;
                const sentences = accumulatedResponse.split(/(?<=[.!?])\s+/);

                // Check if we have new complete sentences to speak
                if (sentences.length > lastSentenceIndex + 1) {
                  for (let i = lastSentenceIndex; i < sentences.length - 1; i++) {
                    const sentence = sentences[i].trim();
                    if (sentence && sentence.length > 3) {
                      console.log('Streaming TTS for recompute sentence:', sentence.substring(0, 30) + '...');
                      speechService.synthesizeSpeechStreaming(sentence).catch(error => {
                        console.error('Error in recompute streaming TTS:', error);
                      });
                    }
                  }
                  lastSentenceIndex = sentences.length - 1;
                }
              }
            } else if (update.type === 'done') {
              // Final response without typing indicator
              if (update.thinking) {
                responseContent = `💭 **Thought Process:**\n\n${update.thinking}\n\n---\n\n**Answer:**\n\n${update.response}`;
              } else {
                responseContent = update.response;
              }

              // Speak any remaining incomplete sentence
              if (voiceModeEnabled && accumulatedResponse) {
                const sentences = accumulatedResponse.split(/(?<=[.!?])\s+/);
                const lastSentence = sentences[sentences.length - 1]?.trim();
                if (lastSentence && lastSentence.length > 3 && !lastSentence.match(/[.!?]$/)) {
                  console.log('Streaming TTS for final recompute sentence:', lastSentence.substring(0, 30) + '...');
                  speechService.synthesizeSpeechStreaming(lastSentence).catch(error => {
                    console.error('Error in final recompute streaming TTS:', error);
                  });
                }
              }
            }

            // Update current response for both collapsed and expanded modes
            setCurrentResponse(responseContent);
          };
        })());

        if (response) {
          // Create assistant message only after streaming is complete
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: response,
            timestamp: Date.now()
          };

          addMessageToActiveChat(assistantMessage);
        }
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
      console.error('Error recomputing response:', error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to recompute response'}`,
        timestamp: Date.now()
      };

      addMessageToActiveChat(errorMessage);
    } finally {
      setIsTyping(false);
      setCurrentResponse('');
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

  // Get messages early for use in effects
  const messages = activeChat?.messages || [];

  // Listen for settings changes
  useEffect(() => {
    const unsubscribe = settingsManager.subscribe((newSettings) => {
      setAppSettings(newSettings);
    });
    return unsubscribe;
  }, [settingsManager]);

  // Handle incoming remote messages
  useEffect(() => {
    if (allyRemote.incomingMessages.length > 0) {
      const latestMessage = allyRemote.incomingMessages[allyRemote.incomingMessages.length - 1];

      // Add remote message to chat
      const remoteMessage: Message = {
        id: `remote-${Date.now()}`,
        content: `🌐 Remote: ${latestMessage}`,
        role: 'user',
        timestamp: new Date(),
        fromQuickInput: false
      };

      addMessageToActiveChat(remoteMessage);

      // Send response back to remote
      allyRemote.sendMessage(`Message received and processed: "${latestMessage}"`);

      // Clear the message from the queue
      allyRemote.clearMessages();
    }
  }, [allyRemote.incomingMessages, addMessageToActiveChat, allyRemote]);

  // Handle preview toggle callback
  const handlePreviewToggle = (expanded: boolean) => {
    setIsPreviewExpanded(expanded);
  };

  // Custom collapse toggle with state cleanup
  const handleCustomCollapseToggle = () => {
    const willBeCollapsed = !state.collapsed;

    // If we're collapsing TO collapsed mode, reset collapsed-specific states immediately
    if (willBeCollapsed) {
      setIsPreviewExpanded(false); // Reset message preview expansion
      setCurrentResponse(''); // Clear any current response

      // Call the original collapse toggle after a small delay to ensure state cleanup
      setTimeout(() => {
        handleCollapseToggle();

        // Force a resize after collapse to ensure proper dimensions
        setTimeout(() => {
          if (window.pip) {
            const padding = appSettings.ui.windowPadding * 2;
            // Calculate the actual collapsed height based on current state
            let actualCollapsedHeight = collapsedDims.baseHeight;
            // Add context height if context is present
            if (contextMonitoring.hasNewContext && (contextMonitoring.contextData.clipboard || contextMonitoring.contextData.selectedText)) {
              actualCollapsedHeight += collapsedDims.contextHeight;
            }

            const baseHeight = actualCollapsedHeight + padding;
            const baseWidth = collapsedDims.width + padding;

            console.log('Force resizing collapsed window to:', baseWidth, 'x', baseHeight, 'context present:', contextMonitoring.hasNewContext);
            window.pip.resizeWindow(baseWidth, baseHeight);
          }
        }, 150); // Increased delay to ensure state updates have propagated
      }, 10);
    } else {
      // Expanding - no cleanup needed, call immediately
      handleCollapseToggle();
    }
  };




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

  // Listen for speech toggle event
  useEffect(() => {
    const handleToggleSpeech = () => {
      setShowSpeechControls(prev => !prev);
    };

    if (window.pip?.onToggleSpeech) {
      const cleanup = window.pip.onToggleSpeech(handleToggleSpeech);
      return cleanup;
    }
  }, []);

  // Handle stop typing
  const handleStop = async () => {
    setIsTyping(false);
    setCurrentResponse(''); // Clear current response when stopping

    // Stop the Ollama request if it's running
    if (window.pip?.ollama?.stop) {
      try {
        await window.pip.ollama.stop();
        console.log('Ollama request stopped');
      } catch (error) {
        console.error('Failed to stop Ollama request:', error);
      }
    }
  };

  // Main send function (wrapper for backward compatibility)
  const handleSend = async (messageInput?: string, fromQuickInput?: boolean) => {
    await handleSendMessage(messageInput);
  };

  // Legacy send function
  const handleSendLegacy = async (messageInput?: string, fromQuickInput?: boolean) => {
    const textToSend = messageInput || input.trim();
    if (!textToSend) return;

    // Add to input history
    if (textToSend && !inputHistory.includes(textToSend)) {
      setInputHistory(prev => [...prev, textToSend].slice(-50)); // Keep last 50 messages
    }
    setHistoryIndex(-1); // Reset history index

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

    // Don't auto-expand when sending from collapsed mode - user can expand manually if needed

    // Clear input
    if (fromQuickInput) {
      setQuickInput('');
    } else {
      setInput('');
    }

    setIsTyping(true);
    setCurrentResponse(''); // Clear previous response

    try {
      if (ollamaIntegration.ollamaAvailable && ollamaIntegration.currentModel) {
        const response = await ollamaIntegration.sendMessageToOllama(messages, messageContent, (update) => {
          let responseContent = '';

          if (update.type === 'thinking') {
            // Show thinking in real-time with typing indicator
            responseContent = `💭 **Thinking...**\n\n${update.thinking}${update.thinking.endsWith('.') || update.thinking.endsWith('!') || update.thinking.endsWith('?') ? '' : '▋'}`;
          } else if (update.type === 'response') {
            // Show both thinking (if any) and response
            if (update.thinking) {
              responseContent = `💭 **Thought Process:**\n\n${update.thinking}\n\n---\n\n**Answer:**\n\n${update.response}${update.response.endsWith('.') || update.response.endsWith('!') || update.response.endsWith('?') ? '' : '▋'}`;
            } else {
              responseContent = `${update.response}${update.response.endsWith('.') || update.response.endsWith('!') || update.response.endsWith('?') ? '' : '▋'}`;
            }
          } else if (update.type === 'done') {
            // Final response without typing indicator
            if (update.thinking) {
              responseContent = `💭 **Thought Process:**\n\n${update.thinking}\n\n---\n\n**Answer:**\n\n${update.response}`;
            } else {
              responseContent = update.response;
            }
          }

          // Update current response for both collapsed and expanded modes
          setCurrentResponse(responseContent);
        });

        if (response) {
          // Create assistant message only after streaming is complete
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: response,
            timestamp: Date.now()
          };

          addMessageToActiveChat(assistantMessage);
        }
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
      setCurrentResponse('');
    }
  };

  // Comprehensive keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement as HTMLElement).contentEditable === 'true'
      );

      // Handle global shortcuts first (these work regardless of focus and should always be processed)

      // Global shortcuts with Ctrl+Shift (work regardless of focus)
      if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
        switch (event.key) {
          case 'C':
            event.preventDefault();
            handleCustomCollapseToggle();
            return;
          case 'S':
            event.preventDefault();
            setShowSettings(true);
            return;
          case 'N':
            event.preventDefault();
            handleChatCreate();
            return;
          case 'H':
            event.preventDefault();
            handleHide();
            return;
          case 'R':
            event.preventDefault();
            handleSizeChange();
            return;
          case 'T':
            event.preventDefault();
            setShowStreamingTest(true);
            return;

        }
      }

      // Function keys (work regardless of focus)
      if (event.key.startsWith('F') && ['F1', 'F2', 'F3', 'F4'].includes(event.key)) {
        event.preventDefault();
        switch (event.key) {
          case 'F1':
            setShowSettings(true);
            return;
          case 'F2':
            handleChatCreate();
            return;
          case 'F3':
            handleCustomCollapseToggle();
            return;
          case 'F4':
            handleSizeChange();
            return;
          case 'F5':
            // Toggle sidebar (only in expanded mode)
            if (!state.collapsed) {
              setSidebarCollapsed(!sidebarCollapsed);
            }
            return;
        }
      }

      // Escape key (works regardless of focus)
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();

        if (isInputFocused) {
          // If input is focused, clear history and blur
          setHistoryIndex(-1);
          const inputElement = activeElement as HTMLInputElement;
          const currentInput = inputElement.id === 'quick-input' ? quickInput : input;
          if (!currentInput.trim()) {
            if (inputElement.id === 'quick-input') {
              setQuickInput('');
            } else {
              setInput('');
            }
          }
          inputElement.blur();
        } else {
          // If no input focused, hide window
          handleHide();
        }
        return;
      }

      // Ctrl/Cmd shortcuts (work regardless of focus)
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'n':
          case 'N':
            event.preventDefault();
            handleChatCreate();
            return;
          case 's':
          case 'S':
            event.preventDefault();
            setShowSettings(true);
            return;
          case 'h':
          case 'H':
            event.preventDefault();
            handleHide();
            return;
          case 'r':
          case 'R':
            event.preventDefault();
            handleSizeChange();
            return;
          case 'w':
          case 'W':
            event.preventDefault();
            handleHide();
            return;
        }
      }

      // Input-specific shortcuts
      if (isInputFocused) {
        const inputElement = activeElement as HTMLInputElement;

        // Up/Down arrow for input history
        if (event.key === 'ArrowUp' && inputHistory.length > 0) {
          event.preventDefault();
          const newIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
          setHistoryIndex(newIndex);
          const historicalInput = inputHistory[inputHistory.length - 1 - newIndex];

          if (inputElement.id === 'quick-input') {
            setQuickInput(historicalInput);
          } else {
            setInput(historicalInput);
          }
          return;
        }

        if (event.key === 'ArrowDown' && historyIndex >= 0) {
          event.preventDefault();
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);

          if (newIndex >= 0) {
            const historicalInput = inputHistory[inputHistory.length - 1 - newIndex];
            if (inputElement.id === 'quick-input') {
              setQuickInput(historicalInput);
            } else {
              setInput(historicalInput);
            }
          } else {
            // Clear input when going below history
            if (inputElement.id === 'quick-input') {
              setQuickInput('');
            } else {
              setInput('');
            }
          }
          return;
        }

        // Send message with Ctrl/Cmd + Enter
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          const currentInput = inputElement.id === 'quick-input' ? quickInput : input;
          if (currentInput.trim()) {
            handleSend(currentInput, inputElement.id === 'quick-input');
          }
          return;
        }

        // Stop typing with Ctrl/Cmd + .
        if ((event.ctrlKey || event.metaKey) && event.key === '.') {
          event.preventDefault();
          if (isTyping) {
            handleStop();
          }
          return;
        }

        // Clear input with Ctrl/Cmd + K
        if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
          event.preventDefault();
          if (inputElement.id === 'quick-input') {
            setQuickInput('');
          } else {
            setInput('');
          }
          setHistoryIndex(-1);
          return;
        }

        // Note: Escape is handled globally above
      }

      // Non-input shortcuts
      if (!isInputFocused) {
        switch (event.key) {
          case '/':
            event.preventDefault();
            inputRef.current?.focus();
            return;
          case '?':
            if (event.shiftKey) {
              event.preventDefault();
              // Show comprehensive keyboard shortcuts help
              const shortcuts = `
🎯 KEYBOARD SHORTCUTS

🌐 GLOBAL SHORTCUTS (anywhere):
• Ctrl+Shift+C / F3 - Toggle collapse/expand
• Ctrl+Shift+S / F1 - Open settings  
• Ctrl+Shift+N / F2 - New chat
• Ctrl+Shift+H - Hide window
• Ctrl+Shift+R / F4 - Resize window
• F5 - Toggle sidebar (expanded mode)
• Escape - Hide window
• / - Focus input field

⌨️ INPUT SHORTCUTS (when typing):
• ↑ - Previous message from history
• ↓ - Next message from history  
• Ctrl+Enter - Send message
• Ctrl+. - Stop typing
• Ctrl+K - Clear input
• Escape - Clear history & blur input

📱 APPLICATION SHORTCUTS:
• Ctrl+N - New chat
• Ctrl+S - Settings
• Ctrl+H - Hide window
• Ctrl+R - Resize window
• Ctrl+W - Hide window
• F1-F4 - Quick actions

💡 TIPS:
• Use Ctrl+Shift+? to see this help again
• Arrow keys work in any input field
• Escape safely hides the window
• Most shortcuts work globally`;
              alert(shortcuts);
            }
            return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [input, quickInput, inputHistory, historyIndex, isTyping, handleCustomCollapseToggle, handleChatCreate, handleSend, handleStop, handleHide, handleSizeChange, setShowSettings]);

  const dims = sizePx[state.size];
  const padding = appSettings.ui.windowPadding; // Single padding value

  // Optimized collapsed dimensions - much smaller and content-fitted
  const collapsedWidthBySize: Record<string, number> = {
    S: 320,
    M: 360,
    L: 420
  };
  const collapsedDims = {
    width: collapsedWidthBySize[state.size] ?? 360, // Width varies with size in collapsed mode
    baseHeight: 140, // Compact height for header + input
    expandedHeight: 340, // Height when preview is expanded
    contextHeight: 80, // Additional height when context is shown and expanded
    responseHeight: 140 // Height for response preview area (reduced further for better fit)
  };

  // Dynamic collapsed height based on preview expansion, context, and response
  let collapsedHeight = collapsedDims.baseHeight;
  if (isPreviewExpanded) {
    collapsedHeight = collapsedDims.expandedHeight;
  }
  // Add extra space if context is present (whether expanded or not, it takes some space)
  if (contextMonitoring.hasNewContext && (contextMonitoring.contextData.clipboard || contextMonitoring.contextData.selectedText)) {
    collapsedHeight += collapsedDims.contextHeight;
  }
  // Add space for response preview when active
  if (currentResponse || isTyping) {
    collapsedHeight += collapsedDims.responseHeight;
  }

  // Sync window size when size state changes
  useEffect(() => {
    if (!window.pip) {
      console.warn('window.pip not available');
      return;
    }

    setIsResizing(true);
    const sidebarWidth = state.collapsed ? 0 : (sidebarCollapsed ? 48 : 280);

    // Use optimized dimensions for collapsed mode
    const width = state.collapsed
      ? (collapsedWidthBySize[state.size] ?? collapsedDims.width) + (padding * 2)
      : dims.w + sidebarWidth + (padding * 2);
    const height = state.collapsed
      ? collapsedHeight + (padding * 2)
      : dims.h + (padding * 2);

    console.log('Resizing window to:', width, 'x', height, 'collapsed:', state.collapsed, 'preview expanded:', isPreviewExpanded, 'current response:', !!currentResponse, 'sidebar:', sidebarWidth, 'context present:', contextMonitoring.hasNewContext);

    // Use a longer delay for collapse transitions to ensure state cleanup has completed
    const resizeDelay = state.collapsed ? 200 : 50; // Increased delay for collapsed mode

    const resizeTimeout = setTimeout(() => {
      try {
        window.pip.resizeWindow(width, height);
      } catch (error) {
        console.error('Failed to resize window:', error);
      }
    }, resizeDelay);

    // Reset resizing state after animation
    const resetTimeout = setTimeout(() => setIsResizing(false), 400 + resizeDelay);

    return () => {
      clearTimeout(resizeTimeout);
      clearTimeout(resetTimeout);
    };
  }, [state.size, state.collapsed, sidebarCollapsed, appSettings.ui.windowPadding, isPreviewExpanded, contextMonitoring.hasNewContext, contextMonitoring.contextData, currentResponse, isTyping, collapsedHeight]);

  return (
    <motion.div
      className={cn(
        "fixed bg-transparent flex items-center justify-center",
        platform === 'win32' && "win32-acrylic",
        platform === 'linux' && "linux-glass-effect"
      )}
      style={{
        width: state.collapsed ? collapsedDims.width + (padding * 2) : (sidebarCollapsed ? dims.w + 48 + (padding * 2) : dims.w + 280 + (padding * 2)),
        height: state.collapsed ? collapsedHeight + (padding * 2) : dims.h + (padding * 2),
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
          ThemeUtils.getBorderRadiusClass(appSettings.ui.borderRadius, platform),
          "border border-white/20 shadow-[0_8px_40px_rgba(0,0,0,0.4)]",
          isResizing && "shadow-lg scale-[1.01]",
          platform === 'win32'
            ? "bg-transparent"
            : platform === 'linux'
              ? theme === 'dark'
                ? "linux-blur bg-gradient-to-b from-white/[0.06] to-white/[0.01]"
                : "linux-blur-light bg-gradient-to-b from-black/[0.06] to-black/[0.01]"
              : theme === 'dark'
                ? "bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl backdrop-saturate-150"
                : "bg-gradient-to-b from-black/[0.08] to-black/[0.02] backdrop-blur-2xl backdrop-saturate-150",
          theme === 'dark' ? "text-white/90" : "text-black/90"
        )}
        style={{
          width: state.collapsed ? (collapsedWidthBySize[state.size] ?? collapsedDims.width) : (sidebarCollapsed ? dims.w + 48 : dims.w + 280),
          height: state.collapsed ? collapsedHeight : dims.h,
          margin: `${padding}px`
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
                messages={messages}
                quickInput={quickInput}
                setQuickInput={setQuickInput}
                onSend={handleSend}
                onStop={handleStop}
                onCollapseToggle={handleCustomCollapseToggle}
                onSizeChange={handleSizeChange}
                onHide={handleHide}
                onCopyMessage={handleMessageCopy}
                onPreviewToggle={handlePreviewToggle}
                onMessageEdit={handleMessageEdit}
                onMessageFork={handleMessageFork}
                onMessageDelete={handleMessageDelete}
                onCopyCode={copyToClipboard}
                onRunCode={(command, codeId) => runInTerminal(command, codeId, addMessageToActiveChat)}
                onRecompute={handleMessageRecompute}
                isResizing={isResizing}
                size={state.size}
                ollamaAvailable={ollamaIntegration.ollamaAvailable}
                serverStatus={serverStatus}
                hasNewContext={contextMonitoring.hasNewContext}
                contextData={contextMonitoring.contextData}
                contextToggleEnabled={contextMonitoring.contextToggleEnabled}
                uiSettings={appSettings.ui}
                currentResponse={currentResponse}
                availableModels={ollamaIntegration.availableModels}
                currentModel={ollamaIntegration.currentModel}
                showModelSelector={ollamaIntegration.showModelSelector}
                onModelSelectorToggle={() => ollamaIntegration.setShowModelSelector(!ollamaIntegration.showModelSelector)}
                onModelSelect={(model) => {
                  ollamaIntegration.setCurrentModel(model);
                  ollamaIntegration.setShowModelSelector(false);
                }}
                voiceModeEnabled={voiceModeEnabled}
                onVoiceModeToggle={() => setVoiceModeEnabled(!voiceModeEnabled)}
                onSpeechSettingsOpen={() => setShowSettings(true)}
                speechServiceConnected={speechService.isConnected}
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
                onCollapseToggle={handleCustomCollapseToggle}
                onHide={handleHide}
                size={state.size}
                showSpeechControls={showSpeechControls}
                onSpeechToggle={() => setShowSpeechControls(!showSpeechControls)}
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
                      onRecompute={handleMessageRecompute}
                      theme={theme}
                      platform={platform}
                      uiSettings={appSettings.ui}
                    />
                  ))}
                  {/* Show streaming response in expanded mode */}
                  {isTyping && currentResponse && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "group relative mr-8 max-w-[90%]",
                        "rounded-2xl p-4 bg-white/5",
                        appSettings.ui.fontSize === 'xs' ? 'text-xs' :
                          appSettings.ui.fontSize === 'sm' ? 'text-sm' :
                            appSettings.ui.fontSize === 'base' ? 'text-base' :
                              appSettings.ui.fontSize === 'lg' ? 'text-lg' : 'text-xl'
                      )}
                    >
                      <div className={cn(
                        "prose max-w-none prose-invert",
                        appSettings.ui.fontSize === 'xs' ? 'prose-xs' :
                          appSettings.ui.fontSize === 'sm' ? 'prose-sm' :
                            appSettings.ui.fontSize === 'base' ? 'prose-base' :
                              appSettings.ui.fontSize === 'lg' ? 'prose-lg' : 'prose-xl'
                      )}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            code: ({ inline, className, children, ...props }: any) => {
                              if (inline) {
                                return (
                                  <code className="px-1 py-0.5 bg-white/10 rounded text-sm" {...props}>
                                    {children}
                                  </code>
                                );
                              }
                              return (
                                <pre className="bg-black/20 rounded-lg overflow-x-auto my-2 p-3">
                                  <code className={cn("text-sm", className)} {...props}>
                                    {children}
                                  </code>
                                </pre>
                              );
                            }
                          }}
                        >
                          {currentResponse}
                        </ReactMarkdown>
                        <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1 align-text-bottom" />
                      </div>
                      <div className="text-xs opacity-50 mt-2 text-left">
                        {new Date().toLocaleTimeString()}
                      </div>
                    </motion.div>
                  )}
                  {isTyping && !currentResponse && (
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
                  ref={inputRef}
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

                {/* Speech Controls */}
                <AnimatePresence>
                  {showSpeechControls && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-white/10 overflow-hidden"
                    >
                      <div className="p-3">
                        <SpeechControls
                          onSpeechRecognized={handleSpeechRecognized}
                          onVoiceModeChange={speechService.setVoiceModeEnabled}
                          onDroidModeChange={speechService.setDroidModeEnabled}
                          onSettingsOpen={() => setShowSettings(true)}
                          voiceModeEnabled={speechService.voiceModeEnabled}
                          droidModeEnabled={speechService.droidModeEnabled}
                          compact={false}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Click away handlers */}
      <ClickAwayHandler
        isActive={ollamaIntegration.showModelSelector}
        onClickAway={() => ollamaIntegration.setShowModelSelector(false)}
        className="fixed inset-0 z-40"
      />

      {/* Remote Settings - Floating */}
      <div className={cn(
        "fixed z-40",
        state.collapsed
          ? "top-4 -right-32" // Position to the right of the control buttons when collapsed
          : "top-16 right-4"   // Position below the header buttons when expanded
      )}>
        <RemoteSettings
          connected={allyRemote.connected}
          status={allyRemote.status}
          token={allyRemote.token}
          error={allyRemote.error}
          onConnect={allyRemote.connect}
          onDisconnect={allyRemote.disconnect}
          onUpdateServerUrl={allyRemote.updateServerUrl}
        />
      </div>

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



      {/* Streaming Test Modal */}
      <AnimatePresence>
        {showStreamingTest && (
          <StreamingTest
            onClose={() => setShowStreamingTest(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}