/**
 * Tool-Aware Conversation Manager
 * Requirements: 15.1, 3.3
 * 
 * Implements conversation context management with tool execution history
 * Creates tool result integration into ongoing conversation flow
 * Builds multi-turn conversation support with tool execution context
 */

import { Message, Chat } from '../types/chat';
import { ToolCall, ToolCallResult } from '../services/toolCallingService';

export interface ToolExecutionEntry {
  id: string;
  toolCall: ToolCall;
  result: ToolCallResult;
  timestamp: number;
  messageId: string; // Associated message that triggered the tool
  conversationTurn: number;
}

export interface ConversationTurn {
  turnId: string;
  userMessage: Message;
  assistantMessage?: Message;
  toolExecutions: ToolExecutionEntry[];
  startTime: number;
  endTime?: number;
  status: 'in_progress' | 'completed' | 'failed';
}

export interface ToolAwareMessage extends Message {
  toolExecutions?: ToolExecutionEntry[];
  conversationTurn?: string;
  toolContext?: {
    availableTools: string[];
    executionHistory: ToolExecutionEntry[];
    conversationContext: Record<string, any>;
  };
}

export interface ConversationContext {
  conversationId: string;
  sessionId: string;
  userId?: string;
  turns: ConversationTurn[];
  globalToolContext: Record<string, any>;
  toolExecutionHistory: ToolExecutionEntry[];
  activeToolCalls: Map<string, ToolCall>;
  conversationMemory: {
    shortTerm: Record<string, any>; // Current conversation context
    longTerm: Record<string, any>; // Persistent across conversations
  };
}

export interface ConversationManagerConfig {
  maxHistoryLength: number;
  maxToolExecutionsPerTurn: number;
  enableToolContextPersistence: boolean;
  enableConversationMemory: boolean;
  toolContextRetentionTurns: number;
}

export class ToolAwareConversationManager {
  private conversations: Map<string, ConversationContext> = new Map();
  private config: ConversationManagerConfig;
  private turnCounter: number = 0;

  constructor(config: Partial<ConversationManagerConfig> = {}) {
    this.config = {
      maxHistoryLength: 100,
      maxToolExecutionsPerTurn: 10,
      enableToolContextPersistence: true,
      enableConversationMemory: true,
      toolContextRetentionTurns: 20,
      ...config
    };
  }

  /**
   * Initialize a new conversation context
   */
  initializeConversation(
    conversationId: string,
    sessionId: string,
    userId?: string
  ): ConversationContext {
    const context: ConversationContext = {
      conversationId,
      sessionId,
      userId,
      turns: [],
      globalToolContext: {},
      toolExecutionHistory: [],
      activeToolCalls: new Map(),
      conversationMemory: {
        shortTerm: {},
        longTerm: this.loadLongTermMemory(userId)
      }
    };

    this.conversations.set(conversationId, context);
    return context;
  }

  /**
   * Start a new conversation turn
   */
  startConversationTurn(
    conversationId: string,
    userMessage: Message
  ): ConversationTurn {
    const context = this.getConversationContext(conversationId);
    if (!context) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    this.turnCounter++;
    const turn: ConversationTurn = {
      turnId: `turn_${this.turnCounter}_${Date.now()}`,
      userMessage,
      toolExecutions: [],
      startTime: Date.now(),
      status: 'in_progress'
    };

    context.turns.push(turn);
    this.trimConversationHistory(context);

    return turn;
  }

  /**
   * Complete a conversation turn with assistant response
   */
  completeConversationTurn(
    conversationId: string,
    turnId: string,
    assistantMessage: Message,
    toolExecutions: ToolExecutionEntry[] = []
  ): void {
    const context = this.getConversationContext(conversationId);
    if (!context) return;

    const turn = context.turns.find(t => t.turnId === turnId);
    if (!turn) return;

    turn.assistantMessage = assistantMessage;
    turn.toolExecutions = toolExecutions;
    turn.endTime = Date.now();
    turn.status = 'completed';

    // Update global tool execution history
    context.toolExecutionHistory.push(...toolExecutions);
    this.trimToolExecutionHistory(context);

    // Update conversation memory with tool results
    this.updateConversationMemoryFromTurn(context, turn);

    // Clear active tool calls for this turn
    toolExecutions.forEach(execution => {
      context.activeToolCalls.delete(execution.toolCall.id);
    });
  }

  /**
   * Add tool execution to current turn
   */
  addToolExecution(
    conversationId: string,
    turnId: string,
    toolCall: ToolCall,
    result: ToolCallResult,
    messageId: string
  ): ToolExecutionEntry {
    const context = this.getConversationContext(conversationId);
    if (!context) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const turn = context.turns.find(t => t.turnId === turnId);
    if (!turn) {
      throw new Error(`Turn ${turnId} not found`);
    }

    const execution: ToolExecutionEntry = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      toolCall,
      result,
      timestamp: Date.now(),
      messageId,
      conversationTurn: turn.turnId
    };

    turn.toolExecutions.push(execution);
    context.activeToolCalls.delete(toolCall.id);

    // Update global tool context with execution results
    this.updateGlobalToolContext(context, execution);

    return execution;
  }

  /**
   * Register active tool call
   */
  registerActiveToolCall(conversationId: string, toolCall: ToolCall): void {
    const context = this.getConversationContext(conversationId);
    if (!context) return;

    context.activeToolCalls.set(toolCall.id, toolCall);
  }

  /**
   * Get conversation context with tool execution history
   */
  getConversationContext(conversationId: string): ConversationContext | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Get tool-aware messages for LLM context
   */
  getToolAwareMessages(
    conversationId: string,
    includeToolContext: boolean = true
  ): ToolAwareMessage[] {
    const context = this.getConversationContext(conversationId);
    if (!context) return [];

    const messages: ToolAwareMessage[] = [];

    // Add system message with tool context if enabled
    if (includeToolContext && this.config.enableToolContextPersistence) {
      const toolContextMessage: ToolAwareMessage = {
        id: `tool_context_${Date.now()}`,
        role: 'system',
        content: this.buildToolContextMessage(context),
        timestamp: Date.now(),
        toolContext: {
          availableTools: this.getAvailableToolsForContext(context),
          executionHistory: context.toolExecutionHistory.slice(-10), // Last 10 executions
          conversationContext: context.globalToolContext
        }
      };
      messages.push(toolContextMessage);
    }

    // Convert turns to tool-aware messages
    for (const turn of context.turns) {
      // Add user message
      const userMessage: ToolAwareMessage = {
        ...turn.userMessage,
        conversationTurn: turn.turnId,
        toolExecutions: turn.toolExecutions
      };
      messages.push(userMessage);

      // Add assistant message if completed
      if (turn.assistantMessage) {
        const assistantMessage: ToolAwareMessage = {
          ...turn.assistantMessage,
          conversationTurn: turn.turnId,
          toolExecutions: turn.toolExecutions
        };
        messages.push(assistantMessage);
      }
    }

    return messages;
  }

  /**
   * Get recent tool execution context for current conversation
   */
  getRecentToolContext(
    conversationId: string,
    maxExecutions: number = 5
  ): {
    recentExecutions: ToolExecutionEntry[];
    successfulTools: string[];
    failedTools: string[];
    toolResults: Record<string, any>;
  } {
    const context = this.getConversationContext(conversationId);
    if (!context) {
      return { recentExecutions: [], successfulTools: [], failedTools: [], toolResults: {} };
    }

    const recentExecutions = context.toolExecutionHistory.slice(-maxExecutions);
    const successfulTools = recentExecutions
      .filter(exec => !exec.result.error)
      .map(exec => exec.toolCall.name);
    const failedTools = recentExecutions
      .filter(exec => exec.result.error)
      .map(exec => exec.toolCall.name);
    
    const toolResults: Record<string, any> = {};
    recentExecutions.forEach(exec => {
      if (!exec.result.error && exec.result.result) {
        toolResults[exec.toolCall.name] = exec.result.result;
      }
    });

    return {
      recentExecutions,
      successfulTools: [...new Set(successfulTools)],
      failedTools: [...new Set(failedTools)],
      toolResults
    };
  }

  /**
   * Update conversation memory with new information
   */
  updateConversationMemory(
    conversationId: string,
    key: string,
    value: any,
    persistent: boolean = false
  ): void {
    const context = this.getConversationContext(conversationId);
    if (!context || !this.config.enableConversationMemory) return;

    if (persistent) {
      context.conversationMemory.longTerm[key] = value;
      this.saveLongTermMemory(context.userId, context.conversationMemory.longTerm);
    } else {
      context.conversationMemory.shortTerm[key] = value;
    }
  }

  /**
   * Get conversation memory value
   */
  getConversationMemory(
    conversationId: string,
    key: string,
    checkLongTerm: boolean = true
  ): any {
    const context = this.getConversationContext(conversationId);
    if (!context) return undefined;

    // Check short-term memory first
    if (key in context.conversationMemory.shortTerm) {
      return context.conversationMemory.shortTerm[key];
    }

    // Check long-term memory if enabled
    if (checkLongTerm && key in context.conversationMemory.longTerm) {
      return context.conversationMemory.longTerm[key];
    }

    return undefined;
  }

  /**
   * Get conversation statistics
   */
  getConversationStats(conversationId: string): {
    totalTurns: number;
    completedTurns: number;
    totalToolExecutions: number;
    successfulToolExecutions: number;
    failedToolExecutions: number;
    averageToolExecutionTime: number;
    mostUsedTools: Array<{ name: string; count: number }>;
  } {
    const context = this.getConversationContext(conversationId);
    if (!context) {
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

    const totalTurns = context.turns.length;
    const completedTurns = context.turns.filter(t => t.status === 'completed').length;
    const allExecutions = context.toolExecutionHistory;
    
    const successfulExecutions = allExecutions.filter(e => !e.result.error);
    const failedExecutions = allExecutions.filter(e => e.result.error);
    
    const averageToolExecutionTime = allExecutions.length > 0
      ? allExecutions.reduce((sum, e) => sum + e.result.executionTime, 0) / allExecutions.length
      : 0;

    // Count tool usage
    const toolCounts = new Map<string, number>();
    allExecutions.forEach(exec => {
      const count = toolCounts.get(exec.toolCall.name) || 0;
      toolCounts.set(exec.toolCall.name, count + 1);
    });

    const mostUsedTools = Array.from(toolCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalTurns,
      completedTurns,
      totalToolExecutions: allExecutions.length,
      successfulToolExecutions: successfulExecutions.length,
      failedToolExecutions: failedExecutions.length,
      averageToolExecutionTime,
      mostUsedTools
    };
  }

  /**
   * Clear conversation context
   */
  clearConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  /**
   * Export conversation for persistence
   */
  exportConversation(conversationId: string): any {
    const context = this.getConversationContext(conversationId);
    if (!context) return null;

    return {
      conversationId: context.conversationId,
      sessionId: context.sessionId,
      userId: context.userId,
      turns: context.turns,
      toolExecutionHistory: context.toolExecutionHistory,
      conversationMemory: context.conversationMemory,
      exportedAt: Date.now()
    };
  }

  /**
   * Import conversation from persistence
   */
  importConversation(data: any): boolean {
    try {
      const context: ConversationContext = {
        conversationId: data.conversationId,
        sessionId: data.sessionId,
        userId: data.userId,
        turns: data.turns || [],
        globalToolContext: {},
        toolExecutionHistory: data.toolExecutionHistory || [],
        activeToolCalls: new Map(),
        conversationMemory: data.conversationMemory || { shortTerm: {}, longTerm: {} }
      };

      this.conversations.set(data.conversationId, context);
      return true;
    } catch (error) {
      console.error('Failed to import conversation:', error);
      return false;
    }
  }

  /**
   * Private helper methods
   */

  private buildToolContextMessage(context: ConversationContext): string {
    const recentExecutions = context.toolExecutionHistory.slice(-5);
    const toolResults = context.globalToolContext;
    
    let contextMessage = 'Tool Execution Context:\n\n';
    
    if (recentExecutions.length > 0) {
      contextMessage += 'Recent Tool Executions:\n';
      recentExecutions.forEach(exec => {
        const status = exec.result.error ? 'Failed' : 'Success';
        contextMessage += `- ${exec.toolCall.name}: ${status}\n`;
      });
      contextMessage += '\n';
    }

    if (Object.keys(toolResults).length > 0) {
      contextMessage += 'Available Tool Results:\n';
      Object.entries(toolResults).forEach(([key, value]) => {
        contextMessage += `- ${key}: ${JSON.stringify(value).substring(0, 100)}...\n`;
      });
    }

    return contextMessage;
  }

  private getAvailableToolsForContext(context: ConversationContext): string[] {
    // This would integrate with the tool registry to get available tools
    // For now, return tools that have been used in this conversation
    const usedTools = new Set(context.toolExecutionHistory.map(e => e.toolCall.name));
    return Array.from(usedTools);
  }

  private updateGlobalToolContext(context: ConversationContext, execution: ToolExecutionEntry): void {
    if (!execution.result.error && execution.result.result) {
      const key = `${execution.toolCall.name}_result`;
      context.globalToolContext[key] = execution.result.result;
      
      // Also store by execution ID for reference
      context.globalToolContext[execution.id] = execution.result.result;
    }
  }

  private updateConversationMemoryFromTurn(context: ConversationContext, turn: ConversationTurn): void {
    if (!this.config.enableConversationMemory) return;

    // Extract key information from tool executions
    if (turn.toolExecutions) {
      turn.toolExecutions.forEach(exec => {
        if (!exec.result.error) {
          const memoryKey = `tool_${exec.toolCall.name}_last_result`;
          context.conversationMemory.shortTerm[memoryKey] = exec.result.result;
        }
      });
    }

    // Update turn-based memory
    context.conversationMemory.shortTerm.lastTurnId = turn.turnId;
    context.conversationMemory.shortTerm.lastTurnTime = turn.endTime;
  }

  private trimConversationHistory(context: ConversationContext): void {
    if (context.turns.length > this.config.maxHistoryLength) {
      const excessTurns = context.turns.length - this.config.maxHistoryLength;
      context.turns.splice(0, excessTurns);
    }
  }

  private trimToolExecutionHistory(context: ConversationContext): void {
    const maxExecutions = this.config.maxHistoryLength * this.config.maxToolExecutionsPerTurn;
    if (context.toolExecutionHistory.length > maxExecutions) {
      const excessExecutions = context.toolExecutionHistory.length - maxExecutions;
      context.toolExecutionHistory.splice(0, excessExecutions);
    }
  }

  private loadLongTermMemory(userId?: string): Record<string, any> {
    if (!userId || !this.config.enableConversationMemory) return {};
    
    // This would integrate with persistent storage
    // For now, return empty object
    return {};
  }

  private saveLongTermMemory(userId?: string, memory: Record<string, any>): void {
    if (!userId || !this.config.enableConversationMemory) return;
    
    // This would integrate with persistent storage
    // For now, do nothing
  }
}