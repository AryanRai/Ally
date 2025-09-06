/**
 * Tool-Aware Integration Service
 * Requirements: 15.1, 3.3
 * 
 * Integrates tool calling service with tool-aware conversation management
 * Provides unified interface for tool-aware conversation processing
 * Handles tool execution context and result integration
 */

import { OllamaService, ChatMessage } from './ollamaService';
import { ToolCallingService, ToolCall, ToolCallResult, ConversationContext as ToolContext } from './toolCallingService';
import { 
  ToolAwareConversationManager, 
  ConversationContext, 
  ConversationTurn, 
  ToolExecutionEntry,
  ToolAwareMessage 
} from '../utils/toolAwareConversationManager';
import { Message } from '../types/chat';

export interface IntegratedConversationContext {
  conversationId: string;
  sessionId: string;
  userId?: string;
  toolContext: ToolContext;
  conversationContext: ConversationContext;
}

export interface ToolAwareProcessingResult {
  response: string;
  toolCalls: ToolCall[];
  toolResults: ToolCallResult[];
  conversationTurn: ConversationTurn;
  toolExecutions: ToolExecutionEntry[];
}

export interface ToolAwareProcessingProgress {
  type: 'thinking' | 'tool_call' | 'tool_execution' | 'tool_result' | 'response' | 'done';
  content: string;
  thinking?: string;
  response?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolCallResult[];
  turn?: ConversationTurn;
  isComplete: boolean;
}

export class ToolAwareIntegrationService {
  private ollamaService: OllamaService;
  private toolCallingService: ToolCallingService;
  private conversationManager: ToolAwareConversationManager;
  private activeContexts: Map<string, IntegratedConversationContext> = new Map();

  constructor(
    ollamaService: OllamaService,
    toolCallingService: ToolCallingService,
    conversationManager: ToolAwareConversationManager
  ) {
    this.ollamaService = ollamaService;
    this.toolCallingService = toolCallingService;
    this.conversationManager = conversationManager;
  }

  /**
   * Initialize integrated conversation context
   */
  initializeIntegratedContext(
    conversationId: string,
    sessionId: string,
    userId?: string,
    availableTools: string[] = []
  ): IntegratedConversationContext {
    // Initialize conversation context
    const conversationContext = this.conversationManager.initializeConversation(
      conversationId,
      sessionId,
      userId
    );

    // Initialize tool context
    const toolContext: ToolContext = {
      userId,
      sessionId,
      conversationId,
      toolExecutionHistory: [],
      availableTools,
      environment: {
        platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
        timestamp: new Date().toISOString(),
        conversationId
      }
    };

    const integratedContext: IntegratedConversationContext = {
      conversationId,
      sessionId,
      userId,
      toolContext,
      conversationContext
    };

    this.activeContexts.set(conversationId, integratedContext);
    return integratedContext;
  }

  /**
   * Process message with full tool-aware conversation management
   */
  async processMessageWithToolAwareness(
    conversationId: string,
    messages: Message[],
    newMessage: string,
    model?: string,
    onProgress?: (progress: ToolAwareProcessingProgress) => void
  ): Promise<ToolAwareProcessingResult> {
    const context = this.activeContexts.get(conversationId);
    if (!context) {
      throw new Error(`Conversation context not found for ${conversationId}`);
    }

    // Create user message
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: newMessage,
      timestamp: Date.now()
    };

    // Start conversation turn
    const turn = this.conversationManager.startConversationTurn(
      conversationId,
      userMessage
    );

    onProgress?.({
      type: 'thinking',
      content: 'Starting conversation turn...',
      turn,
      isComplete: false
    });

    try {
      // Convert messages to tool-aware format
      const toolAwareMessages = this.convertToToolAwareMessages(messages, context);
      toolAwareMessages.push({
        role: 'user',
        content: newMessage
      });

      // Update tool context with latest execution history
      const updatedToolContext: ToolContext = {
        ...context.toolContext,
        toolExecutionHistory: context.conversationContext.toolExecutionHistory.map(exec => ({
          id: exec.id,
          name: exec.toolCall.name,
          result: exec.result.result,
          error: exec.result.error,
          executionTime: exec.result.executionTime
        }))
      };

      // Process with tool calling service
      const toolResult = await this.toolCallingService.chatWithTools(
        toolAwareMessages,
        updatedToolContext,
        model,
        (chunk, toolCalls, toolResults) => {
          // Determine progress type
          let progressType: ToolAwareProcessingProgress['type'] = 'response';
          
          if (toolCalls && toolCalls.length > 0) {
            if (!toolResults || toolResults.length === 0) {
              progressType = 'tool_call';
            } else if (toolResults.length < toolCalls.length) {
              progressType = 'tool_execution';
            } else {
              progressType = 'tool_result';
            }
          }

          onProgress?.({
            type: progressType,
            content: chunk,
            toolCalls,
            toolResults,
            turn,
            isComplete: false
          });
        }
      );

      // Convert tool results to execution entries
      const toolExecutions: ToolExecutionEntry[] = [];
      for (let i = 0; i < toolResult.toolCalls.length; i++) {
        const toolCall = toolResult.toolCalls[i];
        const toolCallResult = toolResult.toolResults[i];
        
        if (toolCallResult) {
          const execution = this.conversationManager.addToolExecution(
            conversationId,
            turn.turnId,
            toolCall,
            toolCallResult,
            userMessage.id
          );
          toolExecutions.push(execution);
        }
      }

      // Create assistant message
      const assistantMessage: Message = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: toolResult.response,
        timestamp: Date.now()
      };

      // Complete conversation turn
      this.conversationManager.completeConversationTurn(
        conversationId,
        turn.turnId,
        assistantMessage,
        toolExecutions
      );

      // Update integrated context
      const updatedConversationContext = this.conversationManager.getConversationContext(conversationId);
      if (updatedConversationContext) {
        context.conversationContext = updatedConversationContext;
        context.toolContext.toolExecutionHistory = toolResult.toolResults;
      }

      // Final progress update
      onProgress?.({
        type: 'done',
        content: toolResult.response,
        toolCalls: toolResult.toolCalls,
        toolResults: toolResult.toolResults,
        turn,
        isComplete: true
      });

      return {
        response: toolResult.response,
        toolCalls: toolResult.toolCalls,
        toolResults: toolResult.toolResults,
        conversationTurn: turn,
        toolExecutions
      };

    } catch (error) {
      // Mark turn as failed
      const errorMessage: Message = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now()
      };

      this.conversationManager.completeConversationTurn(
        conversationId,
        turn.turnId,
        errorMessage
      );

      throw error;
    }
  }

  /**
   * Get tool-aware messages for LLM context
   */
  getToolAwareMessagesForLLM(
    conversationId: string,
    includeToolContext: boolean = true
  ): ToolAwareMessage[] {
    const context = this.activeContexts.get(conversationId);
    if (!context) {
      return [];
    }

    return this.conversationManager.getToolAwareMessages(
      conversationId,
      includeToolContext
    );
  }

  /**
   * Get conversation statistics with tool execution metrics
   */
  getIntegratedConversationStats(conversationId: string) {
    const context = this.activeContexts.get(conversationId);
    if (!context) {
      return null;
    }

    const conversationStats = this.conversationManager.getConversationStats(conversationId);
    const toolStats = this.toolCallingService.getToolExecutionStats();

    return {
      conversation: conversationStats,
      tools: toolStats,
      integration: {
        totalTurnsWithTools: context.conversationContext.turns.filter(
          turn => turn.toolExecutions.length > 0
        ).length,
        averageToolsPerTurn: conversationStats.totalTurns > 0 
          ? conversationStats.totalToolExecutions / conversationStats.totalTurns 
          : 0,
        toolSuccessRate: conversationStats.totalToolExecutions > 0
          ? conversationStats.successfulToolExecutions / conversationStats.totalToolExecutions
          : 0
      }
    };
  }

  /**
   * Update conversation memory with tool-aware context
   */
  updateToolAwareMemory(
    conversationId: string,
    key: string,
    value: any,
    persistent: boolean = false
  ): void {
    this.conversationManager.updateConversationMemory(
      conversationId,
      key,
      value,
      persistent
    );
  }

  /**
   * Get recent tool context for conversation
   */
  getRecentToolContext(conversationId: string, maxExecutions: number = 5) {
    return this.conversationManager.getRecentToolContext(conversationId, maxExecutions);
  }

  /**
   * Export integrated conversation data
   */
  exportIntegratedConversation(conversationId: string) {
    const context = this.activeContexts.get(conversationId);
    if (!context) {
      return null;
    }

    const conversationData = this.conversationManager.exportConversation(conversationId);
    const toolStats = this.toolCallingService.getToolExecutionStats();

    return {
      conversation: conversationData,
      toolContext: context.toolContext,
      toolStats,
      exportedAt: Date.now()
    };
  }

  /**
   * Import integrated conversation data
   */
  importIntegratedConversation(data: any): boolean {
    try {
      if (!data.conversation || !data.toolContext) {
        return false;
      }

      // Import conversation data
      const success = this.conversationManager.importConversation(data.conversation);
      if (!success) {
        return false;
      }

      // Restore integrated context
      const integratedContext: IntegratedConversationContext = {
        conversationId: data.conversation.conversationId,
        sessionId: data.conversation.sessionId,
        userId: data.conversation.userId,
        toolContext: data.toolContext,
        conversationContext: this.conversationManager.getConversationContext(
          data.conversation.conversationId
        )!
      };

      this.activeContexts.set(data.conversation.conversationId, integratedContext);
      return true;

    } catch (error) {
      console.error('Failed to import integrated conversation:', error);
      return false;
    }
  }

  /**
   * Clear conversation context
   */
  clearIntegratedConversation(conversationId: string): void {
    this.conversationManager.clearConversation(conversationId);
    this.activeContexts.delete(conversationId);
  }

  /**
   * Get integrated context
   */
  getIntegratedContext(conversationId: string): IntegratedConversationContext | undefined {
    return this.activeContexts.get(conversationId);
  }

  /**
   * Private helper methods
   */

  private convertToToolAwareMessages(
    messages: Message[],
    context: IntegratedConversationContext
  ): ChatMessage[] {
    return messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));
  }
}