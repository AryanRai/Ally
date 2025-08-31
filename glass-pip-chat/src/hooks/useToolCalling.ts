/**
 * Tool Calling Hook for Ally LLM Integration
 * Requirements: 10.1, 10.2, 15.1, 3.3
 * 
 * React hook for managing tool calling capabilities in conversation flow
 * Handles tool call parsing, execution, and result integration
 * Provides conversation context management with tool execution history
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ToolCallingService, ToolCall, ToolCallResult, ConversationContext, ToolAwareMessage } from '../services/toolCallingService';
import { OllamaService } from '../services/ollamaService';
import { ToolManager } from '../../../tool-calling-framework/src/manager/ToolManager';
import { ToolRegistry } from '../../../tool-calling-framework/src/registry/ToolRegistry';
import { ToolExecutor } from '../../../tool-calling-framework/src/executor/ToolExecutor';
import { Message } from '../types/chat';

export interface ToolCallingState {
  isEnabled: boolean;
  isExecutingTools: boolean;
  currentToolCalls: ToolCall[];
  currentToolResults: ToolCallResult[];
  executionHistory: ToolCallResult[];
  availableTools: string[];
  conversationContext: ConversationContext | null;
}

export interface ToolCallingHookConfig {
  enableToolCalling: boolean;
  maxToolCalls: number;
  toolCallTimeout: number;
  enableMultiStepReasoning: boolean;
  sessionId?: string;
  userId?: string;
}

export interface ToolExecutionProgress {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'done';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolCallResult[];
  isComplete: boolean;
}

export function useToolCalling(
  ollamaService: OllamaService,
  config: Partial<ToolCallingHookConfig> = {}
) {
  // State management
  const [state, setState] = useState<ToolCallingState>({
    isEnabled: config.enableToolCalling ?? true,
    isExecutingTools: false,
    currentToolCalls: [],
    currentToolResults: [],
    executionHistory: [],
    availableTools: [],
    conversationContext: null
  });

  // Service instances
  const [toolCallingService, setToolCallingService] = useState<ToolCallingService | null>(null);
  const [toolManager, setToolManager] = useState<ToolManager | null>(null);
  const [toolRegistry, setToolRegistry] = useState<ToolRegistry | null>(null);
  const [toolExecutor, setToolExecutor] = useState<ToolExecutor | null>(null);

  // Configuration
  const [toolConfig, setToolConfig] = useState<ToolCallingHookConfig>({
    enableToolCalling: true,
    maxToolCalls: 5,
    toolCallTimeout: 30000,
    enableMultiStepReasoning: true,
    sessionId: `session_${Date.now()}`,
    userId: 'user',
    ...config
  });

  // Refs for stable references
  const conversationIdRef = useRef<string>(`conv_${Date.now()}`);
  const executionHistoryRef = useRef<ToolCallResult[]>([]);

  /**
   * Initialize tool calling services
   */
  useEffect(() => {
    const initializeServices = async () => {
      try {
        // Initialize tool framework components
        const registry = new ToolRegistry();
        const executor = new ToolExecutor(registry);
        const manager = new ToolManager(registry, executor);

        // Initialize tool calling service
        const service = new ToolCallingService(
          ollamaService,
          manager,
          registry,
          executor,
          {
            enableToolCalling: toolConfig.enableToolCalling,
            maxToolCalls: toolConfig.maxToolCalls,
            toolCallTimeout: toolConfig.toolCallTimeout,
            enableMultiStepReasoning: toolConfig.enableMultiStepReasoning
          }
        );

        // Set service instances
        setToolRegistry(registry);
        setToolExecutor(executor);
        setToolManager(manager);
        setToolCallingService(service);

        // Initialize conversation context
        const context: ConversationContext = {
          userId: toolConfig.userId,
          sessionId: toolConfig.sessionId!,
          conversationId: conversationIdRef.current,
          toolExecutionHistory: [],
          availableTools: [], // Will be populated when tools are registered
          environment: {
            platform: navigator.userAgentData?.platform || navigator.platform,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        };

        setState(prev => ({
          ...prev,
          conversationContext: context,
          availableTools: registry.getAllTools().map((tool: any) => tool.name)
        }));

        console.log('Tool calling services initialized successfully');
      } catch (error) {
        console.error('Failed to initialize tool calling services:', error);
      }
    };

    if (ollamaService && state.isEnabled) {
      initializeServices();
    }
  }, [ollamaService, state.isEnabled, toolConfig]);

  /**
   * Send message with tool calling capabilities
   */
  const sendMessageWithTools = useCallback(async (
    messages: Message[],
    newMessage: string,
    onProgress?: (progress: ToolExecutionProgress) => void
  ): Promise<{
    response: string;
    toolCalls: ToolCall[];
    toolResults: ToolCallResult[];
  }> => {
    if (!toolCallingService || !state.conversationContext) {
      throw new Error('Tool calling service not initialized');
    }

    setState(prev => ({ ...prev, isExecutingTools: true, currentToolCalls: [], currentToolResults: [] }));

    try {
      // Convert messages to tool-aware format
      const toolAwareMessages: ToolAwareMessage[] = [
        ...messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        })),
        {
          role: 'user' as const,
          content: newMessage
        }
      ];

      // Update conversation context with latest execution history
      const updatedContext: ConversationContext = {
        ...state.conversationContext,
        toolExecutionHistory: executionHistoryRef.current
      };

      // Execute chat with tools
      const result = await toolCallingService.chatWithTools(
        toolAwareMessages,
        updatedContext,
        undefined, // Use default model
        (chunk, toolCalls, toolResults) => {
          // Update current state
          setState(prev => ({
            ...prev,
            currentToolCalls: toolCalls || [],
            currentToolResults: toolResults || []
          }));

          // Determine progress type
          let progressType: ToolExecutionProgress['type'] = 'response';
          if (toolCalls && toolCalls.length > 0 && (!toolResults || toolResults.length === 0)) {
            progressType = 'tool_call';
          } else if (toolResults && toolResults.length > 0) {
            progressType = 'tool_result';
          }

          // Call progress callback
          onProgress?.({
            type: progressType,
            content: chunk,
            toolCalls,
            toolResults,
            isComplete: false
          });
        }
      );

      // Update execution history
      executionHistoryRef.current = [...executionHistoryRef.current, ...result.toolResults];

      // Update state with final results
      setState(prev => ({
        ...prev,
        isExecutingTools: false,
        currentToolCalls: result.toolCalls,
        currentToolResults: result.toolResults,
        executionHistory: executionHistoryRef.current
      }));

      // Final progress update
      onProgress?.({
        type: 'done',
        content: result.response,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        isComplete: true
      });

      return result;

    } catch (error) {
      setState(prev => ({ ...prev, isExecutingTools: false }));
      console.error('Tool calling execution failed:', error);
      throw error;
    }
  }, [toolCallingService, state.conversationContext]);

  /**
   * Execute a single tool call manually
   */
  const executeToolCall = useCallback(async (
    toolName: string,
    parameters: Record<string, any>
  ): Promise<ToolCallResult> => {
    if (!toolCallingService || !state.conversationContext) {
      throw new Error('Tool calling service not initialized');
    }

    const toolCall: ToolCall = {
      id: `manual_${Date.now()}`,
      name: toolName,
      parameters
    };

    setState(prev => ({ ...prev, isExecutingTools: true }));

    try {
      // This would use the internal executeToolCalls method
      // For now, we'll simulate the execution
      const startTime = Date.now();
      
      // Create a mock result - in real implementation, this would call the actual tool
      const result: ToolCallResult = {
        id: toolCall.id,
        name: toolCall.name,
        result: `Mock result for ${toolName}`,
        executionTime: Date.now() - startTime
      };

      // Update execution history
      executionHistoryRef.current = [...executionHistoryRef.current, result];

      setState(prev => ({
        ...prev,
        isExecutingTools: false,
        executionHistory: executionHistoryRef.current
      }));

      return result;

    } catch (error) {
      setState(prev => ({ ...prev, isExecutingTools: false }));
      throw error;
    }
  }, [toolCallingService, state.conversationContext]);

  /**
   * Get available tools
   */
  const getAvailableTools = useCallback(() => {
    if (!toolRegistry) return [];
    return toolRegistry.getAllTools();
  }, [toolRegistry]);

  /**
   * Register a new tool
   */
  const registerTool = useCallback(async (
    toolDefinition: any,
    handler: any
  ): Promise<boolean> => {
    if (!toolRegistry) return false;

    try {
      await toolRegistry.registerTool(toolDefinition, handler);
      
      // Update available tools list
      setState(prev => ({
        ...prev,
        availableTools: toolRegistry.getAllTools().map((tool: any) => tool.name)
      }));

      return true;
    } catch (error) {
      console.error('Failed to register tool:', error);
      return false;
    }
  }, [toolRegistry]);

  /**
   * Enable or disable tool calling
   */
  const setToolCallingEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, isEnabled: enabled }));
    setToolConfig(prev => ({ ...prev, enableToolCalling: enabled }));
  }, []);

  /**
   * Update tool calling configuration
   */
  const updateToolConfig = useCallback((newConfig: Partial<ToolCallingHookConfig>) => {
    setToolConfig(prev => ({ ...prev, ...newConfig }));
    
    if (toolCallingService) {
      toolCallingService.updateConfig({
        enableToolCalling: newConfig.enableToolCalling,
        maxToolCalls: newConfig.maxToolCalls,
        toolCallTimeout: newConfig.toolCallTimeout,
        enableMultiStepReasoning: newConfig.enableMultiStepReasoning
      });
    }
  }, [toolCallingService]);

  /**
   * Clear execution history
   */
  const clearExecutionHistory = useCallback(() => {
    executionHistoryRef.current = [];
    setState(prev => ({ ...prev, executionHistory: [] }));
  }, []);

  /**
   * Get tool execution statistics
   */
  const getExecutionStats = useCallback(() => {
    if (!toolCallingService) {
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        mostUsedTools: []
      };
    }

    return toolCallingService.getToolExecutionStats();
  }, [toolCallingService]);

  /**
   * Start a new conversation (reset context)
   */
  const startNewConversation = useCallback(() => {
    conversationIdRef.current = `conv_${Date.now()}`;
    executionHistoryRef.current = [];
    
    if (state.conversationContext) {
      const newContext: ConversationContext = {
        ...state.conversationContext,
        conversationId: conversationIdRef.current,
        toolExecutionHistory: []
      };

      setState(prev => ({
        ...prev,
        conversationContext: newContext,
        executionHistory: [],
        currentToolCalls: [],
        currentToolResults: []
      }));
    }
  }, [state.conversationContext]);

  return {
    // State
    state,
    config: toolConfig,
    
    // Core functionality
    sendMessageWithTools,
    executeToolCall,
    
    // Tool management
    getAvailableTools,
    registerTool,
    
    // Configuration
    setToolCallingEnabled,
    updateToolConfig,
    
    // Utilities
    clearExecutionHistory,
    getExecutionStats,
    startNewConversation,
    
    // Service instances (for advanced usage)
    toolCallingService,
    toolManager,
    toolRegistry,
    toolExecutor
  };
}