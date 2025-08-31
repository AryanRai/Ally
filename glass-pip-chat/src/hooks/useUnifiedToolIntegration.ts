/**
 * Unified Tool Integration Hook
 * Requirements: Task 13 - Integration of UI, Tool Framework, and Comms
 * 
 * React hook that provides unified access to:
 * - Tool calling framework
 * - Stream handler/comms integration
 * - Tool-aware conversation management
 * - Real-time WebSocket communication
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { OllamaService } from '../services/ollamaService';
import { 
  UnifiedToolIntegrationService, 
  UnifiedIntegrationConfig, 
  UnifiedIntegrationState 
} from '../services/unifiedToolIntegrationService';
import { ToolAwareProcessingProgress } from '../services/toolAwareIntegrationService';
import { Message } from '../types/chat';

export interface UnifiedToolIntegrationHookState {
  // Service state
  service: UnifiedToolIntegrationService | null;
  isInitialized: boolean;
  isInitializing: boolean;
  
  // Connection state
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  isConnected: boolean;
  lastError?: string;
  latency?: number;
  
  // Tool execution state
  activeExecutions: number;
  availableTools: string[];
  systemStatus: 'idle' | 'processing' | 'error';
  
  // Processing state
  isProcessing: boolean;
  currentProgress?: ToolAwareProcessingProgress;
}

export interface UnifiedToolIntegrationHookConfig extends Partial<UnifiedIntegrationConfig> {
  autoConnect?: boolean;
  autoReconnect?: boolean;
}

export interface ProcessMessageOptions {
  model?: string;
  onProgress?: (progress: ToolAwareProcessingProgress) => void;
  onToolExecution?: (executionId: string, toolName: string) => void;
  onToolComplete?: (executionId: string, result: any) => void;
  onToolError?: (executionId: string, error: any) => void;
}

export function useUnifiedToolIntegration(
  conversationId: string,
  ollamaService: OllamaService,
  config: UnifiedToolIntegrationHookConfig = {}
) {
  // Configuration with defaults
  const [hookConfig] = useState<UnifiedToolIntegrationHookConfig>({
    autoConnect: true,
    autoReconnect: true,
    streamHandlerUrl: 'ws://localhost:3000',
    enableToolExecution: true,
    enableConversationMemory: true,
    sourceIdentifier: 'ally_glass_pip_chat',
    ...config
  });

  // State
  const [state, setState] = useState<UnifiedToolIntegrationHookState>({
    service: null,
    isInitialized: false,
    isInitializing: false,
    connectionStatus: 'disconnected',
    isConnected: false,
    activeExecutions: 0,
    availableTools: [],
    systemStatus: 'idle',
    isProcessing: false
  });

  // Refs for stable references
  const conversationIdRef = useRef<string>(conversationId);
  const initializationRef = useRef<boolean>(false);
  const serviceRef = useRef<UnifiedToolIntegrationService | null>(null);

  /**
   * Initialize the unified integration service
   */
  const initializeService = useCallback(async () => {
    if (initializationRef.current || !ollamaService) return;
    initializationRef.current = true;

    setState(prev => ({ ...prev, isInitializing: true }));

    try {
      console.log('Initializing unified tool integration service...');
      
      const service = new UnifiedToolIntegrationService(ollamaService, hookConfig);
      serviceRef.current = service;

      // Set up event listeners
      service.on('connectionStatusChanged', (status: string) => {
        setState(prev => ({
          ...prev,
          connectionStatus: status as any,
          isConnected: status === 'connected'
        }));
      });

      service.on('systemStatusChanged', (status: string) => {
        setState(prev => ({
          ...prev,
          systemStatus: status as any
        }));
      });

      service.on('toolExecutionCompleted', (event: any) => {
        setState(prev => ({
          ...prev,
          activeExecutions: Math.max(0, prev.activeExecutions - 1)
        }));
      });

      service.on('latencyMeasured', (latency: number) => {
        setState(prev => ({ ...prev, latency }));
      });

      service.on('systemInfoReceived', (info: any) => {
        console.log('System info received:', info);
      });

      service.on('allyStatusReceived', (status: any) => {
        console.log('Ally status received:', status);
      });

      // Initialize the service
      await service.initialize();

      setState(prev => ({
        ...prev,
        service,
        isInitialized: true,
        isInitializing: false,
        availableTools: service.getAvailableTools()
      }));

      console.log('Unified tool integration service initialized successfully');

    } catch (error) {
      console.error('Failed to initialize unified tool integration service:', error);
      setState(prev => ({
        ...prev,
        isInitializing: false,
        lastError: error instanceof Error ? error.message : 'Initialization failed'
      }));
      initializationRef.current = false;
    }
  }, [ollamaService, hookConfig]);

  /**
   * Initialize service on mount
   */
  useEffect(() => {
    initializeService();

    return () => {
      if (serviceRef.current) {
        serviceRef.current.destroy();
        serviceRef.current = null;
      }
      initializationRef.current = false;
    };
  }, [initializeService]);

  /**
   * Update conversation ID when it changes
   */
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  /**
   * Process message with unified integration
   */
  const processMessage = useCallback(async (
    messages: Message[],
    newMessage: string,
    options: ProcessMessageOptions = {}
  ): Promise<any> => {
    const service = serviceRef.current;
    if (!service || !state.isInitialized) {
      throw new Error('Service not initialized');
    }

    setState(prev => ({ ...prev, isProcessing: true, currentProgress: undefined }));

    try {
      const result = await service.processMessage(
        conversationIdRef.current,
        messages,
        newMessage,
        options.model,
        (progress) => {
          setState(prev => ({ ...prev, currentProgress: progress }));
          options.onProgress?.(progress);

          // Track tool executions
          if (progress.toolCalls && progress.toolCalls.length > 0) {
            setState(prev => ({
              ...prev,
              activeExecutions: prev.activeExecutions + progress.toolCalls!.length
            }));

            progress.toolCalls.forEach(toolCall => {
              options.onToolExecution?.(toolCall.id || 'unknown', toolCall.name);
            });
          }
        }
      );

      setState(prev => ({
        ...prev,
        isProcessing: false,
        currentProgress: undefined
      }));

      return result;

    } catch (error) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        currentProgress: undefined,
        lastError: error instanceof Error ? error.message : 'Processing failed'
      }));
      throw error;
    }
  }, [state.isInitialized]);

  /**
   * Connect to stream handler
   */
  const connect = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) {
      throw new Error('Service not initialized');
    }

    await service.connect();
  }, []);

  /**
   * Disconnect from stream handler
   */
  const disconnect = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) return;

    await service.disconnect();
  }, []);

  /**
   * Register a custom tool
   */
  const registerTool = useCallback((toolName: string, executor: any) => {
    const service = serviceRef.current;
    if (!service) {
      throw new Error('Service not initialized');
    }

    service.registerTool(toolName, executor);
    setState(prev => ({
      ...prev,
      availableTools: service.getAvailableTools()
    }));
  }, []);

  /**
   * Get current service state
   */
  const getServiceState = useCallback((): UnifiedIntegrationState | null => {
    const service = serviceRef.current;
    return service ? service.getState() : null;
  }, []);

  /**
   * Get connection statistics
   */
  const getConnectionStats = useCallback(() => {
    return {
      isConnected: state.isConnected,
      connectionStatus: state.connectionStatus,
      latency: state.latency,
      lastError: state.lastError,
      activeExecutions: state.activeExecutions
    };
  }, [state.isConnected, state.connectionStatus, state.latency, state.lastError, state.activeExecutions]);

  /**
   * Get tool statistics
   */
  const getToolStats = useCallback(() => {
    return {
      availableTools: state.availableTools,
      toolCount: state.availableTools.length,
      activeExecutions: state.activeExecutions,
      systemStatus: state.systemStatus
    };
  }, [state.availableTools, state.activeExecutions, state.systemStatus]);

  /**
   * Check if service is ready for use
   */
  const isReady = useCallback(() => {
    return state.isInitialized && state.isConnected && !state.isProcessing;
  }, [state.isInitialized, state.isConnected, state.isProcessing]);

  /**
   * Check if tool execution is available
   */
  const isToolExecutionAvailable = useCallback(() => {
    return state.isInitialized && state.availableTools.length > 0;
  }, [state.isInitialized, state.availableTools.length]);

  /**
   * Get processing status
   */
  const getProcessingStatus = useCallback(() => {
    return {
      isProcessing: state.isProcessing,
      currentProgress: state.currentProgress,
      systemStatus: state.systemStatus
    };
  }, [state.isProcessing, state.currentProgress, state.systemStatus]);

  /**
   * Force reconnection
   */
  const forceReconnect = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) return;

    await service.disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    await service.connect();
  }, []);

  /**
   * Reset service state
   */
  const reset = useCallback(async () => {
    const service = serviceRef.current;
    if (!service) return;

    await service.disconnect();
    setState(prev => ({
      ...prev,
      connectionStatus: 'disconnected',
      isConnected: false,
      activeExecutions: 0,
      systemStatus: 'idle',
      isProcessing: false,
      currentProgress: undefined,
      lastError: undefined
    }));

    if (hookConfig.autoConnect) {
      await service.connect();
    }
  }, [hookConfig.autoConnect]);

  return {
    // State
    state,
    
    // Core functionality
    processMessage,
    
    // Connection management
    connect,
    disconnect,
    forceReconnect,
    reset,
    
    // Tool management
    registerTool,
    getAvailableTools: () => state.availableTools,
    
    // Status and statistics
    getServiceState,
    getConnectionStats,
    getToolStats,
    getProcessingStatus,
    
    // Utility functions
    isReady,
    isToolExecutionAvailable,
    
    // Service instance (for advanced usage)
    service: serviceRef.current
  };
}