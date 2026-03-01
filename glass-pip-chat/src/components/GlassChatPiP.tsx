import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import { ThemeUtils } from '../utils/themeUtils';
import { GreetingUtils } from '../utils/greetingUtils';
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
import { InlineToolExecutions, ToolExecution } from './chat/InlineToolIndicator';
import { useToolCalling } from '../hooks/useToolCalling';
import { useMCPACPIntegration } from '../hooks/useMCPACPIntegration';

// Unified Tool Integration
import { useUnifiedToolIntegration } from '../hooks/useUnifiedToolIntegration';
import { createRemoteChatIntegration } from '../services/remoteChatIntegration';
import { useRemoteConnection } from '../hooks/useRemoteConnection';

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

  // Chat management - moved up to be available for hooks
  const [chatManager] = useState(() => ChatManager.getInstance());
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  
  // Tools state - must be declared before hooks that use it
  const [toolsEnabled, setToolsEnabled] = useState(false);
  // Agentic mode - allows AI to use multiple tools sequentially
  const [agenticMode, setAgenticMode] = useState(true); // Default to agentic mode when tools are enabled

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
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [currentGreeting, setCurrentGreeting] = useState(() => GreetingUtils.getCurrentGreeting(appSettings));
  
  // Active tool executions for inline display during streaming
  const [activeToolExecutions, setActiveToolExecutions] = useState<ToolExecution[]>([]);
  const [mcpServerCount, setMcpServerCount] = useState(0);
  // Streaming thinking state - for showing thinking as pill during streaming
  const [streamingThinking, setStreamingThinking] = useState<string | null>(null);

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
    // Clear TTS queue when switching chats to prevent cross-chat audio issues
    console.log('🔄 Switching chat - resetting TTS queue');
    speechService.resetTTSQueue();
    
    chatManager.switchToChat(chatId);
    refreshChatState();
  };

  const handleChatCreate = () => {
    // Clear TTS queue when creating new chat to prevent issues with first message
    console.log('🆕 Creating new chat - resetting TTS queue');
    speechService.resetTTSQueue();
    
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

    // Get context if enabled
    let contextualContent = textToSend;
    let contextData: string | undefined;
    if (contextMonitoring.includeContextInMessage && contextMonitoring.contextData.clipboard) {
      contextData = contextMonitoring.contextData.clipboard;
      contextualContent = `Context: ${contextData}\n\nUser: ${textToSend}`;
      contextMonitoring.clearNewContextFlag();
    }

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

    try {
      // Check if tools are enabled - use tool-aware chat
      if (toolsEnabled) {
        // Use tool-aware chat flow
        await handleSendWithTools(contextualContent);
      } else {
        // Use regular streaming chat
        await handleSendRegular(contextualContent);
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
    }
  };

  // Regular streaming chat (no tools)
  const handleSendRegular = async (contextualContent: string) => {
    let lastSentenceIndex = 0;
    let accumulatedResponse = '';

    const response = await ollamaIntegration.sendMessageToOllama(
      activeChat?.messages || [],
      contextualContent,
      (update) => {
        let responseContent = '';

        if (update.type === 'thinking') {
          responseContent = `💭 **Thinking...**\n\n${update.thinking}${update.thinking.endsWith('.') || update.thinking.endsWith('!') || update.thinking.endsWith('?') ? '' : '▋'}`;
        } else if (update.type === 'response') {
          if (update.thinking) {
            responseContent = `💭 **Thought Process:**\n\n${update.thinking}\n\n---\n\n**Answer:**\n\n${update.response}${update.response.endsWith('.') || update.response.endsWith('!') || update.response.endsWith('?') ? '' : '▋'}`;
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
            responseContent = `💭 **Thought Process:**\n\n${update.thinking}\n\n---\n\n**Answer:**\n\n${update.response}`;
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
      }
    );

    if (response) {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      };
      addMessageToActiveChat(assistantMessage);
    }
  };

  // Tool-aware chat flow with MCP integration - supports both single-tool and agentic modes
  const handleSendWithTools = async (contextualContent: string) => {
    // Get available MCP tools from the hook
    const mcpTools = await getMcpToolsForLLM();
    
    console.log('🔧 Available MCP tools:', mcpTools);
    console.log('🤖 Agentic mode:', agenticMode);
    
    if (mcpTools.length === 0) {
      console.log('⚠️ No MCP tools available, falling back to regular chat');
      await handleSendRegular(contextualContent);
      return;
    }
    
    // Get saved tool prompt or use default - different prompts for agentic vs single-tool mode
    const savedToolPrompt = localStorage.getItem('ally-prompt-tools') || 
      (agenticMode 
        ? `You are an AI assistant with access to powerful tools. You MUST use tools to get real information.

CRITICAL RULES - FOLLOW EXACTLY:
1. NEVER guess or make up information - ALWAYS use a tool to get real data
2. For ANY question about time/date → use get_current_time IMMEDIATELY
3. For ANY question about files/directories → use list_directory or read_file IMMEDIATELY  
4. For ANY math calculation → use calculate IMMEDIATELY
5. You can chain MULTIPLE tools - use as many as needed to complete the task
6. After each tool result, decide: need more info? → use another tool. Task complete? → give final answer
7. NEVER say "I'll use a tool" or "Let me check" - just output the tool call JSON directly

TOOL CALL FORMAT (output this JSON exactly):
{"name": "tool_name", "parameters": {"param1": "value1"}}

EXAMPLES:
- User asks "what time is it?" → {"name": "get_current_time", "parameters": {}}
- User asks "list files" → {"name": "list_directory", "parameters": {"path": "."}}
- User asks "what's 15 * 23?" → {"name": "calculate", "parameters": {"expression": "15 * 23"}}

WHEN DONE: After you have ALL needed information from tools, write your final response naturally WITHOUT any JSON.`
        : `You are an AI assistant with tool access. When you need information you don't have, use a tool.

TO USE A TOOL, output ONLY this JSON (nothing else before or after):
{"name": "tool_name", "parameters": {}}

RULES:
- For questions about time, files, calculations - USE A TOOL, don't explain
- Output the JSON tool call IMMEDIATELY, no explanation needed
- After getting results, give a natural response incorporating the data`);

    // Build the full system prompt with available tools
    const toolsSystemPrompt = `${savedToolPrompt}

AVAILABLE TOOLS:
${mcpTools.map(t => {
  const params = t.parameters ? ` | params: ${JSON.stringify(t.parameters)}` : ' | no params needed';
  return `• ${t.name}${params}\n  → ${t.description}`;
}).join('\n')}

Remember: Output ONLY the JSON tool call when you need to use a tool. No explanations before it.`;

    if (agenticMode) {
      // Use agentic loop for multi-tool execution
      await handleAgenticChat(contextualContent, toolsSystemPrompt, mcpTools);
    } else {
      // Use single-tool mode (original behavior)
      await handleSingleToolChat(contextualContent, toolsSystemPrompt);
    }
  };

  // Agentic chat - allows multiple sequential tool calls
  const handleAgenticChat = async (
    contextualContent: string, 
    systemPrompt: string,
    _tools: Array<{ name: string; description: string; parameters?: any }>
  ) => {
    const MAX_ITERATIONS = 10;
    const MAX_TOOL_CALLS = 20;
    
    let iteration = 0;
    let totalToolCalls = 0;
    let conversationContext = '';
    const allToolExecutions: ToolExecution[] = [];
    const finalResponseParts: string[] = [];
    let currentThinking = '';
    
    // Initial message with system prompt
    let currentMessage = `[System: ${systemPrompt}]\n\nUser: ${contextualContent}`;
    
    while (iteration < MAX_ITERATIONS && totalToolCalls < MAX_TOOL_CALLS) {
      iteration++;
      console.log(`🔄 Agentic iteration ${iteration}`);
      
      let accumulatedResponse = '';
      let toolCallDetected = false;
      let detectedToolCall: { name: string; parameters: any } | null = null;
      let beforeToolText = '';
      
      // Stream response from LLM
      await ollamaIntegration.sendMessageToOllama(
        activeChat?.messages || [],
        currentMessage + (conversationContext ? `\n\n${conversationContext}` : ''),
        (update) => {
          if (update.type === 'response' || update.type === 'done') {
            accumulatedResponse = update.response || '';
            
            // Extract thinking
            const thinkingMatch = accumulatedResponse.match(/<think>([\s\S]*?)<\/think>/i);
            if (thinkingMatch) {
              currentThinking = thinkingMatch[1].trim();
              setStreamingThinking(currentThinking);
            }
            
            // Parse for tool call
            const parsed = parseToolCallFromResponse(accumulatedResponse);
            
            if (parsed.toolCall && !toolCallDetected) {
              toolCallDetected = true;
              detectedToolCall = parsed.toolCall;
              beforeToolText = parsed.beforeText;
              
              // Show text before tool call
              const displayParts = [...finalResponseParts];
              if (beforeToolText) displayParts.push(beforeToolText);
              displayParts.push(`🔧 *Calling ${parsed.toolCall.name}...*`);
              setCurrentResponse(displayParts.join('\n\n'));
            } else if (!toolCallDetected) {
              // No tool call yet, show streaming response
              const cleanedResponse = accumulatedResponse
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .trim();
              const displayParts = [...finalResponseParts, cleanedResponse];
              setCurrentResponse(displayParts.join('\n\n') + (update.type === 'done' ? '' : '▋'));
            }
          }
        }
      );
      
      // If no tool call detected, we're done
      if (!toolCallDetected || !detectedToolCall) {
        console.log('✅ No more tool calls, task complete');
        
        // Clean final response
        const cleanedFinal = accumulatedResponse
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .trim();
        
        if (cleanedFinal && !finalResponseParts.includes(cleanedFinal)) {
          finalResponseParts.push(cleanedFinal);
        }
        break;
      }
      
      // TypeScript needs this assertion after the null check
      const toolToExecute = detectedToolCall as { name: string; parameters: any };
      
      // Add text before tool call to response
      if (beforeToolText && !finalResponseParts.includes(beforeToolText)) {
        finalResponseParts.push(beforeToolText);
      }
      
      // Execute the tool
      totalToolCalls++;
      const toolExecution: ToolExecution = {
        id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: toolToExecute.name,
        status: 'executing',
        startTime: Date.now(),
      };
      
      allToolExecutions.push(toolExecution);
      setActiveToolExecutions([...allToolExecutions]);
      
      try {
        console.log(`🔧 Executing tool: ${toolToExecute.name}`, toolToExecute.parameters);
        const result = await executeMcpTool(toolToExecute.name, toolToExecute.parameters);
        
        toolExecution.status = 'success';
        toolExecution.result = result;
        toolExecution.endTime = Date.now();
        
        // Format result
        const resultText = formatToolResultForDisplay(toolToExecute.name, result);
        
        // Add tool result to response parts
        finalResponseParts.push(`🔧 **${toolToExecute.name}**\n\`\`\`\n${resultText}\n\`\`\``);
        
        // Update display
        setActiveToolExecutions([...allToolExecutions]);
        setCurrentResponse(finalResponseParts.join('\n\n') + '\n\n*Analyzing results...*');
        
        // Build context for next iteration
        conversationContext = `Tool "${toolToExecute.name}" returned:\n${resultText}\n\nBased on this result, continue with the task. If you need more information, use another tool. If the task is complete, provide your final response WITHOUT any tool call JSON.`;
        
        // Reset message for next iteration
        currentMessage = '';
        
      } catch (error) {
        console.error(`❌ Tool execution failed:`, error);
        toolExecution.status = 'error';
        toolExecution.error = error instanceof Error ? error.message : String(error);
        toolExecution.endTime = Date.now();
        
        setActiveToolExecutions([...allToolExecutions]);
        
        // Add error to response
        finalResponseParts.push(`❌ **${toolToExecute.name}** failed: ${toolExecution.error}`);
        
        // Let the AI know about the error
        conversationContext = `Tool "${toolToExecute.name}" failed with error: ${toolExecution.error}\n\nYou can try a different approach or explain the issue to the user.`;
        currentMessage = '';
      }
    }
    
    // Build final message content
    let finalContent = '';
    if (currentThinking) {
      finalContent = `<think>${currentThinking}</think>\n\n`;
    }
    finalContent += finalResponseParts.join('\n\n');
    
    // Clear streaming state
    setStreamingThinking(null);
    setActiveToolExecutions([]);
    
    if (finalContent.trim()) {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: finalContent.trim(),
        timestamp: Date.now()
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
    
    // Format 1: Raw JSON - {"name": "...", "parameters": ...}
    const rawJsonMatch = cleanedText.match(/\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"parameters"\s*:\s*("[^"]*"|\{[^}]*\}|\[\]|null|\{\})\s*\}/);
    if (rawJsonMatch) {
      const name = rawJsonMatch[1];
      let params = {};
      const paramsStr = rawJsonMatch[2];
      if (paramsStr && paramsStr !== '""' && paramsStr !== 'null') {
        try {
          params = JSON.parse(paramsStr);
        } catch {
          params = {};
        }
      }
      const idx = cleanedText.indexOf(rawJsonMatch[0]);
      return {
        toolCall: { name, parameters: params },
        beforeText: cleanedText.substring(0, idx).trim()
      };
    }
    
    // Format 2: JSON with tags
    const jsonTagMatch = cleanedText.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/);
    if (jsonTagMatch) {
      try {
        const parsed = JSON.parse(jsonTagMatch[1].trim());
        const idx = cleanedText.indexOf(jsonTagMatch[0]);
        return {
          toolCall: { name: parsed.name, parameters: parsed.parameters || {} },
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
        // For directory listings, format more compactly
        if (toolName === 'list_directory' || toolName.includes('directory')) {
          const lines = textContent.text.split('\n').filter((l: string) => l.trim());
          if (lines.length > 15) {
            return `${lines.slice(0, 12).join('\n')}\n... and ${lines.length - 12} more items`;
          }
        }
        return textContent.text;
      }
    }
    
    if (result.formatted) return result.formatted;
    if (result.result !== undefined) return String(result.result);
    if (typeof result === 'string') return result;
    
    // Truncate long JSON
    const jsonStr = JSON.stringify(result, null, 2);
    if (jsonStr.length > 800) {
      return jsonStr.substring(0, 800) + '\n... (truncated)';
    }
    return jsonStr;
  };

  // Single-tool chat mode (original behavior)
  const handleSingleToolChat = async (contextualContent: string, systemPrompt: string) => {
    const messageWithTools = `[System: ${systemPrompt}]\n\nUser: ${contextualContent}`;

    let accumulatedResponse = '';
    let finalResponseWithToolResults = '';
    let pendingToolCall: { name: string; parameters: any } | null = null;
    let toolExecuted = false;
    let currentThinking = '';
    let thinkingComplete = false;
    let toolExecutionPromise: Promise<void> | null = null;

    await ollamaIntegration.sendMessageToOllama(
      activeChat?.messages || [],
      messageWithTools,
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
      }
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
        { name: 'get_current_time', description: 'Get the current date and time', parameters: {} },
        { name: 'calculate', description: 'Perform a mathematical calculation', parameters: { expression: 'string (e.g., "2 + 2", "sqrt(16)")' } }
      );
      
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
    
    // Normalize parameters - handle empty string, null, undefined
    let normalizedParams = parameters;
    if (!parameters || parameters === '' || (typeof parameters === 'object' && Object.keys(parameters).length === 0)) {
      normalizedParams = {};
    }
    
    // Add default parameters for known tools that require them
    if (toolName === 'list_directory' && !normalizedParams.path) {
      normalizedParams = { path: '.' }; // Default to current directory
    }
    if (toolName === 'read_file' && !normalizedParams.path) {
      return { error: 'read_file requires a path parameter' };
    }
    
    // Handle built-in tools first
    if (toolName === 'get_current_time') {
      return {
        time: new Date().toISOString(),
        formatted: new Date().toLocaleString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    }
    
    if (toolName === 'calculate') {
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
    
    // Try MCP tool execution via the integration hook
    try {
      // Check if this tool exists in our MCP tools
      const mcpTool = mcpIntegration.mcpTools.find(t => t.name === toolName);
      
      console.log('🔍 Looking for tool:', toolName, 'in MCP tools:', mcpIntegration.mcpTools.map(t => t.name));
      
      if (mcpTool) {
        console.log('🔧 Executing MCP tool via integration:', toolName, 'with normalized params:', normalizedParams);
        return await mcpIntegration.executeMCPTool(toolName, normalizedParams);
      }
      
      // Try executing via mcpIntegration even if not in the cached list
      // (the tool might exist on the server but not be cached yet)
      try {
        console.log('🔧 Trying MCP tool execution (not in cache):', toolName);
        const result = await mcpIntegration.executeMCPTool(toolName, normalizedParams);
        return result;
      } catch (mcpError) {
        console.log('MCP integration failed, trying fallback:', mcpError);
      }
      
      // Last resort fallback to window.pip.mcp API (this is the mock)
      if (window.pip?.mcp?.executeTool) {
        console.log('⚠️ Falling back to mock executeTool for:', toolName);
        return await window.pip.mcp.executeTool(toolName, normalizedParams);
      }
      
      throw new Error(`Tool ${toolName} not found`);
    } catch (error) {
      console.error(`Failed to execute tool ${toolName}:`, error);
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
    const loadChats = () => {
      const allChats = chatManager.getAllChats();
      setChats(allChats);
      setActiveChat(chatManager.getActiveChat());
    };
    loadChats();
  }, [chatManager]);

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
    if (!window.pip) {
      console.warn('window.pip not available');
      return;
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
        platform === 'win32' && "win32-acrylic",
        platform === 'linux' && "linux-glass-effect"
      )}
      style={{
        width: calculateDimensions().width + (padding * 2),
        height: calculateDimensions().height + (padding * 2),
        zIndex: 50
      } as React.CSSProperties}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: isResizing ? 1.02 : 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
    >
      <motion.div
        layout
        className={cn(
          "overflow-hidden relative flex transition-all duration-300 chat-container acrylic-container",
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
          width: calculateDimensions().width,
          height: calculateDimensions().height,
          margin: `${padding}px`
        } as React.CSSProperties}
      >
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
                isSpeaking={false} // TODO: Track TTS state
                isListening={speechService.isListening}
                placeholder={currentGreeting}
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
                toolsEnabled={toolsEnabled}
                onToolsToggle={() => setToolsEnabled(!toolsEnabled)}
                mcpServerCount={mcpServerCount}
                agenticMode={agenticMode}
                onAgenticModeToggle={() => setAgenticMode(!agenticMode)}
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
                  appSettings.ui.messageSpacing === 'compact' ? 'space-y-2' :
                    appSettings.ui.messageSpacing === 'normal' ? 'space-y-3' : 'space-y-4',
                  platform === 'win32'
                    ? "scrollbar-thin scrollbar-thumb-white/10"
                    : theme === 'dark' ? "scrollbar-thin scrollbar-thumb-white/10" : "scrollbar-thin scrollbar-thumb-black/10"
                )}>
                  {/* Remote Activity Indicator */}
                  <RemoteActivityIndicator className="mb-2" />
                  
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
                      {/* Inline tool executions and thinking pill - shown during streaming */}
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
                  placeholder={currentGreeting}
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

      {/* Remote Settings - Floating */}
      <div className={cn(
        "fixed z-40",
        state.collapsed
          ? "top-4 -right-32" // Position to the right of the control buttons when collapsed
          : "top-16 right-4"   // Position below the header buttons when expanded
      )}>
        <RemoteSettings />
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

    </motion.div>
  );
}