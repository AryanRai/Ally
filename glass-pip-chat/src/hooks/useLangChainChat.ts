/**
 * LangChain Chat Hook
 * 
 * Enhanced chat hook that uses LangChain for improved tool calling
 * and multi-step reasoning capabilities.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { LangChainService, LangChainResponse, StreamingCallback, ToolExecutionStep } from '../services/langchainService';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolSteps?: ToolExecutionStep[];
  executionTime?: number;
  tokensUsed?: number;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  currentResponse: string;
  currentSteps: ToolExecutionStep[];
  error: string | null;
  availableTools: Array<{ name: string; description: string }>;
  memoryEnabled: boolean;
}

export interface UseLangChainChatOptions {
  sessionId?: string;
  userId?: string;
  enableMemory?: boolean;
  enableStreaming?: boolean;
  model?: string;
  temperature?: number;
  maxIterations?: number;
  onToolExecution?: (step: ToolExecutionStep) => void;
  onError?: (error: Error) => void;
}

export interface UseLangChainChatReturn {
  // State
  state: ChatState;
  
  // Actions
  sendMessage: (message: string) => Promise<void>;
  clearChat: () => void;
  clearMemory: () => Promise<void>;
  stopGeneration: () => void;
  reloadTools: () => Promise<void>;
  
  // Configuration
  updateConfig: (config: Partial<UseLangChainChatOptions>) => void;
  testTools: () => Promise<{ working: string[]; failed: string[] }>;
  
  // Utilities
  exportChat: () => string;
  importChat: (data: string) => void;
}

export function useLangChainChat(options: UseLangChainChatOptions = {}): UseLangChainChatReturn {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    isStreaming: false,
    currentResponse: '',
    currentSteps: [],
    error: null,
    availableTools: [],
    memoryEnabled: options.enableMemory ?? true
  });

  const langchainService = useRef<LangChainService | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const currentMessageId = useRef<string | null>(null);

  // Initialize LangChain service
  useEffect(() => {
    langchainService.current = new LangChainService({
      model: options.model || 'llama3.2:3b',
      temperature: options.temperature || 0.7,
      enableMemory: options.enableMemory ?? true,
      enableStreaming: options.enableStreaming ?? true,
      maxIterations: options.maxIterations || 10
    });

    // Load available tools
    loadAvailableTools();
  }, []);

  const loadAvailableTools = useCallback(async () => {
    if (!langchainService.current) return;

    try {
      const tools = langchainService.current.getAvailableTools();
      setState(prev => ({ ...prev, availableTools: tools }));
    } catch (error) {
      console.warn('Failed to load available tools:', error);
    }
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    if (!langchainService.current || state.isLoading) return;

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    currentMessageId.current = messageId;

    // Add user message
    const userMessage: ChatMessage = {
      id: `user_${messageId}`,
      role: 'user',
      content: message,
      timestamp: Date.now()
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
      isStreaming: true,
      currentResponse: '',
      currentSteps: [],
      error: null
    }));

    // Create abort controller for this request
    abortController.current = new AbortController();

    try {
      const streamingCallbacks: StreamingCallback = {
        onToken: (token: string) => {
          setState(prev => ({
            ...prev,
            currentResponse: prev.currentResponse + token
          }));
        },

        onStep: (step: ToolExecutionStep) => {
          setState(prev => ({
            ...prev,
            currentSteps: [...prev.currentSteps, step]
          }));
          
          options.onToolExecution?.(step);
        },

        onThought: (thought: string) => {
          // Could show thinking process in UI
          console.log('Agent thought:', thought);
        },

        onToolStart: (tool: string, input: any) => {
          console.log(`Tool ${tool} started with input:`, input);
        },

        onToolEnd: (tool: string, output: any) => {
          console.log(`Tool ${tool} completed with output:`, output);
        },

        onError: (error: Error) => {
          setState(prev => ({
            ...prev,
            error: error.message,
            isLoading: false,
            isStreaming: false
          }));
          
          options.onError?.(error);
        }
      };

      // Get response from LangChain service
      const response: LangChainResponse = await langchainService.current.chat(
        message,
        {
          sessionId: options.sessionId,
          userId: options.userId
        },
        streamingCallbacks
      );

      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: `assistant_${messageId}`,
        role: 'assistant',
        content: response.response,
        timestamp: Date.now(),
        toolSteps: response.steps,
        executionTime: response.executionTime,
        tokensUsed: response.tokensUsed
      };

      setState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        isLoading: false,
        isStreaming: false,
        currentResponse: '',
        currentSteps: []
      }));

    } catch (error) {
      console.error('Chat error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
        isStreaming: false,
        currentResponse: '',
        currentSteps: []
      }));

      options.onError?.(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      currentMessageId.current = null;
      abortController.current = null;
    }
  }, [state.isLoading, options]);

  const clearChat = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [],
      currentResponse: '',
      currentSteps: [],
      error: null
    }));
  }, []);

  const clearMemory = useCallback(async () => {
    if (!langchainService.current) return;

    try {
      await langchainService.current.clearMemory();
      setState(prev => ({ ...prev, error: null }));
    } catch (error) {
      console.error('Failed to clear memory:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to clear memory'
      }));
    }
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
    }

    setState(prev => ({
      ...prev,
      isLoading: false,
      isStreaming: false,
      currentResponse: '',
      currentSteps: []
    }));
  }, []);

  const reloadTools = useCallback(async () => {
    if (!langchainService.current) return;

    try {
      await langchainService.current.reloadTools();
      await loadAvailableTools();
      setState(prev => ({ ...prev, error: null }));
    } catch (error) {
      console.error('Failed to reload tools:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to reload tools'
      }));
    }
  }, [loadAvailableTools]);

  const updateConfig = useCallback((config: Partial<UseLangChainChatOptions>) => {
    if (!langchainService.current) return;

    langchainService.current.updateConfig({
      model: config.model,
      temperature: config.temperature,
      enableMemory: config.enableMemory,
      enableStreaming: config.enableStreaming,
      maxIterations: config.maxIterations
    });

    setState(prev => ({
      ...prev,
      memoryEnabled: config.enableMemory ?? prev.memoryEnabled
    }));
  }, []);

  const testTools = useCallback(async () => {
    if (!langchainService.current) {
      return { working: [], failed: [] };
    }

    try {
      return await langchainService.current.testTools();
    } catch (error) {
      console.error('Failed to test tools:', error);
      return { working: [], failed: [] };
    }
  }, []);

  const exportChat = useCallback(() => {
    const exportData = {
      messages: state.messages,
      timestamp: Date.now(),
      version: '1.0'
    };
    return JSON.stringify(exportData, null, 2);
  }, [state.messages]);

  const importChat = useCallback((data: string) => {
    try {
      const importData = JSON.parse(data);
      if (importData.messages && Array.isArray(importData.messages)) {
        setState(prev => ({
          ...prev,
          messages: importData.messages,
          error: null
        }));
      }
    } catch (error) {
      console.error('Failed to import chat:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to import chat data'
      }));
    }
  }, []);

  return {
    state,
    sendMessage,
    clearChat,
    clearMemory,
    stopGeneration,
    reloadTools,
    updateConfig,
    testTools,
    exportChat,
    importChat
  };
}