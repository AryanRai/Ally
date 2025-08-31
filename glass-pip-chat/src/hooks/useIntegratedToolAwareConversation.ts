/**
 * Integrated Tool-Aware Conversation Hook
 * Requirements: 15.1, 3.3
 * 
 * Unified React hook that integrates tool calling with conversation management
 * Provides complete tool-aware conversation processing
 * Handles multi-turn conversations with tool execution context
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Message } from '../types/chat';
import { OllamaService } from '../services/ollamaService';
import { ToolCallingService } from '../services/toolCallingService';
import { ToolAwareConversationManager } from '../utils/toolAwareConversationManager';
import { 
  ToolAwareIntegrationService, 
  IntegratedConversationContext,
  ToolAwareProcessingResult,
  ToolAwareProcessingProgress 
} from '../services/toolAwareIntegrationService';
import { ToolManager, ToolRegistry, ToolExecutor } from '../../tool-calling-framework/src/index';

export interface IntegratedConversationState {
  isInitialized: boolean;
  isProcessing: boolean;
  currentContext: IntegratedConversationContext | null;
  lastProcessingResult: ToolAwareProcessingResult | null;
  processingProgress: ToolAwareProcessingProgress | null;
  availableTools: string[];
  conversationStats: any;
}

export interface IntegratedConversationConfig {
  sessionId?: string;
  userId?: string;
  enableToolCalling: boolean;
  enableConversationMemory: boolean;
  maxToolCalls: number;
  toolCallTimeout: number;
  availableTools: string[];
}

export function useIntegratedToolAwareConversation(
  conversationId: string,
  ollamaService: OllamaService,
  config: Partial<IntegratedConversationConfig> = {}
) {
  // Configuration
  const [conversationConfig] = useState<IntegratedConversationConfig>({
    sessionId: `session_${Date.now()}`,
    userId: 'user',
    enableToolCalling: true,
    enableConversationMemory: true,
    maxToolCalls: 5,
    toolCallTimeout: 30000,
    availableTools: [],
    ...config
  });

  // State
  const [state, setState] = useState<IntegratedConversationState>({
    isInitialized: false,
    isProcessing: false,
    currentContext: null,
    lastProcessingResult: null,
    processingProgress: null,
    availableTools: [],
    conversationStats: null
  });

  // Service instances
  const [integrationService, setIntegrationService] = useState<ToolAwareIntegrationService | null>(null);
  const [toolCallingService, setToolCallingService] = useState<ToolCallingService | null>(null);
  const [conversationManager, setConversationManager] = useState<ToolAwareConversationManager | null>(null);

  // Refs for stable references
  const conversationIdRef = useRef<string>(conversationId);
  const initializationRef = useRef<boolean>(false);

  /**
   * Initialize all services and contexts
   */
  useEffect(() => {
    const initializeServices = async () => {
      if (initializationRef.current || !ollamaService) return;
      initializationRef.current = true;

      try {
        console.log('Initializing integrated tool-aware conversation services...');

        // Initialize tool framework components
        const toolRegistry = new ToolRegistry();
        const toolExecutor = new ToolExecutor(toolRegistry);
        const toolManager = new ToolManager(toolRegistry, toolExecutor);

        // Initialize tool calling service
        const toolService = new ToolCallingService(
          ollamaService,
          toolManager,
          toolRegistry,
          toolExecutor,
          {
            enableToolCalling: conversationConfig.enableToolCalling,
            maxToolCalls: conversationConfig.maxToolCalls,
            toolCallTimeout: conversationConfig.toolCallTimeout,
            enableMultiStepReasoning: true
          }
        );

        // Initialize conversation manager
        const convManager = new ToolAwareConversationManager({
          maxHistoryLength: 100,
          maxToolExecutionsPerTurn: conversationConfig.maxToolCalls,
          enableToolContextPersistence: true,
          enableConversationMemory: conversationConfig.enableConversationMemory
        });

        // Initialize integration service
        const integrationSvc = new ToolAwareIntegrationService(
          ollamaService,
          toolService,
          convManager
        );

        // Initialize integrated context
        const context = integrationSvc.initializeIntegratedContext(
          conversationId,
          conversationConfig.sessionId!,
          conversationConfig.userId,
          conversationConfig.availableTools
        );

        // Set service instances
        setToolCallingService(toolService);
        setConversationManager(convManager);
        setIntegrationService(integrationSvc);

        // Update state
        setState(prev => ({
          ...prev,
          isInitialized: true,
          currentContext: context,
          availableTools: toolRegistry.getAllTools().map(tool => tool.name)
        }));

        console.log('Integrated tool-aware conversation services initialized successfully');

      } catch (error) {
        console.error('Failed to initialize integrated services:', error);
        initializationRef.current = false;
      }
    };

    initializeServices();
  }, [conversationId, ollamaService, conversationConfig]);

  /**
   * Update conversation ID when it changes
   */
  useEffect(() => {
    if (conversationId !== conversationIdRef.current && integrationService) {
      conversationIdRef.current = conversationId;
      
      // Initialize new context for the new conversation
      const context = integrationService.initializeIntegratedContext(
        conversationId,
        conversationConfig.sessionId!,
        conversationConfig.userId,
        conversationConfig.availableTools
      );

      setState(prev => ({
        ...prev,
        currentContext: context,
        lastProcessingResult: null,
        processingProgress: null
      }));
    }
  }, [conversationId, integrationService, conversationConfig]);

  /**
   * Process message with full tool-aware conversation management
   */
  const processMessage = useCallback(async (
    messages: Message[],
    newMessage: string,
    model?: string,
    onProgress?: (progress: ToolAwareProcessingProgress) => void
  ): Promise<ToolAwareProcessingResult> => {
    if (!integrationService || !state.isInitialized) {
      throw new Error('Integration service not initialized');
    }

    setState(prev => ({ ...prev, isProcessing: true, processingProgress: null }));

    try {
      const result = await integrationService.processMessageWithToolAwareness(
        conversationId,
        messages,
        newMessage,
        model,
        (progress) => {
          setState(prev => ({ ...prev, processingProgress: progress }));
          onProgress?.(progress);
        }
      );

      // Update conversation stats
      const stats = integrationService.getIntegratedConversationStats(conversationId);

      setState(prev => ({
        ...prev,
        isProcessing: false,
        lastProcessingResult: result,
        conversationStats: stats,
        processingProgress: null
      }));

      return result;

    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        processingProgress: null 
      }));
      throw error;
    }
  }, [integrationService, state.isInitialized, conversationId]);

  /**
   * Get tool-aware messages for LLM context
   */
  const getToolAwareMessages = useCallback((includeToolContext: boolean = true) => {
    if (!integrationService) return [];
    return integrationService.getToolAwareMessagesForLLM(conversationId, includeToolContext);
  }, [integrationService, conversationId]);

  /**
   * Get recent tool context
   */
  const getRecentToolContext = useCallback((maxExecutions: number = 5) => {
    if (!integrationService) {
      return { recentExecutions: [], successfulTools: [], failedTools: [], toolResults: {} };
    }
    return integrationService.getRecentToolContext(conversationId, maxExecutions);
  }, [integrationService, conversationId]);

  /**
   * Update conversation memory
   */
  const updateMemory = useCallback((
    key: string,
    value: any,
    persistent: boolean = false
  ) => {
    if (!integrationService) return;
    integrationService.updateToolAwareMemory(conversationId, key, value, persistent);
  }, [integrationService, conversationId]);

  /**
   * Get conversation statistics
   */
  const getConversationStats = useCallback(() => {
    if (!integrationService) return null;
    return integrationService.getIntegratedConversationStats(conversationId);
  }, [integrationService, conversationId]);

  /**
   * Export conversation data
   */
  const exportConversation = useCallback(() => {
    if (!integrationService) return null;
    return integrationService.exportIntegratedConversation(conversationId);
  }, [integrationService, conversationId]);

  /**
   * Import conversation data
   */
  const importConversation = useCallback((data: any): boolean => {
    if (!integrationService) return false;
    
    const success = integrationService.importIntegratedConversation(data);
    
    if (success) {
      // Update state with imported context
      const context = integrationService.getIntegratedContext(data.conversation.conversationId);
      const stats = integrationService.getIntegratedConversationStats(data.conversation.conversationId);
      
      setState(prev => ({
        ...prev,
        currentContext: context || null,
        conversationStats: stats
      }));
    }
    
    return success;
  }, [integrationService]);

  /**
   * Clear conversation
   */
  const clearConversation = useCallback(() => {
    if (!integrationService) return;
    
    integrationService.clearIntegratedConversation(conversationId);
    
    // Reinitialize context
    const context = integrationService.initializeIntegratedContext(
      conversationId,
      conversationConfig.sessionId!,
      conversationConfig.userId,
      conversationConfig.availableTools
    );

    setState(prev => ({
      ...prev,
      currentContext: context,
      lastProcessingResult: null,
      processingProgress: null,
      conversationStats: null
    }));
  }, [integrationService, conversationId, conversationConfig]);

  /**
   * Check if conversation has tool context
   */
  const hasToolContext = useCallback(() => {
    if (!state.currentContext) return false;
    return state.currentContext.conversationContext.toolExecutionHistory.length > 0;
  }, [state.currentContext]);

  /**
   * Get available tools
   */
  const getAvailableTools = useCallback(() => {
    return state.availableTools;
  }, [state.availableTools]);

  /**
   * Check if tool calling is enabled
   */
  const isToolCallingEnabled = useCallback(() => {
    return conversationConfig.enableToolCalling && state.isInitialized;
  }, [conversationConfig.enableToolCalling, state.isInitialized]);

  /**
   * Get current processing status
   */
  const getProcessingStatus = useCallback(() => {
    return {
      isProcessing: state.isProcessing,
      progress: state.processingProgress,
      lastResult: state.lastProcessingResult
    };
  }, [state.isProcessing, state.processingProgress, state.lastProcessingResult]);

  return {
    // State
    state,
    config: conversationConfig,
    
    // Core functionality
    processMessage,
    
    // Context and memory
    getToolAwareMessages,
    getRecentToolContext,
    updateMemory,
    
    // Statistics and utilities
    getConversationStats,
    exportConversation,
    importConversation,
    clearConversation,
    hasToolContext,
    
    // Tool management
    getAvailableTools,
    isToolCallingEnabled,
    
    // Processing status
    getProcessingStatus,
    
    // Service instances (for advanced usage)
    integrationService,
    toolCallingService,
    conversationManager
  };
}