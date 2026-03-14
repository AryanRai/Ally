import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import { ThemeUtils } from '../utils/themeUtils';
import { GreetingUtils } from '../utils/greetingUtils';
import { isWeb } from '../utils/platform';
import { SupabaseChatSync } from '../services/supabaseChatSync';
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
import ChatInput from './chat/ChatInput';
import { AccessibilityContextMonitor } from './AccessibilityContextMonitor';
import { RemoteSettings } from './RemoteSettings';
import { RemoteActivityIndicator } from './RemoteActivityIndicator';
import { SpeechControls } from './SpeechControls';
import { useSpeechService } from '../hooks/useSpeechService';
import { ProviderSettings } from './ProviderSettings';
import { ProviderConfig } from '../config/providers';

// Tool Execution UI Components
import { ToolExecutionStatus } from './chat/ToolExecutionStatus';
import { InlineToolExecutions, InlineToolPill, Segment, ToolExecution } from './chat/InlineToolIndicator';
import { useToolCalling } from '../hooks/useToolCalling';
import { useMCPACPIntegration } from '../hooks/useMCPACPIntegration';

// New agentic UI components
import AIBackdrop, { AIBackdropProps } from './AIBackdrop';
import AgentActivityStream, { AgentStep } from './chat/AgentActivityStream';
import LiveThinkingPanel from './chat/LiveThinkingPanel';
import TerminalPanel from './TerminalPanel';

// Unified Tool Integration
import { useUnifiedToolIntegration } from '../hooks/useUnifiedToolIntegration';
import { createRemoteChatIntegration } from '../services/remoteChatIntegration';
import { useRemoteConnection } from '../hooks/useRemoteConnection';
import { RemoteToolBridge, RemoteToolRequest } from '../services/remoteToolBridge';
import {
  buildPTCScriptPrompt,
  buildPTCSummaryPrompt,
  executeScript,
  extractScriptFromResponse,
  PTCTool,
} from '../services/ptcExecutor';

// Utils & Types
import { ChatManager } from '../utils/chatManager';
import { SettingsManager } from '../utils/settingsManager';
import { Chat, Message } from '../types/chat';
import { AppSettings } from '../types/settings';
import { getPrompt } from '../services/systemPrompts';
import { useHowYouSeeMe } from '../hooks/useHowYouSeeMe';

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

  // Chat management - moved up to be available for hooks
  const [chatManager] = useState(() => ChatManager.getInstance());
  const [chatSync] = useState(() => SupabaseChatSync.getInstance());
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  
  // Tools state - must be declared before hooks that use it
  const [toolsEnabled, setToolsEnabled] = useState(false);
  // Agentic mode - allows AI to use multiple tools sequentially
  const [agenticMode, setAgenticMode] = useState(true); // Default to agentic mode when tools are enabled
  // PTC mode - Programmatic Tool Calling: LLM writes a JS script, 2 LLM calls instead of N+1
  const [ptcMode, setPtcMode] = useState(() => localStorage.getItem('ally-ptc-mode') === 'true');
  // Robot Control Mode — use DroidCore/Comms v4.0 system prompt, overrides basic prompt
  const [robotMode, setRobotMode] = useState(() => localStorage.getItem('ally-robot-mode') === 'true');

  // HowYouSeeMe perception integration — polls robot state when robot mode is active
  const howYouSeeMe = useHowYouSeeMe(robotMode);

  // Autopilot mode - auto-approve all tool executions without confirmation
  const [autopilotMode, setAutopilotMode] = useState(() => {
    const saved = localStorage.getItem('ally-autopilot-mode');
    return saved === null ? true : saved === 'true';
  });
  // Pending tool approval state
  const [pendingToolApproval, setPendingToolApproval] = useState<{
    toolName: string;
    parameters: any;
    resolve: (approved: boolean) => void;
  } | null>(null);

  // Create OllamaService instance for tool calling - must be before unified integration
  const ollamaService = useMemo(() => {
    if (!window.pip?.ollama) return null;
    return {
      chat: async (messages: any[], model?: string) => {
        const chatHistory = messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }));
        
        let response = '';
        await window.pip.ollama.streamChatWithThinking(chatHistory, model || 'llama3.2:3b', (chunk: any) => {
          if (chunk.type === 'response' || chunk.type === 'done') {
            response = chunk.content;
          }
        });
        return response;
      },
      streamChatWithThinking: async (messages: any[], model: string, onProgress: (chunk: any) => void) => {
        const chatHistory = messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }));
        
        return await window.pip.ollama.streamChatWithThinking(chatHistory, model, onProgress);
      }
    };
  }, []);

  // Unified Tool Integration (conditional based on toggle)
  const unifiedIntegration = useUnifiedToolIntegration(
    activeChat?.id || `chat_${Date.now()}`,
    ollamaService as any, // Type assertion for compatibility
    {
      streamHandlerUrl: 'ws://localhost:3000',
      enableToolExecution: toolsEnabled,
      enableConversationMemory: true,
      autoConnect: toolsEnabled,
      autoReconnect: toolsEnabled,
      sourceIdentifier: 'ally_glass_pip_chat'
    }
  );

  // Command execution
  const { executeSystemCommand, runInTerminal } = useCommandExecution();

  // Remote control integration
  const allyRemote = useAllyRemote({
    allyName: 'Glass PiP Ally',
    autoConnect: false // Disabled to prevent authentication errors
  });

  // Speech service integration
  const speechService = useSpeechService();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Settings management
  const [settingsManager] = useState(() => SettingsManager.getInstance());
  const [appSettings, setAppSettings] = useState<AppSettings>(() => settingsManager.getSettings());

  // Tool calling integration (after appSettings is initialized)
  const toolCalling = useToolCalling(ollamaService as any, {
    enableToolCalling: appSettings.tools?.enabled || false,
    maxToolCalls: 5,
    toolCallTimeout: 30000,
    enableMultiStepReasoning: true
  });

  // Remote connection integration
  const remoteConnection = useRemoteConnection();

  // MCP/ACP Integration - uses shared store for persistence
  const mcpIntegration = useMCPACPIntegration();

  // UI state
  const [input, setInput] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProviderSettings, setShowProviderSettings] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showSpeechControls, setShowSpeechControls] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [currentGreeting, setCurrentGreeting] = useState(() => GreetingUtils.getCurrentGreeting(appSettings));
  
  // Active tool executions for inline display during streaming
  const [activeToolExecutions, setActiveToolExecutions] = useState<ToolExecution[]>([]);
  /** Segments for inline text+pill interleaving (agentic mode streaming) */
  const [streamingSegments, setStreamingSegments] = useState<Segment[]>([]);
  const [mcpServerCount, setMcpServerCount] = useState(0);
  // Streaming thinking state - for showing thinking as pill during streaming
  const [streamingThinking, setStreamingThinking] = useState<string | null>(null);

  // Agentic activity stream state
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  // Real-time thinking text (shown via LiveThinkingPanel while streaming)
  const [streamingThoughtText, setStreamingThoughtText] = useState('');
  const [thoughtExpanded, setThoughtExpanded] = useState(true);

  // Refresh greeting periodically when random mode is enabled
  useEffect(() => {
    if (appSettings.greeting?.useRandomGreeting) {
      const interval = setInterval(() => {
        setCurrentGreeting(GreetingUtils.getCurrentGreeting(appSettings));
      }, 30000); // Refresh every 30 seconds
      
      return () => clearInterval(interval);
    }
  }, [appSettings.greeting?.useRandomGreeting, appSettings.greeting?.randomGreetings]);
  // Use voice mode state from speech service hook
  const { voiceModeEnabled, setVoiceModeEnabled, droidModeEnabled, setDroidModeEnabled } = speechService;

  // Handle voice mode changes - start/stop listening automatically
  useEffect(() => {
    const handleVoiceModeChange = async () => {
      console.log('🎤 Voice mode change effect triggered:', {
        voiceModeEnabled,
        isConnected: speechService.isConnected,
        isListening: speechService.isListening
      });

      if (!speechService.isConnected) {
        console.log('⚠️ Speech service not connected, cannot change voice mode');
        return;
      }

      if (voiceModeEnabled) {
        console.log('🎤 Voice mode enabled - starting speech recognition');
        try {
          if (!speechService.isListening) {
            await speechService.startListening();
            console.log('✅ Speech recognition started successfully');
          } else {
            console.log('ℹ️ Speech recognition already active');
          }
        } catch (error) {
          console.error('❌ Failed to start listening when voice mode enabled:', error);
        }
      } else {
        console.log('🔇 Voice mode disabled - stopping speech recognition');
        try {
          if (speechService.isListening) {
            await speechService.stopListening();
            console.log('✅ Speech recognition stopped successfully');
          } else {
            console.log('ℹ️ Speech recognition already inactive');
          }
        } catch (error) {
          console.error('❌ Failed to stop listening when voice mode disabled:', error);
        }
      }
    };

    handleVoiceModeChange();
  }, [voiceModeEnabled, speechService.isConnected, speechService.isListening, speechService.startListening, speechService.stopListening]);
  // Copy functionality state
  // Local state no longer needed here

  // Derive orb state from agentic activity (Change 6)
  const orbState = useMemo((): 'idle' | 'listening' | 'thinking' | 'speaking' | 'processing' | 'ggwave' => {
    if (isTyping && agenticMode && agentSteps.some((s) => s.type === 'tool_call' && s.status === 'running'))
      return 'processing';
    if (isTyping && streamingThoughtText.length > 0) return 'thinking';
    if (isTyping) return 'thinking';
    if (voiceModeEnabled && speechService.isListening) return 'listening';
    if (droidModeEnabled && speechService.isSpeaking) return 'speaking';
    return 'idle';
  }, [isTyping, agenticMode, agentSteps, streamingThoughtText, voiceModeEnabled, droidModeEnabled, speechService.isListening, speechService.isSpeaking]);

  // Derive AIBackdrop state
  const backdropState = useMemo((): AIBackdropProps['state'] => {
    if (isTyping && agenticMode && agentSteps.some((s) => s.type === 'tool_call' && s.status === 'running'))
      return 'tool_executing';
    if (isTyping && streamingThoughtText.length > 0) return 'thinking';
    if (isTyping) return 'streaming';
    if (droidModeEnabled && speechService.isSpeaking) return 'speaking';
    return 'idle';
  }, [isTyping, agenticMode, agentSteps, streamingThoughtText, droidModeEnabled, speechService.isSpeaking]);

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

  /** Strip tool blocks and thinking tags from assistant messages before sending to LLM as history */
  const cleanMessagesForLLM = (messages: Message[]): Message[] =>
    messages.map(m => {
      if (m.role !== 'assistant') return m;
      const clean = m.content
        .replace(/🔧 \*\*[\s\S]*?```[\s\S]*?```\n*/g, '')
        .replace(/❌ \*\*[\s\S]*?\n/g, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/💭 \*\*Thought Process:\*\*[\s\S]*?---\n\n\*\*Answer:\*\*\n\n/g, '')
        .trim();
      return clean ? { ...m, content: clean } : m;
    }).filter(m => m.content.trim().length > 0);

  // Helper function to refresh chat state
  const refreshChatState = () => {
    if (isWeb) {
      // On web, chats live in React state only — don't read from localStorage chatManager
      // Just re-read activeChat from current state (already set)
      return;
    }
    setChats(chatManager.getAllChats());
    setActiveChat(chatManager.getActiveChat());
  };

  // Chat management functions
  const handleChatSelect = (chatId: string) => {
    // Clear TTS queue when switching chats to prevent cross-chat audio issues
    console.log('🔄 Switching chat - resetting TTS queue');
    speechService.resetTTSQueue();
    
    if (isWeb) {
      const selected = chats.find(c => c.id === chatId);
      if (selected) setActiveChat(selected);
      return;
    }
    chatManager.switchToChat(chatId);
    refreshChatState();
  };

  const handleChatCreate = () => {
    // Clear TTS queue when creating new chat to prevent issues with first message
    console.log('🆕 Creating new chat - resetting TTS queue');
    speechService.resetTTSQueue();
    
    if (isWeb) {
      const newChat: Chat = {
        id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: 'New Chat',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setChats(prev => [newChat, ...prev]);
      setActiveChat(newChat);
      // Sync to Supabase
      chatSync.syncChat(newChat).catch(e => console.warn('Chat create sync failed:', e));
      return;
    }
    const newChat = chatManager.createNewChat();
    refreshChatState();
    // Sync new chat to Supabase
    if (newChat) chatSync.syncChat(newChat).catch(e => console.warn('Chat create sync failed:', e));
  };

  const handleChatDelete = (chatId: string) => {
    if (isWeb) {
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (activeChat?.id === chatId) {
        const remaining = chats.filter(c => c.id !== chatId);
        setActiveChat(remaining[0] || null);
      }
      return;
    }
    if (chatManager.deleteChat(chatId)) {
      refreshChatState();
    }
  };

  const handleChatRename = (chatId: string, newTitle: string) => {
    if (isWeb) {
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: newTitle } : c));
      if (activeChat?.id === chatId) setActiveChat(prev => prev ? { ...prev, title: newTitle } : prev);
      return;
    }
    if (chatManager.updateChatTitle(chatId, newTitle)) {
      refreshChatState();
    }
  };

  const addMessageToActiveChat = (message: Message) => {
    if (!activeChat) return;

    if (isWeb) {
      // Web mode: update React state directly, don't use localStorage chatManager
      // Use functional updaters to avoid stale closure — activeChat in the closure
      // may be outdated when the assistant response arrives after an async wait.
      //
      // Bug B fix: check for duplicate IDs before adding. The realtime + polling
      // paths both guard with `messageAdded`, but this provides an extra safety net
      // in case the same message ID reaches this function from two code paths.
      setActiveChat(prev => {
        if (!prev) return prev;
        if (prev.messages.some(m => m.id === message.id)) return prev; // dedup by ID
        return {
          ...prev,
          messages: [...prev.messages, message],
          updatedAt: Date.now(),
        };
      });
      setChats(prev => prev.map(c => {
        if (c.id !== activeChat.id) return c;
        if (c.messages.some(m => m.id === message.id)) return c; // dedup by ID
        return {
          ...c,
          messages: [...c.messages, message],
          updatedAt: Date.now(),
        };
      }));
      return;
    }

    if (chatManager.addMessage(activeChat.id, message)) {
      refreshChatState();
      // Sync to Supabase after assistant responses (desktop mode)
      if (message.role === 'assistant') {
        const chat = chatManager.getChatById(activeChat.id);
        if (chat) chatSync.syncChat(chat).catch(e => console.warn('Chat sync failed:', e));
      }
    }
  };

  const handleMessageEdit = (messageId: string, newContent: string) => {
    if (isWeb && activeChat) {
      setActiveChat(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map(m => m.id === messageId ? { ...m, content: newContent } : m),
        };
      });
      setChats(prev => prev.map(c => {
        if (c.id !== activeChat.id) return c;
        return {
          ...c,
          messages: c.messages.map(m => m.id === messageId ? { ...m, content: newContent } : m),
        };
      }));
      return;
    }
    if (activeChat && chatManager.updateMessage(activeChat.id, messageId, newContent)) {
      refreshChatState();
    }
  };

  const handleMessageFork = (messageId: string, newContent: string) => {
    if (isWeb) return; // Not supported on web
    if (activeChat && chatManager.editMessage(activeChat.id, messageId, newContent)) {
      refreshChatState();
    }
  };

  const handleMessageDelete = (messageId: string) => {
    if (isWeb && activeChat) {
      setActiveChat(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.filter(m => m.id !== messageId),
        };
      });
      setChats(prev => prev.map(c => {
        if (c.id !== activeChat.id) return c;
        return {
          ...c,
          messages: c.messages.filter(m => m.id !== messageId),
        };
      }));
      return;
    }
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

    // Get context if enabled
    let contextualContent = textToSend;
    let contextData: string | undefined;
    if (contextMonitoring.includeContextInMessage && contextMonitoring.contextData.clipboard) {
      contextData = contextMonitoring.contextData.clipboard;
      contextualContent = `Context: ${contextData}\n\nUser: ${textToSend}`;
      contextMonitoring.clearNewContextFlag();
    }

    // Capture history snapshot BEFORE adding the new user message
    // (activeChat state won't update synchronously, so closures in send functions
    //  would see stale messages without this snapshot)
    const historySnapshot = cleanMessagesForLLM(activeChat?.messages || []);

    // Create user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: Date.now(),
      metadata: {
        source: messageText ? 'speech' : 'text',
        context: contextData
      }
    };

    // Add user message to chat
    addMessageToActiveChat(userMessage);

    setIsTyping(true);
    setCurrentResponse('');
    setAgentSteps([]); // Reset agent steps for each new conversation turn
    setStreamingThoughtText(''); // Reset live thinking text

    try {
      // Web mode: route through Supabase → desktop poller → Ollama → Supabase
      if (isWeb) {
        await handleSendWeb(contextualContent);
      } else if (toolsEnabled) {
        // Use tool-aware chat flow
        await handleSendWithTools(contextualContent, historySnapshot);
      } else {
        // Use regular streaming chat
        await handleSendRegular(contextualContent, historySnapshot);
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
      setActiveToolExecutions([]); // Clear tool executions when done
      setStreamingThinking(null); // Clear streaming thinking when done
      setStreamingSegments([]); // Clear streaming segments when done
      setStreamingThoughtText(''); // Clear live thinking text when done
    }
  };

  // Web mode: send message via Supabase, poll for response from desktop
  const handleSendWeb = async (contextualContent: string) => {
    if (!activeChat) return;

    // Ensure session exists in Supabase
    await chatSync.syncChat(activeChat);

    // Send the message — creates a 'pending' row the desktop poller picks up
    const msgId = await chatSync.sendRemoteMessage(activeChat.id, contextualContent, chatSync.selectedSystemId);
    if (!msgId) {
      throw new Error('Failed to send message to remote service');
    }

    // Use a stable assistant message ID to prevent duplicates
    const assistantMsgId = `assistant-${msgId}`;
    let messageAdded = false;

    setCurrentResponse('⏳ Waiting for desktop to process...');

    // Try realtime subscription first, fall back to polling
    let resolved = false;
    let lastActivityAt = Date.now();
    let cleanupCalled = false;

    const onActivity = () => { lastActivityAt = Date.now(); };

    // Safe cleanup — only call once
    let realtimeCleanup: (() => void) | null = null;
    const doCleanup = () => {
      if (cleanupCalled) return;
      cleanupCalled = true;
      realtimeCleanup?.();
    };

    realtimeCleanup = chatSync.subscribeToMessage(msgId, (response, status) => {
      if (resolved) return;
      onActivity();
      if (response) setCurrentResponse(response + (status === 'completed' ? '' : '▋'));
      if (status === 'completed' || status === 'error') {
        resolved = true;
        doCleanup();
        if (!messageAdded) {
          messageAdded = true;
          addMessageToActiveChat({
            id: assistantMsgId,
            role: 'assistant',
            content: response || 'No response received.',
            timestamp: Date.now(),
          });
        }
      }
    });

    // Polling fallback — check every 1.5s in case realtime doesn't fire
    const pollInterval = setInterval(async () => {
      if (resolved) { clearInterval(pollInterval); return; }
      const result = await chatSync.pollMessageResponse(msgId);
      if (resolved) { clearInterval(pollInterval); return; } // re-check after await
      if (result && (result.status === 'completed' || result.status === 'error')) {
        resolved = true;
        clearInterval(pollInterval);
        doCleanup();
        if (!messageAdded) {
          messageAdded = true;
          addMessageToActiveChat({
            id: assistantMsgId,
            role: 'assistant',
            content: result.response || 'No response received.',
            timestamp: Date.now(),
          });
        }
      } else if (result?.response) {
        onActivity();
        setCurrentResponse(result.response + '▋');
      }
    }, 1500);

    // Activity-based timeout: only fire if no updates for 45s
    const INACTIVITY_TIMEOUT = 45000;
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (resolved) {
          clearInterval(checkInterval);
          resolve();
          return;
        }
        const silent = Date.now() - lastActivityAt;
        if (silent >= INACTIVITY_TIMEOUT) {
          resolved = true;
          clearInterval(checkInterval);
          clearInterval(pollInterval);
          doCleanup();
          if (!messageAdded) {
            messageAdded = true;
            addMessageToActiveChat({
              id: assistantMsgId,
              role: 'assistant',
              content: '⏱️ No response for 45 seconds. Make sure your desktop Ally is running and connected.',
              timestamp: Date.now(),
            });
          }
          resolve();
        }
      }, 2000);
    });
  };

  // Regular streaming chat (no tools)
  const handleSendRegular = async (contextualContent: string, historySnapshot?: Message[]) => {
    let lastSentenceIndex = 0;
    let accumulatedResponse = '';
    let capturedThinking = ''; // capture thinking for saving in message

    // Get the basic system prompt — use robot prompt when robot mode is active
    // Append live HowYouSeeMe state when available
    const basePrompt = robotMode ? getPrompt('robot') : getPrompt('basic');
    const basicSystemPrompt = robotMode
      ? basePrompt + howYouSeeMe.liveContext
      : basePrompt;

    const response = await ollamaIntegration.sendMessageToOllama(
      historySnapshot ?? cleanMessagesForLLM(activeChat?.messages || []),
      contextualContent,
      (update) => {
        let responseContent = '';

        if (update.type === 'thinking') {
          capturedThinking = update.thinking || '';
          setStreamingThoughtText(capturedThinking);
          responseContent = ''; // don't show thinking in legacy response area; LiveThinkingPanel handles it
        } else if (update.type === 'response') {
          if (update.thinking) {
            capturedThinking = update.thinking;
            setStreamingThoughtText(capturedThinking);
            responseContent = `${update.response}${update.response.endsWith('.') || update.response.endsWith('!') || update.response.endsWith('?') ? '' : '▋'}`;
          } else {
            responseContent = `${update.response}${update.response.endsWith('.') || update.response.endsWith('!') || update.response.endsWith('?') ? '' : '▋'}`;
          }

          // Stream TTS for new sentences if voice mode is enabled
          if (voiceModeEnabled && update.response) {
            accumulatedResponse = update.response;
            const sentences = accumulatedResponse.split(/(?<=[.!?])\s+/);

            if (sentences.length > lastSentenceIndex + 1) {
              for (let i = lastSentenceIndex; i < sentences.length - 1; i++) {
                const sentence = sentences[i].trim();
                if (sentence && sentence.length > 3) {
                  speechService.synthesizeSpeechStreaming(sentence).catch(error => {
                    console.error('Error in streaming TTS:', error);
                  });
                }
              }
              lastSentenceIndex = sentences.length - 1;
            }
          }
        } else if (update.type === 'done') {
          if (update.thinking) {
            capturedThinking = update.thinking;
            setStreamingThoughtText(capturedThinking);
            responseContent = update.response;
          } else {
            responseContent = update.response;
          }

          // Speak any remaining incomplete sentence
          if (voiceModeEnabled && accumulatedResponse) {
            const sentences = accumulatedResponse.split(/(?<=[.!?])\s+/);
            const lastSentence = sentences[sentences.length - 1]?.trim();
            if (lastSentence && lastSentence.length > 3 && !lastSentence.match(/[.!?]$/)) {
              speechService.synthesizeSpeechStreaming(lastSentence).catch(error => {
                console.error('Error in final streaming TTS:', error);
              });
            }
          }
        }

        setCurrentResponse(responseContent);
      },
      basicSystemPrompt
    );

    if (response) {
      // If there was thinking, prepend it as a <think> block so EditableMessage can collapse it
      const savedContent = capturedThinking
        ? `<think>${capturedThinking}</think>\n\n${response}`
        : response;
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: savedContent,
        timestamp: Date.now()
      };
      addMessageToActiveChat(assistantMessage);
    }
  };

  // Tool-aware chat flow with MCP integration - supports both single-tool and agentic modes
  const handleSendWithTools = async (contextualContent: string, historySnapshot?: Message[]) => {
    // Get available MCP tools from the hook
    const mcpTools = await getMcpToolsForLLM();
    
    console.log('🔧 Available MCP tools:', mcpTools);
    console.log('🤖 Agentic mode:', agenticMode);
    
    if (mcpTools.length === 0) {
      console.log('⚠️ No MCP tools available, falling back to regular chat');
      await handleSendRegular(contextualContent, historySnapshot);
      return;
    }
    
    // Get saved tool prompt or use default - different prompts for agentic vs single-tool mode
    const savedToolPrompt = robotMode
      ? getPrompt('robot') + howYouSeeMe.liveContext
      : agenticMode ? getPrompt('agentic') : getPrompt('tool');

    // Build the full system prompt with available tools
    const toolsSystemPrompt = `${savedToolPrompt}

AVAILABLE TOOLS:
${mcpTools.map(t => {
  const params = t.parameters ? ` | params: ${JSON.stringify(t.parameters)}` : ' | no params needed';
  return `• ${t.name}${params}\n  → ${t.description}`;
}).join('\n')}

Remember: Output ONLY the JSON tool call when you need to use a tool. No explanations before it.`;

    if (agenticMode && ptcMode) {
      // PTC mode: LLM writes a JS script, execute it, summarize stdout — 2 LLM calls total
      await runPTCLoop(contextualContent, mcpTools, historySnapshot);
    } else if (agenticMode || robotMode) {
      // Use agentic loop for multi-tool execution (robot mode always uses agentic for perception queries)
      await handleAgenticChat(contextualContent, toolsSystemPrompt, mcpTools, historySnapshot);
    } else {
      // Use single-tool mode (original behavior)
      await handleSingleToolChat(contextualContent, toolsSystemPrompt, historySnapshot);
    }
  };

  /**
   * PTC loop — Programmatic Tool Calling.
   * LLM call 1: write a JS script. Execute it (N tool calls, no LLM). LLM call 2: summarize stdout.
   * Falls back to handleAgenticChat if script extraction fails.
   */
  const runPTCLoop = async (
    userQuery: string,
    mcpTools: PTCTool[],
    historySnapshot?: Message[]
  ) => {
    setIsTyping(true);
    setCurrentResponse('⚙️ Writing tool script…');

    try {
      // --- LLM call 1: generate script ---
      const history = cleanMessagesForLLM(historySnapshot ?? activeChat?.messages ?? []);
      // Pass the last assistant message as prior context for follow-up queries
      const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
      const priorContext = lastAssistant?.content?.slice(0, 2000);
      const scriptSystemPrompt = buildPTCScriptPrompt(mcpTools, userQuery, platform, priorContext);

      let scriptResponse = '';
      await ollamaIntegration.sendMessageToOllama(
        history,
        userQuery,
        (update) => {
          if (update.type === 'response' || update.type === 'done') {
            scriptResponse = update.response || '';
          }
          setCurrentResponse('⚙️ Writing tool script…');
        },
        scriptSystemPrompt
      );

      const script = extractScriptFromResponse(scriptResponse);
      if (!script) {
        // Fallback: no valid script — run agentic loop instead
        console.warn('[PTC] No valid script extracted, falling back to agentic loop');
        setCurrentResponse('');
        const savedToolPrompt = getPrompt('agentic');
        const toolsSystemPrompt = `${savedToolPrompt}\n\nAVAILABLE TOOLS:\n${mcpTools.map((t) => `• ${t.name} → ${t.description}`).join('\n')}`;
        await handleAgenticChat(userQuery, toolsSystemPrompt, mcpTools, historySnapshot);
        return;
      }

      setCurrentResponse(`⚙️ Running script…`);

      // --- Execute script ---
      const execResult = await executeScript(
        script,
        mcpTools,
        async (toolName, params) => executeMcpTool(toolName, params as Record<string, unknown>),
        {
          onToolCall: (tool) => setCurrentResponse(`⚙️ Calling \`${tool}\`…`),
        }
      );

      // --- LLM call 2: summarize ---
      setCurrentResponse('⚙️ Summarizing results…');
      const summaryPrompt = buildPTCSummaryPrompt(
        userQuery,
        execResult.stdout,
        execResult.stderr,
        execResult.toolCallLog
      );

      let finalContent = '';
      await ollamaIntegration.sendMessageToOllama(
        [],
        summaryPrompt,
        (update) => {
          if (update.type === 'response' || update.type === 'done') {
            finalContent = update.response || '';
            setCurrentResponse(finalContent);
          }
        },
        'You are a helpful assistant. Summarize the tool results naturally.'
      );

      const finalAnswer = finalContent || 'Done.';
      setCurrentResponse('');
      addMessageToActiveChat({
        id: `assistant-ptc-${Date.now()}`,
        role: 'assistant',
        content: finalAnswer,
        timestamp: Date.now(),
        metadata: {
          toolCalls: execResult.toolCallLog.map((t) => ({ name: t.tool, parameters: t.params as Record<string, unknown> })),
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setCurrentResponse('');
      addMessageToActiveChat({
        id: `assistant-ptc-err-${Date.now()}`,
        role: 'assistant',
        content: `Error in PTC loop: ${errMsg}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsTyping(false);
      setCurrentResponse('');
      setActiveToolExecutions([]);
    }
  };

  /**
   * Shared agentic loop — used by both desktop handleAgenticChat and RemoteToolBridge handler.
   * Runs the multi-tool agentic loop and returns the final content string.
   * 
   * Callbacks:
   *  - onStreamUpdate: called with streaming text for live display
   *  - onToolExecutionsUpdate: called with tool execution pills for live display
   *  - onThinkingUpdate: called with thinking text for live display
   *  - onSegmentUpdate: called with interleaved text+tool segments (Cursor-style inline pills)
   */
  const runAgenticLoop = async (
    contextualContent: string,
    systemPrompt: string,
    chatHistory: Message[],
    callbacks: {
      onStreamUpdate?: (text: string) => void;
      onToolExecutionsUpdate?: (executions: ToolExecution[]) => void;
      onThinkingUpdate?: (thinking: string) => void;
      onSegmentUpdate?: (segments: Segment[]) => void;
    } = {}
  ): Promise<string> => {
    const MAX_ITERATIONS = 10;
    const MAX_TOOL_CALLS = 20;
    const MAX_SAME_TOOL_RETRIES = 2;
    const MAX_TOOL_NAME_FAILURES = 3; // Max total failures for any single tool name
    
    let iteration = 0;
    let totalToolCalls = 0;
    const allToolResults: Array<{ tool: string; result: string }> = [];
    const allToolExecutions: ToolExecution[] = [];
    const toolResultBlocks: string[] = [];
    let finalModelSummary = '';
    let currentThinking = '';
    const failureTracker: Map<string, number> = new Map(); // exact tool+params failures
    const toolNameFailures: Map<string, number> = new Map(); // per-tool-name total failures

    // Segment tracking for inline pill rendering (Cursor-style)
    const currentSegments: Segment[] = [];
    const emitSegments = () => callbacks.onSegmentUpdate?.([...currentSegments]);
    /** Update (or append) the trailing text segment during streaming. */
    const updateTrailingTextSegment = (text: string) => {
      if (!text) return;
      const last = currentSegments[currentSegments.length - 1];
      if (last?.type === 'text') {
        last.content = text;
      } else {
        currentSegments.push({ type: 'text', content: text });
      }
      emitSegments();
    };
    
    while (iteration < MAX_ITERATIONS && totalToolCalls < MAX_TOOL_CALLS) {
      iteration++;
      console.log(`🔄 Agentic iteration ${iteration}`);
      
      const toolResultsContext = allToolResults.length > 0
        ? `\n\nTool results so far:\n${allToolResults.map(tr => `- ${tr.tool}: ${tr.result}`).join('\n')}\n\nContinue working on the user's request. If you need more information or need to perform more actions, call another tool. If you have completed ALL the steps needed, provide your final answer WITHOUT any JSON.`
        : '';
      
      // Pass the user's message + tool context as the content,
      // and the system prompt properly via the systemPrompt parameter
      // so the LLM sees the full chat history for context
      const userContent = contextualContent + toolResultsContext;
      
      let accumulatedResponse = '';
      let toolCallDetected = false;
      let detectedToolCall: { name: string; parameters: any } | null = null;
      let beforeToolText = '';
      
      await ollamaIntegration.sendMessageToOllama(
        chatHistory,
        userContent,
        (update) => {
          if (update.type === 'response' || update.type === 'done') {
            accumulatedResponse = update.response || '';
            
            const thinkingMatch = accumulatedResponse.match(/<think>([\s\S]*?)<\/think>/i);
            if (thinkingMatch) {
              currentThinking = thinkingMatch[1].trim();
              callbacks.onThinkingUpdate?.(currentThinking);
            }
            
            const parsed = parseToolCallFromResponse(accumulatedResponse);
            
            if (parsed.toolCall && !toolCallDetected) {
              toolCallDetected = true;
              detectedToolCall = parsed.toolCall;
              beforeToolText = parsed.beforeText;
              callbacks.onStreamUpdate?.(beforeToolText || `🔧 *Calling ${parsed.toolCall.name}...*`);
            } else if (!toolCallDetected) {
              const cleanedResponse = accumulatedResponse
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .trim();
              const displayText = cleanedResponse + (update.type === 'done' ? '' : '▋');
              callbacks.onStreamUpdate?.(displayText);
              // The segment stores the clean text without the ▋ cursor so that what
              // gets persisted to metadata matches the final text, not the streaming display.
              updateTrailingTextSegment(cleanedResponse + (update.type === 'done' ? '' : ' '));
            }
          }
        },
        systemPrompt
      );
      
      if (!toolCallDetected || !detectedToolCall) {
        console.log('✅ No more tool calls, task complete');
        finalModelSummary = accumulatedResponse
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/🔧\s*\*\*(Executed|[^*]+)\*\*:?\s*/g, '')
          .replace(/[✅❌]\s*\*\*(Success|Status|Error)[^*]*\*\*:?\s*/g, '')
          .replace(/\*\*Output:\*\*\s*/g, '')
          .trim();
        // Flush final text into last segment
        updateTrailingTextSegment(finalModelSummary);
        break;
      }
      
      const toolToExecute = detectedToolCall as { name: string; parameters: any };
      
      // VALIDATION: Check required params
      const toolRequiresParams: Record<string, string[]> = {
        'execute_command': ['command'],
        'read_file': ['path'],
        'read_text_file': ['path'],
        'write_file': ['path', 'content'],
        'edit_file': ['path'],
        'move_file': ['source', 'destination'],
        'search_files': ['path', 'pattern'],
      };
      
      const requiredParams = toolRequiresParams[toolToExecute.name];
      if (requiredParams) {
        const params = toolToExecute.parameters || {};
        const missingParams = requiredParams.filter(p => !params[p] && params[p] !== 0 && params[p] !== false);
        if (missingParams.length > 0) {
          console.warn(`⚠️ Tool ${toolToExecute.name} missing required params: ${missingParams.join(', ')} — skipping`);
          toolNameFailures.set(toolToExecute.name, (toolNameFailures.get(toolToExecute.name) || 0) + 1);
          allToolResults.push({ 
            tool: toolToExecute.name, 
            result: `ERROR: Missing required parameters: ${missingParams.join(', ')}. You must provide these.` 
          });
          continue;
        }
      }
      
      // RETRY GUARD — check both exact match and per-tool-name totals
      const toolKey = `${toolToExecute.name}:${JSON.stringify(toolToExecute.parameters)}`;
      const priorFailures = failureTracker.get(toolKey) || 0;
      const toolTotalFailures = toolNameFailures.get(toolToExecute.name) || 0;
      if (priorFailures >= MAX_SAME_TOOL_RETRIES) {
        console.warn(`🛑 Tool ${toolToExecute.name} has failed ${priorFailures} times with same params — skipping`);
        allToolResults.push({ tool: toolToExecute.name, result: `ERROR: ${toolToExecute.name} failed repeatedly with same parameters. Try a different approach.` });
        continue; // Let the model try something else instead of breaking
      }
      if (toolTotalFailures >= MAX_TOOL_NAME_FAILURES) {
        console.warn(`🛑 Tool ${toolToExecute.name} has failed ${toolTotalFailures} total times — skipping`);
        allToolResults.push({ tool: toolToExecute.name, result: `ERROR: ${toolToExecute.name} keeps failing. Use a different tool or approach.` });
        continue;
      }
      
      // Execute the tool
      totalToolCalls++;
      const toolExecution: ToolExecution = {
        id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: toolToExecute.name,
        parameters: toolToExecute.parameters,
        status: 'executing',
        startTime: Date.now(),
      };
      
      allToolExecutions.push(toolExecution);
      callbacks.onToolExecutionsUpdate?.([...allToolExecutions]);

      // Segment: flush any pending before-text, then push a tool pill segment
      if (beforeToolText) {
        // Replace trailing text segment with the committed before-text
        const last = currentSegments[currentSegments.length - 1];
        if (last?.type === 'text') {
          last.content = beforeToolText;
        } else {
          currentSegments.push({ type: 'text', content: beforeToolText });
        }
      }
      currentSegments.push({ type: 'tool', toolExecution });
      emitSegments();
      
      try {
        console.log(`🔧 Executing tool: ${toolToExecute.name}`, toolToExecute.parameters);
        const result = await executeMcpTool(toolToExecute.name, toolToExecute.parameters);
        
        toolExecution.status = 'success';
        toolExecution.result = result;
        toolExecution.endTime = Date.now();
        
        const resultText = formatToolResultForDisplay(toolToExecute.name, result);
        allToolResults.push({ tool: toolToExecute.name, result: resultText });
        toolResultBlocks.push(`🔧 **${toolToExecute.name}**\n\`\`\`\n${resultText}\n\`\`\``);
        
        callbacks.onToolExecutionsUpdate?.([...allToolExecutions]);
        callbacks.onStreamUpdate?.('*Analyzing results...*');
        // Refresh segment with updated (success) tool execution
        emitSegments();
        
      } catch (error) {
        console.error(`❌ Tool execution failed:`, error);
        toolExecution.status = 'error';
        toolExecution.error = error instanceof Error ? error.message : String(error);
        toolExecution.endTime = Date.now();
        
        const failKey = `${toolToExecute.name}:${JSON.stringify(toolToExecute.parameters)}`;
        failureTracker.set(failKey, (failureTracker.get(failKey) || 0) + 1);
        toolNameFailures.set(toolToExecute.name, (toolNameFailures.get(toolToExecute.name) || 0) + 1);
        
        callbacks.onToolExecutionsUpdate?.([...allToolExecutions]);
        allToolResults.push({ tool: toolToExecute.name, result: `ERROR: ${toolExecution.error}` });
        toolResultBlocks.push(`❌ **${toolToExecute.name}** failed: ${toolExecution.error}`);
        // Refresh segment with updated (error) tool execution
        emitSegments();
      }
    }
    
    // Build final content: tool result blocks + model summary
    let finalContent = '';
    if (currentThinking) {
      finalContent += `<think>${currentThinking}</think>\n\n`;
    }
    if (toolResultBlocks.length > 0) {
      finalContent += toolResultBlocks.join('\n\n') + '\n\n';
    }
    if (finalModelSummary) {
      finalContent += finalModelSummary;
    }
    
    return finalContent.trim();
  };

  // Agentic chat - allows multiple sequential tool calls (desktop UI wrapper)
  const handleAgenticChat = async (
    contextualContent: string, 
    systemPrompt: string,
    _tools: Array<{ name: string; description: string; parameters?: any }>,
    historySnapshot?: Message[]
  ) => {
    // Capture the final segments so they can be persisted in message metadata
    let lastSegments: Segment[] = [];

    const finalContent = await runAgenticLoop(
      contextualContent,
      systemPrompt,
      historySnapshot ?? cleanMessagesForLLM(activeChat?.messages || []),
      {
        onStreamUpdate: (text) => setCurrentResponse(text),
        onToolExecutionsUpdate: (execs) => setActiveToolExecutions(execs),
        onThinkingUpdate: (thinking) => {
          setStreamingThinking(thinking);
          setStreamingThoughtText(thinking);
        },
        onSegmentUpdate: (segs) => {
          lastSegments = segs;
          setStreamingSegments(segs);
        },
      }
    );
    
    // Clear streaming state
    setStreamingThinking(null);
    setActiveToolExecutions([]);
    setStreamingSegments([]);
    
    if (finalContent) {
      // Deep-copy segments to prevent the persisted metadata from being mutated
      // if the underlying ToolExecution objects are referenced elsewhere.
      const persistedSegments = lastSegments.length > 0
        ? JSON.parse(JSON.stringify(lastSegments)) as Segment[]
        : undefined;
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: finalContent,
        timestamp: Date.now(),
        // Persist segments so they re-render correctly in chat history
        metadata: persistedSegments ? { segments: persistedSegments } : undefined,
      };
      addMessageToActiveChat(assistantMessage);
    }
  };

  // Helper to parse tool call from response
  const parseToolCallFromResponse = (text: string): { 
    toolCall: { name: string; parameters: any } | null;
    beforeText: string;
  } => {
    // Strip thinking blocks
    const cleanedText = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    
    // Find any JSON object containing "name" or "tool" key
    const toolKeyMatch = cleanedText.match(/\{\s*"(?:name|tool)"\s*:\s*"([^"]+)"/);
    if (toolKeyMatch) {
      const name = toolKeyMatch[1];
      const startIdx = cleanedText.indexOf(toolKeyMatch[0]);
      
      // Use brace counting to extract the full JSON object (handles nested objects)
      let braceCount = 0;
      let endIdx = -1;
      let inString = false;
      let escapeNext = false;
      for (let i = startIdx; i < cleanedText.length; i++) {
        const ch = cleanedText[i];
        if (escapeNext) { escapeNext = false; continue; }
        if (ch === '\\' && inString) { escapeNext = true; continue; }
        if (ch === '"' && !escapeNext) { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') braceCount++;
        if (ch === '}') braceCount--;
        if (braceCount === 0) {
          endIdx = i + 1;
          break;
        }
      }
      
      // CRITICAL: If braces aren't balanced, the JSON is incomplete (still streaming)
      // Return null so we wait for more data
      if (endIdx === -1 || braceCount !== 0) {
        return { toolCall: null, beforeText: cleanedText };
      }
      
      const jsonStr = cleanedText.substring(startIdx, endIdx);
      
      try {
        const parsed = JSON.parse(jsonStr);
        const params = parsed.parameters || parsed.args || parsed.arguments || parsed.params || {};
        return {
          toolCall: { name, parameters: params },
          beforeText: cleanedText.substring(0, startIdx).trim()
        };
      } catch {
        // JSON parse failed even with balanced braces - likely malformed, skip
        console.warn('⚠️ Tool call JSON parse failed despite balanced braces:', jsonStr);
        return { toolCall: null, beforeText: cleanedText };
      }
    }
    
    // Format with tags: <tool_call>...</tool_call>
    const jsonTagMatch = cleanedText.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/);
    if (jsonTagMatch) {
      try {
        const parsed = JSON.parse(jsonTagMatch[1].trim());
        const idx = cleanedText.indexOf(jsonTagMatch[0]);
        return {
          toolCall: { name: parsed.name || parsed.tool, parameters: parsed.parameters || parsed.args || parsed.arguments || {} },
          beforeText: cleanedText.substring(0, idx).trim()
        };
      } catch { /* continue */ }
    }
    
    return { toolCall: null, beforeText: cleanedText };
  };

  // Helper to format tool result for display
  const formatToolResultForDisplay = (toolName: string, result: any): string => {
    if (!result) return 'No result';
    
    // Special formatting for time results
    if (toolName === 'get_current_time' || result.time || (result.formatted && result.timezone)) {
      if (result.formatted && result.timezone) {
        return `${result.formatted} (${result.timezone})`;
      }
      return result.formatted || result.time || JSON.stringify(result);
    }
    
    // Special formatting for calculation results
    if (toolName === 'calculate' || (result.expression !== undefined && result.result !== undefined)) {
      return `${result.expression} = ${result.result}`;
    }
    
    // Handle MCP content array format
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: any) => c.type === 'text');
      if (textContent?.text) {
        let text = textContent.text;
        
        // Strip any existing tool-result-like formatting from MCP output
        // (some MCP servers return pre-formatted text with 🔧 **tool_name** headers)
        text = text.replace(/^🔧\s*\*\*[^*]+\*\*\s*\n?/gm, '');
        
        // For directory listings, format more compactly
        if (toolName === 'list_directory' || toolName.includes('directory')) {
          const lines = text.split('\n').filter((l: string) => l.trim());
          if (lines.length > 15) {
            return `${lines.slice(0, 12).join('\n')}\n... and ${lines.length - 12} more items`;
          }
        }
        return text.trim();
      }
    }
    
    if (result.formatted) return result.formatted;
    if (result.result !== undefined) return String(result.result);
    if (typeof result === 'string') {
      // Strip any existing tool formatting from string results too
      return result.replace(/^🔧\s*\*\*[^*]+\*\*\s*\n?/gm, '').trim();
    }
    
    // Truncate long JSON
    const jsonStr = JSON.stringify(result, null, 2);
    if (jsonStr.length > 800) {
      return jsonStr.substring(0, 800) + '\n... (truncated)';
    }
    return jsonStr;
  };

  // Single-tool chat mode (original behavior)
  const handleSingleToolChat = async (contextualContent: string, systemPrompt: string, historySnapshot?: Message[]) => {
    let accumulatedResponse = '';
    let finalResponseWithToolResults = '';
    let pendingToolCall: { name: string; parameters: any } | null = null;
    let toolExecuted = false;
    let currentThinking = '';
    let thinkingComplete = false;
    let toolExecutionPromise: Promise<void> | null = null;

    await ollamaIntegration.sendMessageToOllama(
      historySnapshot ?? cleanMessagesForLLM(activeChat?.messages || []),
      contextualContent,
      (update) => {
        if (update.type === 'response' || update.type === 'done') {
          accumulatedResponse = update.response || '';
          
          // Extract thinking
          const thinkMatch = accumulatedResponse.match(/<think>([\s\S]*?)<\/think>/i);
          if (thinkMatch) {
            currentThinking = thinkMatch[1].trim();
            thinkingComplete = true;
            setStreamingThinking(currentThinking);
          }
          
          // Parse for tool call
          const parsed = parseToolCallFromResponse(accumulatedResponse);
          
          if (parsed.toolCall && !pendingToolCall && !toolExecuted) {
            pendingToolCall = parsed.toolCall;
            toolExecuted = true;
            
            setActiveToolExecutions([{
              id: `tool-${Date.now()}`,
              name: parsed.toolCall.name,
              parameters: parsed.toolCall.parameters || {},
              status: 'executing',
              startTime: Date.now()
            }]);
            
            const toolCall = parsed.toolCall;
            const beforeText = parsed.beforeText;
            
            toolExecutionPromise = (async () => {
              try {
                const toolResult = await executeMcpTool(toolCall.name, toolCall.parameters || {});
                
                setActiveToolExecutions(prev => prev.map(t => 
                  t.name === toolCall.name ? { ...t, status: 'success' as const, result: toolResult, endTime: Date.now() } : t
                ));
                
                const resultDisplay = formatToolResultForDisplay(toolCall.name, toolResult);
                const resultText = `🔧 **${toolCall.name}**\n\`\`\`\n${resultDisplay}\n\`\`\``;
                
                finalResponseWithToolResults = beforeText ? `${beforeText}\n\n${resultText}` : resultText;
                setCurrentResponse(finalResponseWithToolResults);
                
              } catch (error) {
                setActiveToolExecutions(prev => prev.map(t => 
                  t.name === pendingToolCall?.name ? { ...t, status: 'error' as const, error: String(error) } : t
                ));
                
                const errorText = `❌ **Tool Error: ${pendingToolCall?.name}** - ${error}`;
                finalResponseWithToolResults = beforeText ? `${beforeText}\n\n${errorText}` : errorText;
                setCurrentResponse(finalResponseWithToolResults);
              }
            })();
            
            setCurrentResponse(parsed.beforeText ? `${parsed.beforeText}\n\n🔧 *Executing ${parsed.toolCall.name}...*` : `🔧 *Executing ${parsed.toolCall.name}...*`);
            
          } else if (toolExecuted && finalResponseWithToolResults) {
            setCurrentResponse(finalResponseWithToolResults + (update.type === 'done' ? '' : '▋'));
          } else if (!toolExecuted) {
            const cleanedResponse = accumulatedResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            setCurrentResponse(cleanedResponse + (update.type === 'done' ? '' : '▋'));
          }
        }
      },
      systemPrompt
    );

    if (toolExecutionPromise) {
      await toolExecutionPromise;
    }

    let finalContent = finalResponseWithToolResults || accumulatedResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    
    if (currentThinking && thinkingComplete) {
      finalContent = `<think>${currentThinking}</think>\n\n${finalContent}`;
    }
    
    setStreamingThinking(null);
    
    if (finalContent) {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: finalContent,
        timestamp: Date.now()
      };
      addMessageToActiveChat(assistantMessage);
    }
  };

  // Get MCP tools formatted for LLM - use tools from mcpIntegration (persisted in store)
  const getMcpToolsForLLM = async (): Promise<Array<{ name: string; description: string; parameters?: any }>> => {
    try {
      const tools: Array<{ name: string; description: string; parameters?: any }> = [];
      
      // Always add built-in tools that work without MCP
      tools.push(
        { name: 'get_current_time', description: 'Get the current date and time. USE THIS for any time/date questions!', parameters: {} },
        { name: 'calculate', description: 'Perform a mathematical calculation', parameters: { expression: 'string (e.g., "2 + 2", "sqrt(16)")' } },
        { name: 'fetch_url', description: 'Fetch a URL and return the response body. USE THIS instead of curl for any HTTP requests or internet access.', parameters: { url: 'string', method: 'string (optional)', headers: 'object (optional)', body: 'string (optional)' } },
        { name: 'execute_command', description: 'Execute a system command on Windows. Use "start <url>" to open URLs in browser.', parameters: { command: 'string' } },
        { name: 'list_directory', description: 'List the contents of a directory', parameters: { path: 'string' } },
        { name: 'read_file', description: 'Read the contents of a file', parameters: { path: 'string' } },
        // Browser tools (require Ally Chrome extension)
        { name: 'browser_navigate', description: 'Navigate browser to a URL. Use this to open websites.', parameters: { url: 'string' } },
        { name: 'browser_click', description: 'Click an element on the page by CSS selector or visible text', parameters: { selector: 'string (optional)', text: 'string (optional)', index: 'number (optional)' } },
        { name: 'browser_type', description: 'Type text into an input field on the page', parameters: { selector: 'string', text: 'string', pressEnter: 'boolean (optional)' } },
        { name: 'browser_read_page', description: 'Read the current page content, title, URL and links', parameters: { includeLinks: 'boolean (optional)' } },
        { name: 'browser_eval', description: 'Run JavaScript in the current page. Use for complex interactions.', parameters: { code: 'string' } },
        { name: 'browser_find_element', description: 'Find an element on the page by selector or text', parameters: { selector: 'string (optional)', text: 'string (optional)' } },
        { name: 'browser_get_tabs', description: 'List all open browser tabs', parameters: {} },
        { name: 'browser_switch_tab', description: 'Switch to a browser tab by URL or title', parameters: { url: 'string (optional)', title: 'string (optional)' } },
        { name: 'browser_screenshot', description: 'Take a screenshot of the current browser tab', parameters: {} },
        { name: 'browser_wait_for', description: 'Wait for a CSS selector to appear on the page', parameters: { selector: 'string', timeout: 'number (optional)' } },
        { name: 'browser_get_url', description: 'Get the current page URL and title', parameters: {} },
        { name: 'browser_scroll', description: 'Scroll the page or scroll an element into view', parameters: { selector: 'string (optional)', y: 'number (optional)' } },
        { name: 'browser_press_key', description: 'Press a keyboard key on the focused element', parameters: { key: 'string', selector: 'string (optional)' } },
        { name: 'browser_new_tab', description: 'Open a new browser tab', parameters: { url: 'string (optional)' } },
        // Perplexity Comet MCP — agentic browser via CDP (preferred for complex tasks)
        { name: 'comet_connect', description: 'Connect to Perplexity Comet browser. Call this first before any comet_* tool.', parameters: {} },
        { name: 'comet_run', description: 'Send a task to Perplexity Comet and automatically wait for completion. Polls every 20s, extends if still working, returns the final result. USE THIS instead of comet_ask for all tasks.', parameters: { prompt: 'string', maxWaitSeconds: 'number (optional, default 180)' } },
        { name: 'comet_ask', description: 'Send a task to Perplexity Comet agentic browser. Blocks until complete (up to 2 min) and returns the full result. Use for web research, form filling, booking, shopping, sending messages, or any multi-step browser task.', parameters: { prompt: 'string', newChat: 'boolean (optional)', timeout: 'number (optional, ms, default 120000)' } },
        { name: 'comet_poll', description: 'Check status of the current Comet task. Use only if comet_ask timed out. Returns IDLE/WORKING/COMPLETED and steps taken.', parameters: {} },
        { name: 'comet_stop', description: 'Stop the current Comet task.', parameters: {} },
        { name: 'comet_screenshot', description: 'Take a screenshot of the current Comet browser view.', parameters: {} },
        { name: 'comet_tabs', description: 'List, switch, or close Comet browser tabs.', parameters: { action: 'string (optional: list|switch|close)', domain: 'string (optional)', tabId: 'string (optional)' } },
        { name: 'comet_mode', description: 'Switch Perplexity search mode: search, research, labs, or learn.', parameters: { mode: 'string (optional)' } },
        { name: 'wait', description: 'Sleep for N seconds. Use this after comet_ask (timeout:5000) to give Comet time to complete its task before calling comet_poll. Use 30-60s for most tasks.', parameters: { seconds: 'number (1-60)' } },
      );
      
      // Add HowYouSeeMe perception tools when robot mode is active
      if (robotMode) {
        const hysm = [
          { name: 'query_world', description: 'Get all visible objects, people, robot position, and recent events from the robot\'s perception system', parameters: { filter: 'string (optional label filter)' } },
          { name: 'where_is', description: 'Find the 3D position of a specific object or person by label', parameters: { label: 'string' } },
          { name: 'get_robot_status', description: 'Get a natural language summary of what the robot currently sees and where it is', parameters: {} },
          { name: 'get_recent_events', description: 'Get the last N perception events with timestamps', parameters: { limit: 'number (optional, default 10)', event_type: 'string (optional)' } },
          { name: 'remember_object', description: 'Pin an object for persistent tracking by name', parameters: { name: 'string', label: 'string' } },
          { name: 'recall_memory', description: 'Get the current location of a previously pinned object', parameters: { name: 'string' } },
          { name: 'get_robot_context', description: 'Get the full system context block describing robot capabilities', parameters: {} },
        ];
        for (const t of hysm) {
          if (!tools.find(existing => existing.name === t.name)) tools.push(t);
        }
      }

      // Add MCP tools from the integration hook (persisted in store)
      const mcpTools = mcpIntegration.mcpTools;
      console.log('📡 MCP tools for LLM:', mcpTools);
      
      for (const tool of mcpTools) {
        if (!tools.find(t => t.name === tool.name)) {
          tools.push({
            name: tool.name,
            description: tool.description || `MCP tool from ${tool.serverName}`,
            parameters: undefined
          });
        }
      }
      
      // Also try unified integration tools
      const unifiedToolNames = unifiedIntegration.getAvailableTools?.() || [];
      for (const toolName of unifiedToolNames) {
        if (typeof toolName === 'string' && !tools.find(existing => existing.name === toolName)) {
          tools.push({
            name: toolName,
            description: `Tool: ${toolName}`,
            parameters: undefined
          });
        }
      }
      
      console.log('🔧 Total available tools for LLM:', tools);
      return tools;
    } catch (error) {
      console.error('Failed to get MCP tools:', error);
      return [
        { name: 'get_current_time', description: 'Get the current date and time', parameters: {} },
        { name: 'calculate', description: 'Perform a mathematical calculation', parameters: { expression: 'string' } }
      ];
    }
  };

  // Execute an MCP tool (or built-in tool)
  const executeMcpTool = async (toolName: string, parameters: any): Promise<any> => {
    console.log('🔧 Executing tool:', toolName, 'with params:', parameters);
    
    // If autopilot is OFF, ask for user approval before executing
    // (skip approval for safe read-only tools)
    const safeTools = ['get_current_time', 'current_time', 'get_time', 'time', 'calculate', 'calc', 'math', 
                       'list_directory', 'ls', 'dir', 'read_file', 'cat', 'read', 'read_text_file', 
                       'read_multiple_files', 'get_file_info', 'list_allowed_directories', 'search_files',
                       'get_current_directory', 'directory_tree', 'list_directory_with_sizes',
                       'search_nodes', 'read_graph', 'open_nodes'];
    
    if (!autopilotMode && !safeTools.includes(toolName)) {
      const approved = await new Promise<boolean>((resolve) => {
        setPendingToolApproval({ toolName, parameters, resolve });
      });
      setPendingToolApproval(null);
      
      if (!approved) {
        return { error: `Tool execution denied by user: ${toolName}` };
      }
    }
    
    // Normalize parameters - handle empty string, null, undefined
    let normalizedParams = parameters;
    if (!parameters || parameters === '' || (typeof parameters === 'object' && Object.keys(parameters).length === 0)) {
      normalizedParams = {};
    }
    
    // Add default parameters for known tools that require them
    // Also normalize tool name aliases
    let actualToolName = toolName;
    
    // Alias: ls -> list_directory
    if (toolName === 'ls' || toolName === 'dir') {
      actualToolName = 'list_directory';
    }
    // Alias: cat -> read_file
    if (toolName === 'cat' || toolName === 'read') {
      actualToolName = 'read_file';
    }
    
    if (actualToolName === 'list_directory' && !normalizedParams.path) {
      normalizedParams = { path: '.' }; // Default to current directory
    }
    if (actualToolName === 'read_file' && !normalizedParams.path) {
      return { error: 'read_file requires a path parameter' };
    }
    
    // Route HowYouSeeMe perception tools when robot mode is active
    const howYouSeeMeTools = [
      'query_world', 'where_is', 'remember_object', 'recall_memory',
      'forget_memory', 'get_recent_events', 'get_checkpoint',
      'get_robot_status', 'get_robot_context', 'get_camera_frame',
    ];
    if (robotMode && howYouSeeMeTools.includes(actualToolName)) {
      try {
        const result = await howYouSeeMe.executeTool(actualToolName, normalizedParams);
        return { result };
      } catch (e: any) {
        return { error: `HowYouSeeMe tool error: ${e.message}` };
      }
    }

    // Handle built-in tools first
    if (actualToolName === 'get_current_time' || toolName === 'current_time' || toolName === 'get_time' || toolName === 'time') {
      const now = new Date();
      return {
        time: now.toISOString(),
        formatted: now.toLocaleString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        date: now.toLocaleDateString(),
        timeOnly: now.toLocaleTimeString()
      };
    }
    
    if (actualToolName === 'calculate' || toolName === 'calc' || toolName === 'math') {
      try {
        const expr = normalizedParams?.expression || normalizedParams;
        // Safe math evaluation (basic operations only)
        const sanitized = String(expr).replace(/[^0-9+\-*/().sqrt\s]/g, '');
        const result = Function('"use strict"; return (' + sanitized.replace(/sqrt/g, 'Math.sqrt') + ')')();
        return { expression: expr, result };
      } catch (e) {
        return { error: `Invalid expression: ${e}` };
      }
    }

    // comet_run — fire comet_ask then auto-poll until done
    if (actualToolName === 'comet_run') {
      const prompt = normalizedParams.prompt as string;
      if (!prompt) return { error: 'comet_run requires a prompt parameter' };
      const maxWait = Math.min(Number(normalizedParams.maxWaitSeconds) || 240, 360);
      const pollIntervalMs = 20000;
      const startTime = Date.now();

      // Fire comet_ask via the short-timeout alias — returns in ~10s regardless
      // The task keeps running in Comet even after the MCP call times out
      setCurrentResponse(`🚀 Sending task to Comet…`);
      mcpIntegration.executeMCPTool('comet_ask_fire', { prompt }).catch(() => {
        // Expected — 10s MCP timeout fires the task then times out. Task still runs.
      });

      // Give Comet a moment to register the task before first poll
      await new Promise(r => setTimeout(r, 12000));
      setCurrentResponse(`⚙️ Comet is working on: "${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}"`);

      // Poll loop — keep going as long as task is WORKING, no timeout while active
      let seenWorking = false;
      let lastStatus = 'UNKNOWN';
      let lastSteps: string[] = [];
      let finalResponse = '';
      let consecutiveIdle = 0;

      while (true) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        // Hard stop: if we never saw WORKING after maxWait, give up (task never started)
        if (!seenWorking && elapsed > maxWait) break;
        // Never stop while task is actively WORKING — only stop on IDLE/COMPLETED

        let pollResult: any;
        try {
          pollResult = await mcpIntegration.executeMCPTool('comet_poll', {});
        } catch (_) {
          await new Promise(r => setTimeout(r, pollIntervalMs));
          continue;
        }

        const raw = Array.isArray(pollResult?.content)
          ? pollResult.content.map((c: any) => c.text || '').join('\n')
          : typeof pollResult === 'string' ? pollResult : JSON.stringify(pollResult ?? '');

        const upperRaw = raw.toUpperCase();
        const elapsedNow = Math.round((Date.now() - startTime) / 1000);

        if (upperRaw.includes('WORKING')) {
          seenWorking = true;
          consecutiveIdle = 0;
          lastStatus = 'WORKING';
          lastSteps = raw.split('\n').filter((l: string) => l.trim()).slice(0, 6);
          setCurrentResponse(`⚙️ Comet working… (${elapsedNow}s)\n${lastSteps.join('\n')}`);
        } else if (upperRaw.includes('COMPLETED')) {
          finalResponse = raw;
          lastStatus = 'COMPLETED';
          break;
        } else if (upperRaw.includes('IDLE')) {
          consecutiveIdle++;
          // IDLE right after firing = task not started yet, keep waiting
          // IDLE after we saw WORKING = task finished
          if (seenWorking && consecutiveIdle >= 2) {
            // Two consecutive IDLE polls after WORKING = definitely done
            finalResponse = raw;
            lastStatus = 'COMPLETED';
            break;
          }
          if (seenWorking && consecutiveIdle >= 1) {
            // One IDLE after WORKING — poll once more quickly to confirm
            setCurrentResponse(`⚙️ Comet finishing… (${elapsedNow}s)`);
          }
        }

        await new Promise(r => setTimeout(r, pollIntervalMs));
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (lastStatus === 'COMPLETED') {
        return { success: true, status: 'completed', elapsed: `${elapsed}s`, result: finalResponse };
      }
      // Timed out — but task may still be running. Tell LLM to poll manually.
      return {
        success: false,
        status: seenWorking ? 'still_working' : 'unknown',
        elapsed: `${elapsed}s`,
        lastSteps,
        message: seenWorking
          ? `Task is still running after ${elapsed}s. Call comet_poll to check when it finishes.`
          : `Could not confirm task started after ${elapsed}s. Call comet_poll to check status.`,
      };
    }

    // Built-in filesystem/network tools — route through FilesystemToolsService
    if (['fetch_url', 'execute_command', 'list_directory', 'read_file', 'path_exists', 'get_file_info',
         'wait',
         'browser_navigate', 'browser_click', 'browser_type', 'browser_read_page', 'browser_screenshot',
         'browser_eval', 'browser_find_element', 'browser_scroll', 'browser_get_tabs', 'browser_switch_tab',
         'browser_go_back', 'browser_go_forward', 'browser_wait_for', 'browser_get_url',
         'browser_press_key', 'browser_new_tab', 'browser_close_tab',
        ].includes(actualToolName)) {
      try {
        const { getFilesystemToolsService } = await import('../services/filesystemTools');
        const fsService = getFilesystemToolsService();
        return await fsService.executeTool(actualToolName, normalizedParams);
      } catch (fsErr) {
        console.warn(`FilesystemToolsService failed for ${actualToolName}:`, fsErr);
        // fall through to MCP
      }
    }
    
    // Try MCP tool execution via the integration hook
    try {
      // Check if this tool exists in our MCP tools (try both original and actual name)
      const mcpTool = mcpIntegration.mcpTools.find(t => t.name === actualToolName || t.name === toolName);
      
      console.log('🔍 Looking for tool:', actualToolName, '(original:', toolName, ') in MCP tools:', mcpIntegration.mcpTools.map(t => t.name));
      
      if (mcpTool) {
        console.log('🔧 Executing MCP tool via integration:', mcpTool.name, 'with normalized params:', normalizedParams);
        return await mcpIntegration.executeMCPTool(mcpTool.name, normalizedParams);
      }
      
      // Try executing via mcpIntegration even if not in the cached list
      // (the tool might exist on the server but not be cached yet)
      try {
        console.log('🔧 Trying MCP tool execution (not in cache):', actualToolName);
        const result = await mcpIntegration.executeMCPTool(actualToolName, normalizedParams);
        return result;
      } catch (mcpError) {
        console.log('MCP integration failed:', mcpError);
      }
      
      throw new Error(`Tool ${actualToolName} not found in any MCP server`);
    } catch (error) {
      console.error(`Failed to execute tool ${actualToolName}:`, error);
      throw error;
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
    const loadChats = async () => {
      // Initialize sync service
      await chatSync.init();

      if (isWeb) {
        // Web mode: load chats from Supabase
        const remoteChats = await chatSync.fetchChats();
        if (remoteChats.length > 0) {
          setChats(remoteChats);
          setActiveChat(remoteChats[0]);
        } else {
          // No remote chats yet — show empty state
          setChats([]);
          setActiveChat(null);
        }
      } else {
        // Desktop mode: load from local storage, sync to Supabase in background
        const allChats = chatManager.getAllChats();
        setChats(allChats);
        setActiveChat(chatManager.getActiveChat());
        // Background sync — don't block UI
        chatSync.syncAllChats(allChats).catch(e => console.warn('Initial chat sync failed:', e));
      }
    };
    loadChats();
  }, [chatManager, chatSync]);

  // Desktop: periodically pull new chats created on web
  useEffect(() => {
    if (isWeb) return; // Only desktop syncs inbound
    if (!remoteConnection.isAuthenticated) return;

    const pullRemoteChats = async () => {
      try {
        const localIds = new Set(chatManager.getAllChats().map(c => c.id));
        const newChats = await chatSync.fetchNewRemoteChats(localIds);
        if (newChats.length > 0) {
          let imported = 0;
          for (const chat of newChats) {
            if (chatManager.importChat(chat)) imported++;
          }
          if (imported > 0) {
            console.log(`📥 Imported ${imported} new chat(s) from web`);
            refreshChatState();
          }
        }
      } catch (e) {
        console.warn('Remote chat pull failed:', e);
      }
    };

    // Initial pull
    pullRemoteChats();
    // Then every 30s
    const interval = setInterval(pullRemoteChats, 30000);
    return () => clearInterval(interval);
  }, [chatManager, chatSync, remoteConnection.isAuthenticated]);

  // Web: periodically refresh chats from Supabase to pick up desktop responses
  useEffect(() => {
    if (!isWeb) return;

    const refreshWebChats = async () => {
      // Don't refresh while a response is being awaited — it would overwrite
      // the "⏳ Waiting..." currentResponse and could cause stuck state
      if (isTyping) return;

      try {
        const remoteChats = await chatSync.fetchChats();
        if (remoteChats.length === 0) return;
        setChats(remoteChats);
        // Update activeChat if it's in the refreshed list (preserves selection)
        setActiveChat(prev => {
          if (!prev) return remoteChats[0];
          const updated = remoteChats.find(c => c.id === prev.id);
          return updated || prev;
        });
      } catch (e) {
        console.warn('Web chat refresh failed:', e);
      }
    };

    // Refresh every 15s to pick up desktop-side changes
    const interval = setInterval(refreshWebChats, 15000);
    return () => clearInterval(interval);
  }, [chatSync, isTyping]);

  // Register demo tools when unified integration is ready
  useEffect(() => {
    if (!unifiedIntegration.isReady()) return;

    // Register demo tools
    unifiedIntegration.registerTool('calculator', async (params: any) => {
      const { expression } = params;
      try {
        // Simple calculator implementation
        const result = eval(expression);
        return { result, expression };
      } catch (error) {
        throw new Error(`Invalid expression: ${expression}`);
      }
    });

    unifiedIntegration.registerTool('current_time', async () => {
      return {
        time: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        formatted: new Date().toLocaleString()
      };
    });

    unifiedIntegration.registerTool('weather', async (params: any) => {
      const { location } = params;
      // Mock weather data
      return {
        location,
        temperature: Math.round(Math.random() * 30 + 10),
        condition: ['sunny', 'cloudy', 'rainy', 'snowy'][Math.floor(Math.random() * 4)],
        humidity: Math.round(Math.random() * 100),
        windSpeed: Math.round(Math.random() * 20)
      };
    });

    unifiedIntegration.registerTool('system_info', async () => {
      return {
        platform: navigator.platform,
        userAgent: navigator.userAgent,
        language: navigator.language,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        timestamp: Date.now()
      };
    });

    console.log('Demo tools registered for unified integration');
  }, [unifiedIntegration.isReady()]);

  // Speech service is now manually connected via button press only
  // No auto-connect behavior

  // Get messages early for use in effects
  const messages = activeChat?.messages || [];

  // Listen for settings changes
  useEffect(() => {
    const unsubscribe = settingsManager.subscribe((newSettings) => {
      setAppSettings(newSettings);
      // Update tools enabled state when settings change
      if (newSettings.tools?.enabled !== undefined) {
        setToolsEnabled(newSettings.tools.enabled);
      }
      // Update greeting when settings change
      setCurrentGreeting(GreetingUtils.getCurrentGreeting(newSettings));
    });
    return unsubscribe;
  }, [settingsManager]);

  // Initialize tools enabled state from settings
  useEffect(() => {
    setToolsEnabled(appSettings.tools?.enabled || false);
  }, [appSettings.tools?.enabled]);

  // Sync MCP server count from mcpIntegration hook
  useEffect(() => {
    // Update server count from connected servers
    const connectedCount = mcpIntegration.mcpServers.filter(s => s.connected).length;
    setMcpServerCount(connectedCount);
    console.log('🔌 MCP servers:', mcpIntegration.mcpServers.length, 'connected:', connectedCount, 'tools:', mcpIntegration.mcpTools.length);
  }, [mcpIntegration.mcpTools, mcpIntegration.mcpServers]);

  // Handle incoming remote messages
  useEffect(() => {
    if (allyRemote.incomingMessages.length > 0) {
      const latestMessage = allyRemote.incomingMessages[allyRemote.incomingMessages.length - 1];

      // Add remote message to chat
      const remoteMessage: Message = {
        id: `remote-${Date.now()}`,
        content: `🌐 Remote: ${latestMessage}`,
        role: 'user',
        timestamp: Date.now()
      };

      addMessageToActiveChat(remoteMessage);

      // Send response back to remote
      allyRemote.sendMessage(`Message received and processed: "${latestMessage}"`);

      // Clear the message from the queue
      allyRemote.clearMessages();
    }
  }, [allyRemote.incomingMessages, addMessageToActiveChat, allyRemote]);

  // Remote chat integration - handle new remote polling system
  useEffect(() => {
    if (remoteConnection.mode !== 'remote' || !remoteConnection.isAuthenticated) {
      return;
    }

    const integration = createRemoteChatIntegration({
      onRemoteMessage: (message) => {
        addMessageToActiveChat(message);
      },
      onRemoteResponse: (response) => {
        addMessageToActiveChat(response);
      },
      onStatusChange: (status) => {
        console.log('Remote chat status:', status);
      }
    });

    integration.start();

    return () => {
      integration.stop();
    };
  }, [remoteConnection.mode, remoteConnection.isAuthenticated, addMessageToActiveChat]);

  // Register the Remote Tool Bridge handler (desktop only)
  // When a web message requests tool usage, the poller delegates here
  // so we can process it through the full MCP-aware agentic pipeline
  useEffect(() => {
    if (isWeb) return; // Only desktop registers the handler

    const handler = async (request: RemoteToolRequest) => {
      console.log('🔧 RemoteToolBridge: Processing remote tool request:', request.messageId);
      const supabase = (await import('../utils/supabase')).getSupabaseClient();
      if (!supabase) throw new Error('Supabase not available');

      const updateResponse = async (response: string, status: string = 'processing') => {
        await supabase.from('chat_messages').update({
          response,
          status,
          updated_at: new Date().toISOString(),
          ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
        }).eq('id', request.messageId);
      };

      // Fetch prior messages in this session for conversation context
      const fetchSessionHistory = async (): Promise<Message[]> => {
        try {
          const { data } = await supabase
            .from('chat_messages')
            .select('content, response, status')
            .eq('session_id', request.sessionId)
            .eq('status', 'completed')
            .neq('id', request.messageId)
            .order('created_at', { ascending: true })
            .limit(20);
          if (!data) return [];
          const history: Message[] = [];
          for (const row of data) {
            if (row.content) history.push({ id: row.content, role: 'user', content: row.content, timestamp: 0 });
            if (row.response) {
              // Strip tool blocks — only keep the final summary text
              const clean = row.response
                .replace(/🔧 \*\*[\s\S]*?```[\s\S]*?```/g, '')
                .replace(/❌ \*\*[\s\S]*?\n/g, '')
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .trim();
              if (clean) history.push({ id: row.response, role: 'assistant', content: clean, timestamp: 0 });
            }
          }
          return history;
        } catch { return []; }
      };

      try {
        const sessionHistory = await fetchSessionHistory();

        // Get MCP tools
        const mcpTools = await getMcpToolsForLLM();
        
        if (mcpTools.length === 0) {
          // No tools — just do a regular Ollama chat with system prompt
          const basicSystemPrompt = getPrompt('basic');
          let fullResponse = '';
          await ollamaIntegration.sendMessageToOllama(
            sessionHistory, request.content,
            (update) => {
              if (update.type === 'response' || update.type === 'done') {
                fullResponse = update.response || '';
                updateResponse(fullResponse).catch(() => {});
              }
            },
            basicSystemPrompt
          );
          await updateResponse(fullResponse, 'completed');
          // Trigger Discord delivery if applicable
          const remoteUrl = localStorage.getItem('ally-remote-url') || 'https://ally-taupe.vercel.app';
          fetch(`${remoteUrl}/api/discord/deliver`, { method: 'POST' }).catch(() => {});
          return;
        }

        // Build tool system prompt (same as handleSendWithTools)
        const savedToolPrompt = getPrompt('agentic');

        const toolsSystemPrompt = `${savedToolPrompt}\n\nAVAILABLE TOOLS:\n${mcpTools.map(t => {
          const params = t.parameters ? ` | params: ${JSON.stringify(t.parameters)}` : ' | no params needed';
          return `• ${t.name}${params}\n  → ${t.description}`;
        }).join('\n')}`;

        // Use PTC or agentic loop depending on mode
        let finalContent: string;
        if (ptcMode) {
          // PTC: LLM writes script, execute, summarize — 2 LLM calls
          let ptcResult = '';
          const ptcScript = await (async () => {
            let scriptResponse = '';
            await ollamaIntegration.sendMessageToOllama(
              sessionHistory,
              request.content,
              (update) => { if (update.type === 'response' || update.type === 'done') scriptResponse = update.response || ''; },
              buildPTCScriptPrompt(mcpTools, request.content, 'Windows',
                [...sessionHistory].reverse().find(m => m.role === 'assistant')?.content?.slice(0, 2000))
            );
            return extractScriptFromResponse(scriptResponse);
          })();

          if (ptcScript) {
            const execResult = await executeScript(
              ptcScript,
              mcpTools,
              async (toolName, params) => executeMcpTool(toolName, params as Record<string, unknown>),
              { onToolCall: (tool) => updateResponse(`⚙️ Calling ${tool}…`).catch(() => {}) }
            );
            await ollamaIntegration.sendMessageToOllama(
              [],
              buildPTCSummaryPrompt(request.content, execResult.stdout, execResult.stderr, execResult.toolCallLog),
              (update) => { if (update.type === 'response' || update.type === 'done') { ptcResult = update.response || ''; updateResponse(ptcResult).catch(() => {}); } },
              'You are a helpful assistant. Summarize the tool results naturally.'
            );
            finalContent = ptcResult || 'Done.';
          } else {
            // Fallback to agentic loop
            finalContent = await runAgenticLoop(
              request.content,
              toolsSystemPrompt,
              sessionHistory,
              { onStreamUpdate: (text) => updateResponse(text).catch(() => {}) }
            );
          }
        } else {
          // Use the shared agentic loop — same pipeline as desktop
          finalContent = await runAgenticLoop(
            request.content,
            toolsSystemPrompt,
            sessionHistory,
            {
              onStreamUpdate: (text) => {
                // Stream partial responses to Supabase so web sees live updates
                updateResponse(text).catch(() => {});
              },
            }
          );
        }

        // Write the final structured response (with tool blocks) to Supabase
        await updateResponse(finalContent || 'No response generated.', 'completed');

        // Also add to desktop local chat so it shows in the desktop UI
        // This lays the groundwork for streaming remote responses in the desktop UI
        let remoteChat = chatManager.getChatById(request.sessionId);
        if (!remoteChat) {
          // Session was created on web — import it locally so desktop can track it
          const imported: import('../types/chat').Chat = {
            id: request.sessionId,
            title: request.content.slice(0, 40) || 'Remote Chat',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          chatManager.importChat(imported);
          remoteChat = chatManager.getChatById(request.sessionId);
        }
        if (remoteChat) {
          chatManager.addMessage(request.sessionId, {
            id: `remote-user-${request.messageId}`,
            role: 'user',
            content: request.content,
            timestamp: Date.now() - 1000,
            metadata: { source: 'remote' as const },
          });
          chatManager.addMessage(request.sessionId, {
            id: `remote-assistant-${request.messageId}`,
            role: 'assistant',
            content: finalContent || 'No response generated.',
            timestamp: Date.now(),
            metadata: { source: 'remote' as const },
          });
          refreshChatState();
          // Sync updated chat back to Supabase
          const updated = chatManager.getChatById(request.sessionId);
          if (updated) chatSync.syncChat(updated).catch(() => {});
        }

        // If this was a Discord message, trigger delivery
        if (request.messageId) {
          const remoteUrl =
            localStorage.getItem('ally-remote-url') ||
            'https://ally-taupe.vercel.app';
          fetch(`${remoteUrl}/api/discord/deliver`, { method: 'POST' }).catch(() => {});
        }
      } catch (error) {
        console.error('❌ RemoteToolBridge handler error:', error);
        await updateResponse(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        // Trigger delivery even on error so Discord doesn't hang
        const remoteUrl = localStorage.getItem('ally-remote-url') || 'https://ally-taupe.vercel.app';
        fetch(`${remoteUrl}/api/discord/deliver`, { method: 'POST' }).catch(() => {});
      }
    };

    RemoteToolBridge.registerHandler(handler);
    return () => RemoteToolBridge.unregisterHandler();
  }, [ollamaIntegration, getMcpToolsForLLM, executeMcpTool, parseToolCallFromResponse, runAgenticLoop, ptcMode]);

  // Handle speech recognition results - automatically send as messages when voice mode is enabled
  const lastProcessedSpeechRef = useRef<string | null>(null);
  useEffect(() => {
    if (speechService.lastRecognizedText && 
        voiceModeEnabled && 
        speechService.lastRecognizedText !== lastProcessedSpeechRef.current) {
      
      console.log('🎤 Processing speech recognition result:', speechService.lastRecognizedText);
      lastProcessedSpeechRef.current = speechService.lastRecognizedText;
      handleSpeechRecognized(speechService.lastRecognizedText);
    }
  }, [speechService.lastRecognizedText, voiceModeEnabled]);

  // Handle preview toggle callback
  const handlePreviewToggle = (expanded: boolean) => {
    setIsPreviewExpanded(expanded);
  };

  // Custom collapse toggle with state cleanup
  const handleCustomCollapseToggle = () => {
    if (isWeb) return; // Never collapse in web mode
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
            // Only add context height if context is present AND the context UI is expanded
            if (isContextExpanded && contextMonitoring.hasNewContext && (contextMonitoring.contextData.clipboard || contextMonitoring.contextData.selectedText)) {
              actualCollapsedHeight += collapsedDims.contextHeight;
            }

            const baseHeight = actualCollapsedHeight + padding;
            const baseWidth = collapsedDims.width + padding;

            console.log('Force resizing collapsed window to:', baseWidth, 'x', baseHeight, 'context expanded:', isContextExpanded, 'context present:', contextMonitoring.hasNewContext);
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

  // Listen for terminal panel toggle event
  useEffect(() => {
    const pip = (window as any).pip;
    if (!pip?.onToggleTerminal) return;
    const cleanup = pip.onToggleTerminal(() => setShowTerminal((prev: boolean) => !prev));
    return cleanup;
  }, []);

  // Handle stop typing
  const handleStop = async () => {
    setIsTyping(false);
    setCurrentResponse(''); // Clear current response when stopping
    setActiveToolExecutions([]); // Clear tool executions when stopping
    setStreamingThinking(null); // Clear streaming thinking when stopping

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
          case 'P':
            event.preventDefault();
            setShowProviderSettings(true);
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
          case 'p':
          case 'P':
            event.preventDefault();
            setShowProviderSettings(true);
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
• Ctrl+P - Provider Settings
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

  // Helper function to calculate consistent dimensions
  const calculateDimensions = () => {
    const sidebarWidth = state.collapsed ? 0 : (sidebarCollapsed ? 48 : 280);
    
    let width = state.collapsed
      ? collapsedDims.width
      : dims.w + sidebarWidth;
    let height = state.collapsed
      ? collapsedHeight
      : dims.h;

    // Ensure content doesn't exceed reasonable bounds for acrylic background
    // The acrylic background has limitations, so we need to be more conservative
    const maxTotalWidth = 850; // Conservative max to prevent overflow from acrylic background
    const maxTotalHeight = 800; // Conservative max height
    
    // Account for padding in our calculations
    const maxContentWidth = maxTotalWidth - (padding * 2);
    const maxContentHeight = maxTotalHeight - (padding * 2);
    
    if (width > maxContentWidth) {
      width = maxContentWidth;
      console.log('Capping window width to prevent acrylic overflow:', width);
    }
    if (height > maxContentHeight) {
      height = maxContentHeight;
      console.log('Capping window height to prevent acrylic overflow:', height);
    }

    return { width, height, sidebarWidth };
  };

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
  // Add space for context only when it's present and the context UI is expanded
  if (isContextExpanded && contextMonitoring.hasNewContext && (contextMonitoring.contextData.clipboard || contextMonitoring.contextData.selectedText)) {
    // Add space for the context header and content when expanded
    collapsedHeight += 96; // Space for both header and expanded content
  }
  // Add space for response preview when active
  if (currentResponse || isTyping) {
    collapsedHeight += collapsedDims.responseHeight;
  }

  // Smart sidebar management - auto-collapse when window would be too wide
  useEffect(() => {
    if (state.collapsed) return; // Don't manage sidebar when window is collapsed
    
    const dims = sizePx[state.size];
    const expandedSidebarWidth = 280;
    const maxReasonableWidth = 850 - (padding * 2); // Max content width before overflow
    
    // Check if current size + expanded sidebar would exceed reasonable bounds
    const wouldExceedBounds = (dims.w + expandedSidebarWidth) > maxReasonableWidth;
    
    // Auto-collapse sidebar if it would cause overflow and it's currently expanded
    if (wouldExceedBounds && !sidebarCollapsed) {
      console.log('Auto-collapsing sidebar to prevent window overflow at size', state.size);
      setSidebarCollapsed(true);
    }
    // Don't auto-expand - let user control sidebar state manually
  }, [state.size, state.collapsed, padding]);

  // Sync window size when size state changes
  useEffect(() => {
    if (isWeb || !window.pip) {
      return; // Web mode uses CSS for sizing, no window.pip needed
    }

    setIsResizing(true);
    
    // Calculate dimensions using helper function
    const { width: contentWidth, height: contentHeight, sidebarWidth } = calculateDimensions();
    const width = contentWidth + (padding * 2);
    const height = contentHeight + (padding * 2);

    console.log('Resizing window to:', width, 'x', height, 'collapsed:', state.collapsed, 'preview expanded:', isPreviewExpanded, 'current response:', !!currentResponse, 'sidebar:', sidebarWidth, 'context present:', contextMonitoring.hasNewContext, 'screen:', window.screen.availWidth, 'x', window.screen.availHeight);

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
  }, [state.size, state.collapsed, sidebarCollapsed, appSettings.ui.windowPadding, isPreviewExpanded, currentResponse, isTyping, collapsedHeight, isContextExpanded]);

  return (
    <motion.div
      className={cn(
        "fixed bg-transparent flex items-center justify-center",
        isWeb && "inset-0 bg-[#030712]",
        !isWeb && platform === 'win32' && "win32-acrylic",
        !isWeb && platform === 'linux' && "linux-glass-effect"
      )}
      style={isWeb ? {
        zIndex: 50
      } : {
        width: calculateDimensions().width + (padding * 2),
        height: calculateDimensions().height + (padding * 2),
        zIndex: 50
      } as React.CSSProperties}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: isResizing ? 1.02 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
    >
      {/* Animated blob background for web mode */}
      {isWeb && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="blob-1 absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-purple-600/25 blur-[80px]" />
          <div className="blob-2 absolute top-[10%] right-[-15%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-blue-500/20 blur-[80px]" />
          <div className="blob-3 absolute bottom-[-10%] left-[20%] w-[55vw] h-[55vw] max-w-[650px] max-h-[650px] rounded-full bg-indigo-500/15 blur-[80px]" />
          <div className="blob-4 absolute bottom-[20%] right-[5%] w-[35vw] h-[35vw] max-w-[400px] max-h-[400px] rounded-full bg-violet-400/15 blur-[60px]" />
        </div>
      )}
      <motion.div
        layout
        className={cn(
          "overflow-hidden relative flex transition-all duration-300 chat-container acrylic-container",
          !isWeb && ThemeUtils.getBorderRadiusClass(appSettings.ui.borderRadius, platform),
          !isWeb && "border border-white/20 shadow-[0_8px_40px_rgba(0,0,0,0.4)]",
          isWeb && "w-full h-full",
          isResizing && "shadow-lg scale-[1.01]",
          isWeb
            ? (theme === 'dark' ? "web-glass-bg text-white/90" : "bg-white/80 backdrop-blur-2xl text-black/90")
            : platform === 'win32'
              ? "bg-transparent"
              : platform === 'linux'
                ? theme === 'dark'
                  ? "linux-blur bg-gradient-to-b from-white/[0.06] to-white/[0.01]"
                  : "linux-blur-light bg-gradient-to-b from-black/[0.06] to-black/[0.01]"
                : theme === 'dark'
                  ? "bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl backdrop-saturate-150"
                  : "bg-gradient-to-b from-black/[0.08] to-black/[0.02] backdrop-blur-2xl backdrop-saturate-150",
          !isWeb && (theme === 'dark' ? "text-white/90" : "text-black/90")
        )}
        style={isWeb ? {} : {
          width: calculateDimensions().width,
          height: calculateDimensions().height,
          margin: `${padding}px`
        } as React.CSSProperties}
      >
        {/* AI Backdrop — Gemini-style animated glow (Behind everything else) */}
        <AIBackdrop state={backdropState} />

        {/* Chat Sidebar */}
        {!state.collapsed && (
          <div className={cn("chat-sidebar", sidebarCollapsed && "collapsed")}>
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
          </div>
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 chat-main-area">
          {/* Header */}
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2 border-b transition-all duration-200",
              !isWeb && "cursor-grab active:cursor-grabbing",
              "relative z-10 min-h-[44px]",
              state.collapsed && "flex-col items-stretch gap-2 pb-3 border-b-0",
              isWeb
                ? "border-white/5 bg-black/40 backdrop-blur-sm"
                : platform === 'win32'
                  ? "border-white/10 hover:bg-white/5 hover:border-blue-500/30"
                  : theme === 'dark'
                    ? "border-white/10 hover:bg-white/5 hover:border-blue-500/30"
                    : "border-black/10 hover:bg-black/5 hover:border-blue-500/30"
            )}
            style={isWeb ? {} : {
              WebkitAppRegion: state.collapsed ? 'no-drag' : 'drag',
              WebkitUserSelect: 'none',
              userSelect: 'none'
            } as React.CSSProperties}
            title={state.collapsed ? "" : isWeb ? "" : "Drag to move window"}
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
                showContext={contextMonitoring.showContext}
                onContextToggle={() => contextMonitoring.setShowContext(!contextMonitoring.showContext)}
                onContextToggleChange={contextMonitoring.setContextToggleEnabled}
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
                onVoiceModeToggle={async () => {
                  const newVoiceMode = !voiceModeEnabled;
                  console.log('🎤 Voice mode toggle clicked:', newVoiceMode);
                  
                  // If enabling voice mode and not connected, try to connect first
                  if (newVoiceMode && !speechService.isConnected) {
                    console.log('🔌 Connecting to speech service...');
                    try {
                      await speechService.connect();
                    } catch (error) {
                      console.error('Failed to connect to speech service:', error);
                      return; // Don't enable voice mode if connection failed
                    }
                  }
                  
                  setVoiceModeEnabled(newVoiceMode);
                }}
                onSpeechSettingsOpen={() => setShowSettings(true)}
                speechServiceConnected={speechService.isConnected}
                isContextExpanded={isContextExpanded}
                onContextExpandedChange={setIsContextExpanded}
                isSpeaking={speechService.isSpeaking}
                isListening={speechService.isListening}
                placeholder={currentGreeting}
                orbState={orbState}
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
                currentModel={ollamaIntegration.currentModel}
                showModelSelector={ollamaIntegration.showModelSelector}
                onModelSelectorToggle={() => ollamaIntegration.setShowModelSelector(!ollamaIntegration.showModelSelector)}
                onModelSelect={(model) => {
                  ollamaIntegration.setCurrentModel(model);
                  ollamaIntegration.setShowModelSelector(false);
                }}
                onSizeChange={handleSizeChange}
                onSettings={() => setShowSettings(true)}
                onProviderSettings={() => setShowProviderSettings(true)}
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
                {/* Unified Accessibility Context Display */}
                <AccessibilityContextMonitor
                  platform={platform}
                  theme={theme}
                  className="mb-3"
                  clipboardText={contextMonitoring.contextData.clipboard}
                  onDismiss={() => contextMonitoring.setHasNewContext(false)}
                />

                {/* Messages */}
                <div className={cn(
                  "flex-1 overflow-y-auto p-3 select-text",
                  isWeb && "px-6 md:px-12 lg:px-24 xl:px-32",
                  appSettings.ui.messageSpacing === 'compact' ? 'space-y-2' :
                    appSettings.ui.messageSpacing === 'normal' ? 'space-y-3' : 'space-y-4',
                  platform === 'win32'
                    ? "scrollbar-thin scrollbar-thumb-white/10"
                    : theme === 'dark' ? "scrollbar-thin scrollbar-thumb-white/10" : "scrollbar-thin scrollbar-thumb-black/10"
                )}>
                  {/* Remote Activity Indicator */}
                  <RemoteActivityIndicator className="mb-2" />
                  
                  {/* Web mode indicator */}
                  {isWeb && (
                    <div className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <span className="text-[10px] text-blue-400">🌐 Connected to your desktop Ally</span>
                    </div>
                  )}
                  
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
                  
                  {/* Tool Execution Status Display */}
                  {(toolCalling.state.isExecutingTools || toolCalling.state.currentToolCalls.length > 0 || toolCalling.state.currentToolResults.length > 0) && (
                    <ToolExecutionStatus
                      isExecuting={toolCalling.state.isExecutingTools}
                      currentToolCalls={toolCalling.state.currentToolCalls}
                      currentToolResults={toolCalling.state.currentToolResults}
                      platform={platform}
                      theme={theme}
                      compact={false}
                      showDetails={true}
                    />
                  )}

                  {/* Agent Activity Stream — Cursor-style live step feed */}
                  {(agentSteps.length > 0 || (isTyping && agenticMode)) && (
                    <AgentActivityStream
                      steps={agentSteps}
                      isActive={isTyping && agenticMode}
                      stepCount={agentSteps.length}
                      maxSteps={8}
                      theme={theme}
                    />
                  )}

                  {/* Live Thinking Panel — real-time thought tokens */}
                  {(streamingThoughtText || (isTyping && streamingThinking)) && (
                    <LiveThinkingPanel
                      text={streamingThoughtText}
                      isStreaming={isTyping}
                      isExpanded={thoughtExpanded}
                      onToggle={() => setThoughtExpanded((v) => !v)}
                      theme={theme}
                    />
                  )}

                  {/* Show streaming response in expanded mode */}
                  {isTyping && (currentResponse || streamingSegments.length > 0) && (
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
                      {streamingSegments.length > 0 ? (
                        /* Segmented render: tool pills interleaved inline with text (Cursor-style) */
                        <div className={cn(
                          "prose max-w-none prose-invert",
                          appSettings.ui.fontSize === 'xs' ? 'prose-xs' :
                            appSettings.ui.fontSize === 'sm' ? 'prose-sm' :
                              appSettings.ui.fontSize === 'base' ? 'prose-base' :
                                appSettings.ui.fontSize === 'lg' ? 'prose-lg' : 'prose-xl'
                        )}>
                          {streamingSegments.map((seg, i) => {
                            if (seg.type === 'tool' && seg.toolExecution) {
                              return (
                                <InlineToolPill
                                  key={seg.toolExecution.id ?? i}
                                  execution={seg.toolExecution}
                                  theme={theme}
                                />
                              );
                            }
                            const isLastSeg = i === streamingSegments.length - 1;
                            return (
                              <ReactMarkdown
                                key={i}
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                  code: ({ inline, className, children, ...props }: any) => {
                                    if (inline) {
                                      return <code className="px-1 py-0.5 bg-white/10 rounded text-sm" {...props}>{children}</code>;
                                    }
                                    return (
                                      <pre className="bg-black/20 rounded-lg overflow-x-auto my-2 p-3">
                                        <code className={cn("text-sm", className)} {...props}>{children}</code>
                                      </pre>
                                    );
                                  }
                                }}
                              >
                                {(seg.content ?? '') + (isLastSeg ? '▋' : '')}
                              </ReactMarkdown>
                            );
                          })}
                          {/* Cursor shown when last segment is a tool pill (no trailing text yet) */}
                          {streamingSegments[streamingSegments.length - 1]?.type === 'tool' && (
                            <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1 align-text-bottom" />
                          )}
                        </div>
                      ) : (
                        /* Legacy render: pills above text (non-agentic / thinking modes) */
                        <>
                          {(activeToolExecutions.length > 0 || streamingThinking) && (
                            <InlineToolExecutions tools={activeToolExecutions} theme={theme} thinking={streamingThinking || undefined} />
                          )}
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
                        </>
                      )}
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
                  placeholder={speechService.interimTranscript ? `🎤 ${speechService.interimTranscript}` : currentGreeting}
                  messages={messages}
                  currentModel={ollamaIntegration.currentModel}
                  toolsEnabled={isWeb ? true : toolsEnabled}
                  agenticMode={isWeb ? true : agenticMode}
                  autopilotMode={isWeb ? true : autopilotMode}
                  mcpToolCount={isWeb ? 0 : mcpIntegration.mcpTools.length + 2}
                  onToolsToggle={isWeb ? undefined : () => setToolsEnabled(!toolsEnabled)}
                  onAgenticModeToggle={isWeb ? undefined : () => setAgenticMode(!agenticMode)}
                  onAutopilotToggle={isWeb ? undefined : () => {
                    const next = !autopilotMode;
                    setAutopilotMode(next);
                    localStorage.setItem('ally-autopilot-mode', String(next));
                  }}
                  ptcMode={isWeb ? false : ptcMode}
                  onPtcModeToggle={isWeb ? undefined : () => {
                    const next = !ptcMode;
                    setPtcMode(next);
                    localStorage.setItem('ally-ptc-mode', String(next));
                  }}
                  robotMode={isWeb ? false : robotMode}
                  onRobotModeToggle={isWeb ? undefined : () => {
                    const next = !robotMode;
                    setRobotMode(next);
                    localStorage.setItem('ally-robot-mode', String(next));
                  }}
                  howYouSeeMeAvailable={!isWeb && howYouSeeMe.available}
                  showTerminal={showTerminal}
                  onTerminalToggle={isWeb ? undefined : () => setShowTerminal(!showTerminal)}
                />

                {/* Tool Approval Dialog */}
                <AnimatePresence>
                  {pendingToolApproval && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className={cn(
                        "border-t p-3",
                        "bg-amber-500/10 border-amber-500/20"
                      )}
                    >
                      <div className="text-xs text-amber-300 mb-2 font-medium">
                        🔧 Allow tool execution?
                      </div>
                      <div className="text-[11px] text-white/70 mb-2 font-mono bg-black/20 rounded p-2 overflow-x-auto">
                        <span className="text-amber-300">{pendingToolApproval.toolName}</span>
                        {pendingToolApproval.parameters && Object.keys(pendingToolApproval.parameters).length > 0 && (
                          <span className="text-white/50">({JSON.stringify(pendingToolApproval.parameters)})</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => pendingToolApproval.resolve(true)}
                          className="px-3 py-1 text-xs rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-300 transition-colors"
                        >
                          Allow
                        </button>
                        <button
                          onClick={() => pendingToolApproval.resolve(false)}
                          className="px-3 py-1 text-xs rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 transition-colors"
                        >
                          Deny
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

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
                          onVoiceModeChange={async (enabled: boolean) => {
                            console.log('🎤 Voice mode change from SpeechControls:', enabled);
                            
                            // If enabling voice mode and not connected, try to connect first
                            if (enabled && !speechService.isConnected) {
                              console.log('🔌 Connecting to speech service from SpeechControls...');
                              try {
                                await speechService.connect();
                              } catch (error) {
                                console.error('Failed to connect to speech service:', error);
                                return; // Don't enable voice mode if connection failed
                              }
                            }
                            
                            speechService.setVoiceModeEnabled(enabled);
                          }}
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

      {/* Remote Settings - Floating (desktop only, web has it in header) */}
      {!isWeb && (
        <div className={cn(
          "fixed z-40",
          state.collapsed
            ? "top-4 -right-32"
            : "top-16 right-4"
        )}>
          <RemoteSettings />
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        platform={platform}
        theme={theme}
        contextToggleEnabled={contextMonitoring.contextToggleEnabled}
        onContextToggleChange={contextMonitoring.setContextToggleEnabled}
        appSettings={appSettings}
        onSettingsChange={(updates) => {
          settingsManager.updateSettings(updates);
          // Update tools enabled state when settings change
          if (updates.tools?.enabled !== undefined) {
            setToolsEnabled(updates.tools.enabled);
          }
        }}
        ollamaIntegration={ollamaIntegration}
        ollamaService={ollamaService}
        onOpenProviderSettings={() => {
          setShowSettings(false);
          setShowProviderSettings(true);
        }}
        onMcpToolCountChange={setMcpServerCount}
      />

      {/* Provider Settings Modal */}
      <ProviderSettings
        isOpen={showProviderSettings}
        onClose={() => setShowProviderSettings(false)}
        onConfigChange={(config: ProviderConfig) => {
          console.log('Provider config updated:', config);
          // The config is already saved in the component, just log for now
        }}
      />

      {/* Terminal Panel — Cursor-style glass terminal (Ctrl+Shift+`) */}
      <TerminalPanel
        visible={showTerminal}
        onClose={() => setShowTerminal(false)}
        className="absolute bottom-0 left-0 right-0 z-50"
      />

    </motion.div>
  );
}