/**
 * Tool-Aware Conversation Hook
 * Requirements: 15.1, 3.3
 * 
 * React hook for managing tool-aware conversations
 * Integrates tool execution history with conversation flow
 * Provides multi-turn conversation support with tool context
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Message } from '../types/chat';
import { ToolCall, ToolCallResult } from '../services/toolCallingService';
import {
  ToolAwareConversationManager,
  ConversationContext,
  ConversationTurn,
  ToolExecutionEntry,
  ToolAwareMessage
} from '../utils/toolAwareConversationManager';

export interface ToolAwareConversationState {
  currentConversation: ConversationContext | null;
  currentTurn: ConversationTurn | null;
  isProcessingTurn: boolean;
  toolExecutionHistory: ToolExecutionEntry[];
  conversationMemory: Record<string, any>;
  activeToolCalls: ToolCall[];
}

export interface ConversationHookConfig {
  maxHistoryLength: number;
  maxToolExecutionsPerTurn: number;
  enableToolContextPersistence: boolean;
  enableConversationMemory: boolean;
  autoStartTurns: boolean;
  userId?: string;
  sessionId?: string;
}

export function useToolAwareConversation(
  chatId: string,
  config: Partial<ConversationHookConfig> = {}
) {
  // Configuration
  const [conversationConfig] = useState<ConversationHookConfig>({
    maxHistoryLength: 100,
    maxToolExecutionsPerTurn: 10,
    enableToolContextPersistence: true,
    enableConversationMemory: true,
    autoStartTurns: true,
    sessionId: `session_${Date.now()}`,
    userId: 'user',
    ...config
  });

  // Conversation manager instance
  const [conversationManager] = useState(() => 
    new ToolAwareConversationManager({
      maxHistoryLength: conversationConfig.maxHistoryLength,
      maxToolExecutionsPerTurn: conversationConfig.maxToolExecutionsPerTurn,
      enableToolContextPersistence: conversationConfig.enableToolContextPersistence,
      enableConversationMemory: conversationConfig.enableConversationMemory
    })
  );

  // State
  const [state, setState] = useState<ToolAwareConversationState>({
    currentConversation: null,
    currentTurn: null,
    isProcessingTurn: false,
    toolExecutionHistory: [],
    conversationMemory: {},
    activeToolCalls: []
  });

  // Refs for stable references
  const conversationIdRef = useRef<string>(chatId);
  const currentTurnRef = useRef<ConversationTurn | null>(null);

  /**
   * Initialize conversation when chatId changes
   */
  useEffect(() => {
    if (chatId !== conversationIdRef.current) {
      conversationIdRef.current = chatId;
      initializeConversation(chatId);
    }
  }, [chatId]);

  /**
   * Initialize a new conversation
   */
  const initializeConversation = useCallback((conversationId: string) => {
    const context = conversationManager.initializeConversation(
      conversationId,
      conversationConfig.sessionId!,
      conversationConfig.userId
    );

    setState(prev => ({
      ...prev,
      currentConversation: context,
      currentTurn: null,
      toolExecutionHistory: context.toolExecutionHistory,
      conversationMemory: context.conversationMemory.shortTerm
    }));
  }, [conversationManager, conversationConfig]);

  /**
   * Start a new conversation turn
   */
  const startConversationTurn = useCallback((userMessage: Message): ConversationTurn => {
    if (!state.currentConversation) {
      throw new Error('No active conversation');
    }

    const turn = conversationManager.startConversationTurn(
      state.currentConversation.conversationId,
      userMessage
    );

    currentTurnRef.current = turn;

    setState(prev => ({
      ...prev,
      currentTurn: turn,
      isProcessingTurn: true
    }));

    return turn;
  }, [conversationManager, state.currentConversation]);

  /**
   * Complete the current conversation turn
   */
  const completeConversationTurn = useCallback((
    assistantMessage: Message,
    toolExecutions: ToolExecutionEntry[] = []
  ): void => {
    if (!state.currentConversation || !state.currentTurn) {
      return;
    }

    conversationManager.completeConversationTurn(
      state.currentConversation.conversationId,
      state.currentTurn.turnId,
      assistantMessage,
      toolExecutions
    );

    // Update state with completed turn
    const updatedContext = conversationManager.getConversationContext(
      state.currentConversation.conversationId
    );

    setState(prev => ({
      ...prev,
      currentTurn: null,
      isProcessingTurn: false,
      toolExecutionHistory: updatedContext?.toolExecutionHistory || [],
      conversationMemory: updatedContext?.conversationMemory.shortTerm || {}
    }));

    currentTurnRef.current = null;
  }, [conversationManager, state.currentConversation, state.currentTurn]);

  /**
   * Add tool execution to current turn
   */
  const addToolExecution = useCallback((
    toolCall: ToolCall,
    result: ToolCallResult,
    messageId: string
  ): ToolExecutionEntry | null => {
    if (!state.currentConversation || !state.currentTurn) {
      return null;
    }

    const execution = conversationManager.addToolExecution(
      state.currentConversation.conversationId,
      state.currentTurn.turnId,
      toolCall,
      result,
      messageId
    );

    // Update state with new execution
    const updatedContext = conversationManager.getConversationContext(
      state.currentConversation.conversationId
    );

    setState(prev => ({
      ...prev,
      toolExecutionHistory: updatedContext?.toolExecutionHistory || [],
      conversationMemory: updatedContext?.conversationMemory.shortTerm || {}
    }));

    return execution;
  }, [conversationManager, state.currentConversation, state.currentTurn]);

  /**
   * Register active tool call
   */
  const registerActiveToolCall = useCallback((toolCall: ToolCall): void => {
    if (!state.currentConversation) return;

    conversationManager.registerActiveToolCall(
      state.currentConversation.conversationId,
      toolCall
    );

    setState(prev => ({
      ...prev,
      activeToolCalls: [...prev.activeToolCalls, toolCall]
    }));
  }, [conversationManager, state.currentConversation]);

  /**
   * Remove active tool call
   */
  const removeActiveToolCall = useCallback((toolCallId: string): void => {
    setState(prev => ({
      ...prev,
      activeToolCalls: prev.activeToolCalls.filter(call => call.id !== toolCallId)
    }));
  }, []);

  /**
   * Get tool-aware messages for LLM context
   */
  const getToolAwareMessages = useCallback((
    includeToolContext: boolean = true
  ): ToolAwareMessage[] => {
    if (!state.currentConversation) return [];

    return conversationManager.getToolAwareMessages(
      state.currentConversation.conversationId,
      includeToolContext
    );
  }, [conversationManager, state.currentConversation]);

  /**
   * Get recent tool context
   */
  const getRecentToolContext = useCallback((maxExecutions: number = 5) => {
    if (!state.currentConversation) {
      return { recentExecutions: [], successfulTools: [], failedTools: [], toolResults: {} };
    }

    return conversationManager.getRecentToolContext(
      state.currentConversation.conversationId,
      maxExecutions
    );
  }, [conversationManager, state.currentConversation]);

  /**
   * Update conversation memory
   */
  const updateConversationMemory = useCallback((
    key: string,
    value: any,
    persistent: boolean = false
  ): void => {
    if (!state.currentConversation) return;

    conversationManager.updateConversationMemory(
      state.currentConversation.conversationId,
      key,
      value,
      persistent
    );

    // Update local state
    const updatedContext = conversationManager.getConversationContext(
      state.currentConversation.conversationId
    );

    setState(prev => ({
      ...prev,
      conversationMemory: updatedContext?.conversationMemory.shortTerm || {}
    }));
  }, [conversationManager, state.currentConversation]);

  /**
   * Get conversation memory value
   */
  const getConversationMemory = useCallback((
    key: string,
    checkLongTerm: boolean = true
  ): any => {
    if (!state.currentConversation) return undefined;

    return conversationManager.getConversationMemory(
      state.currentConversation.conversationId,
      key,
      checkLongTerm
    );
  }, [conversationManager, state.currentConversation]);

  /**
   * Process message with tool awareness
   */
  const processMessageWithTools = useCallback(async (
    userMessage: Message,
    onToolExecution?: (toolCall: ToolCall, result: ToolCallResult) => void,
    onTurnComplete?: (turn: ConversationTurn) => void
  ): Promise<ConversationTurn> => {
    // Start new turn if auto-start is enabled
    let turn = state.currentTurn;
    if (!turn && conversationConfig.autoStartTurns) {
      turn = startConversationTurn(userMessage);
    }

    if (!turn) {
      throw new Error('No active conversation turn');
    }

    // Register tool execution callback
    if (onToolExecution) {
      // This would be called when tools are executed
      // Implementation depends on integration with tool calling service
      // For now, we'll store the callback for later use
    }

    // Call turn complete callback if provided
    if (onTurnComplete) {
      onTurnComplete(turn);
    }

    return turn;
  }, [state.currentTurn, conversationConfig.autoStartTurns, startConversationTurn]);

  /**
   * Get conversation statistics
   */
  const getConversationStats = useCallback(() => {
    if (!state.currentConversation) {
      return {
        totalTurns: 0,
        completedTurns: 0,
        totalToolExecutions: 0,
        successfulToolExecutions: 0,
        failedToolExecutions: 0,
        averageToolExecutionTime: 0,
        mostUsedTools: []
      };
    }

    return conversationManager.getConversationStats(
      state.currentConversation.conversationId
    );
  }, [conversationManager, state.currentConversation]);

  /**
   * Export conversation for persistence
   */
  const exportConversation = useCallback(() => {
    if (!state.currentConversation) return null;

    return conversationManager.exportConversation(
      state.currentConversation.conversationId
    );
  }, [conversationManager, state.currentConversation]);

  /**
   * Import conversation from persistence
   */
  const importConversation = useCallback((data: any): boolean => {
    const success = conversationManager.importConversation(data);
    
    if (success) {
      const context = conversationManager.getConversationContext(data.conversationId);
      if (context) {
        setState(prev => ({
          ...prev,
          currentConversation: context,
          toolExecutionHistory: context.toolExecutionHistory,
          conversationMemory: context.conversationMemory.shortTerm
        }));
      }
    }

    return success;
  }, [conversationManager]);

  /**
   * Clear current conversation
   */
  const clearConversation = useCallback(() => {
    if (state.currentConversation) {
      conversationManager.clearConversation(state.currentConversation.conversationId);
    }

    setState(prev => ({
      ...prev,
      currentConversation: null,
      currentTurn: null,
      isProcessingTurn: false,
      toolExecutionHistory: [],
      conversationMemory: {},
      activeToolCalls: []
    }));
  }, [conversationManager, state.currentConversation]);

  /**
   * Reset conversation (clear and reinitialize)
   */
  const resetConversation = useCallback(() => {
    clearConversation();
    initializeConversation(conversationIdRef.current);
  }, [clearConversation, initializeConversation]);

  /**
   * Get current turn information
   */
  const getCurrentTurnInfo = useCallback(() => {
    if (!state.currentTurn) return null;

    return {
      turnId: state.currentTurn.turnId,
      startTime: state.currentTurn.startTime,
      status: state.currentTurn.status,
      toolExecutions: state.currentTurn.toolExecutions,
      isActive: state.isProcessingTurn
    };
  }, [state.currentTurn, state.isProcessingTurn]);

  /**
   * Check if conversation has tool context
   */
  const hasToolContext = useCallback(() => {
    return state.toolExecutionHistory.length > 0 || 
           Object.keys(state.conversationMemory).length > 0;
  }, [state.toolExecutionHistory, state.conversationMemory]);

  return {
    // State
    state,
    config: conversationConfig,
    
    // Conversation management
    initializeConversation,
    clearConversation,
    resetConversation,
    
    // Turn management
    startConversationTurn,
    completeConversationTurn,
    getCurrentTurnInfo,
    
    // Tool execution
    addToolExecution,
    registerActiveToolCall,
    removeActiveToolCall,
    
    // Context and memory
    getToolAwareMessages,
    getRecentToolContext,
    updateConversationMemory,
    getConversationMemory,
    
    // Processing
    processMessageWithTools,
    
    // Statistics and utilities
    getConversationStats,
    exportConversation,
    importConversation,
    hasToolContext,
    
    // Manager instance (for advanced usage)
    conversationManager
  };
}