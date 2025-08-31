/**
 * Integration tests for Tool-Aware Conversation Manager
 * Requirements: 15.1, 3.3
 * 
 * Tests conversation context management with tool execution history
 * Tests tool result integration into ongoing conversation flow
 * Tests multi-turn conversation support with tool execution context
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolAwareConversationManager } from '../toolAwareConversationManager';
import type { Message } from '../../types/chat';
import { ConversationContext } from '../../services/toolCallingService';
import { ConversationContext } from '../../services/toolCallingService';
import { ConversationContext } from '../../services/toolCallingService';
import { ConversationContext } from '../../services/toolCallingService';
import { ConversationContext } from '../../services/toolCallingService';
import { ConversationContext } from '../../services/toolCallingService';

// Define types locally to avoid import issues
interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

interface ToolCallResult {
  id: string;
  name: string;
  result: any;
  error?: string;
  executionTime: number;
}

describe('ToolAwareConversationManager', () => {
  let manager: ToolAwareConversationManager;
  let conversationId: string;
  let sessionId: string;
  let userId: string;

  beforeEach(() => {
    manager = new ToolAwareConversationManager({
      maxHistoryLength: 10,
      maxToolExecutionsPerTurn: 5,
      enableToolContextPersistence: true,
      enableConversationMemory: true
    });

    conversationId = 'test_conversation_1';
    sessionId = 'test_session_1';
    userId = 'test_user_1';
  });

  describe('Conversation Initialization', () => {
    it('should initialize a new conversation context', () => {
      const context = manager.initializeConversation(conversationId, sessionId, userId);

      expect(context).toBeDefined();
      expect(context.conversationId).toBe(conversationId);
      expect(context.sessionId).toBe(sessionId);
      expect(context.userId).toBe(userId);
      expect(context.turns).toEqual([]);
      expect(context.toolExecutionHistory).toEqual([]);
      expect(context.globalToolContext).toEqual({});
      expect(context.activeToolCalls).toBeInstanceOf(Map);
      expect(context.conversationMemory).toBeDefined();
      expect(context.conversationMemory.shortTerm).toEqual({});
      expect(context.conversationMemory.longTerm).toEqual({});
    });

    it('should retrieve conversation context after initialization', () => {
      manager.initializeConversation(conversationId, sessionId, userId);
      const context = manager.getConversationContext(conversationId);

      expect(context).toBeDefined();
      expect(context?.conversationId).toBe(conversationId);
    });
  });

  describe('Conversation Turn Management', () => {
    let context: ConversationContext;
    let userMessage: Message;

    beforeEach(() => {
      context = manager.initializeConversation(conversationId, sessionId, userId);
      userMessage = {
        id: 'msg_1',
        role: 'user',
        content: 'Hello, can you help me with a task?',
        timestamp: Date.now()
      };
    });

    it('should start a new conversation turn', () => {
      const turn = manager.startConversationTurn(conversationId, userMessage);

      expect(turn).toBeDefined();
      expect(turn.turnId).toMatch(/^turn_\d+_\d+$/);
      expect(turn.userMessage).toEqual(userMessage);
      expect(turn.toolExecutions).toEqual([]);
      expect(turn.status).toBe('in_progress');
      expect(turn.startTime).toBeGreaterThan(0);
      expect(turn.endTime).toBeUndefined();
    });

    it('should complete a conversation turn', () => {
      const turn = manager.startConversationTurn(conversationId, userMessage);
      const assistantMessage: Message = {
        id: 'msg_2',
        role: 'assistant',
        content: 'I can help you with that task.',
        timestamp: Date.now()
      };

      manager.completeConversationTurn(conversationId, turn.turnId, assistantMessage);

      const updatedContext = manager.getConversationContext(conversationId);
      const completedTurn = updatedContext?.turns.find(t => t.turnId === turn.turnId);

      expect(completedTurn).toBeDefined();
      expect(completedTurn?.status).toBe('completed');
      expect(completedTurn?.assistantMessage).toEqual(assistantMessage);
      expect(completedTurn?.endTime).toBeGreaterThan(0);
    });

    it('should handle multiple conversation turns', () => {
      // First turn
      const turn1 = manager.startConversationTurn(conversationId, userMessage);
      const assistantMessage1: Message = {
        id: 'msg_2',
        role: 'assistant',
        content: 'I can help you with that.',
        timestamp: Date.now()
      };
      manager.completeConversationTurn(conversationId, turn1.turnId, assistantMessage1);

      // Second turn
      const userMessage2: Message = {
        id: 'msg_3',
        role: 'user',
        content: 'Great, let me ask another question.',
        timestamp: Date.now()
      };
      const turn2 = manager.startConversationTurn(conversationId, userMessage2);

      const context = manager.getConversationContext(conversationId);
      expect(context?.turns).toHaveLength(2);
      expect(context?.turns[0].status).toBe('completed');
      expect(context?.turns[1].status).toBe('in_progress');
    });
  });

  describe('Tool Execution Integration', () => {
    let context: ConversationContext;
    let turn: ConversationTurn;
    let toolCall: ToolCall;
    let toolResult: ToolCallResult;

    beforeEach(() => {
      context = manager.initializeConversation(conversationId, sessionId, userId);
      const userMessage: Message = {
        id: 'msg_1',
        role: 'user',
        content: 'Can you search for information about TypeScript?',
        timestamp: Date.now()
      };
      turn = manager.startConversationTurn(conversationId, userMessage);

      toolCall = {
        id: 'tool_call_1',
        name: 'web_search',
        parameters: { query: 'TypeScript programming language' }
      };

      toolResult = {
        id: 'tool_call_1',
        name: 'web_search',
        result: { 
          title: 'TypeScript - JavaScript with syntax for types',
          summary: 'TypeScript is a strongly typed programming language...'
        },
        executionTime: 1500
      };
    });

    it('should add tool execution to conversation turn', () => {
      const execution = manager.addToolExecution(
        conversationId,
        turn.turnId,
        toolCall,
        toolResult,
        'msg_1'
      );

      expect(execution).toBeDefined();
      expect(execution.id).toMatch(/^exec_\d+_[a-z0-9]+$/);
      expect(execution.toolCall).toEqual(toolCall);
      expect(execution.result).toEqual(toolResult);
      expect(execution.messageId).toBe('msg_1');
      expect(execution.conversationTurn).toBe(turn.turnId);

      const updatedContext = manager.getConversationContext(conversationId);
      const updatedTurn = updatedContext?.turns.find(t => t.turnId === turn.turnId);
      expect(updatedTurn?.toolExecutions).toHaveLength(1);
      expect(updatedTurn?.toolExecutions[0]).toEqual(execution);
    });

    it('should register and track active tool calls', () => {
      manager.registerActiveToolCall(conversationId, toolCall);

      const context = manager.getConversationContext(conversationId);
      expect(context?.activeToolCalls.has(toolCall.id)).toBe(true);
      expect(context?.activeToolCalls.get(toolCall.id)).toEqual(toolCall);
    });

    it('should update global tool context with execution results', () => {
      manager.addToolExecution(
        conversationId,
        turn.turnId,
        toolCall,
        toolResult,
        'msg_1'
      );

      const context = manager.getConversationContext(conversationId);
      expect(context?.globalToolContext).toHaveProperty('web_search_result');
      expect(context?.toolExecutionHistory).toHaveLength(1);
    });

    it('should handle tool execution errors', () => {
      const errorResult: ToolCallResult = {
        id: 'tool_call_1',
        name: 'web_search',
        result: null,
        error: 'Network timeout',
        executionTime: 5000
      };

      const execution = manager.addToolExecution(
        conversationId,
        turn.turnId,
        toolCall,
        errorResult,
        'msg_1'
      );

      expect(execution.result.error).toBe('Network timeout');
      
      const context = manager.getConversationContext(conversationId);
      expect(context?.toolExecutionHistory).toHaveLength(1);
      // Should not update global context with failed results
      expect(context?.globalToolContext).not.toHaveProperty('web_search_result');
    });
  });

  describe('Tool-Aware Message Generation', () => {
    let context: ConversationContext;

    beforeEach(() => {
      context = manager.initializeConversation(conversationId, sessionId, userId);
      
      // Create a conversation with tool executions
      const userMessage: Message = {
        id: 'msg_1',
        role: 'user',
        content: 'Search for TypeScript information',
        timestamp: Date.now()
      };
      const turn = manager.startConversationTurn(conversationId, userMessage);

      const toolCall: ToolCall = {
        id: 'tool_call_1',
        name: 'web_search',
        parameters: { query: 'TypeScript' }
      };

      const toolResult: ToolCallResult = {
        id: 'tool_call_1',
        name: 'web_search',
        result: { summary: 'TypeScript is a typed superset of JavaScript' },
        executionTime: 1000
      };

      manager.addToolExecution(conversationId, turn.turnId, toolCall, toolResult, 'msg_1');

      const assistantMessage: Message = {
        id: 'msg_2',
        role: 'assistant',
        content: 'I found information about TypeScript for you.',
        timestamp: Date.now()
      };

      manager.completeConversationTurn(conversationId, turn.turnId, assistantMessage);
    });

    it('should generate tool-aware messages with context', () => {
      const messages = manager.getToolAwareMessages(conversationId, true);

      expect(messages.length).toBeGreaterThan(1);
      
      // Should include system message with tool context
      const systemMessage = messages.find(msg => msg.role === 'system');
      expect(systemMessage).toBeDefined();
      expect(systemMessage?.content).toContain('Tool Execution Context');
      expect(systemMessage?.toolContext).toBeDefined();
      expect(systemMessage?.toolContext?.executionHistory).toHaveLength(1);

      // Should include user and assistant messages with tool execution info
      const userMessage = messages.find(msg => msg.role === 'user');
      expect(userMessage).toBeDefined();
      expect(userMessage?.toolExecutions).toHaveLength(1);

      const assistantMessage = messages.find(msg => msg.role === 'assistant');
      expect(assistantMessage).toBeDefined();
      expect(assistantMessage?.toolExecutions).toHaveLength(1);
    });

    it('should generate messages without tool context when disabled', () => {
      const messages = manager.getToolAwareMessages(conversationId, false);

      // Should not include system message with tool context
      const systemMessage = messages.find(msg => msg.role === 'system');
      expect(systemMessage).toBeUndefined();

      // Should still include conversation messages
      expect(messages.length).toBe(2); // user + assistant
    });

    it('should provide recent tool context', () => {
      const toolContext = manager.getRecentToolContext(conversationId, 5);

      expect(toolContext.recentExecutions).toHaveLength(1);
      expect(toolContext.successfulTools).toContain('web_search');
      expect(toolContext.failedTools).toHaveLength(0);
      expect(toolContext.toolResults).toHaveProperty('web_search');
    });
  });

  describe('Conversation Memory Management', () => {
    let context: ConversationContext;

    beforeEach(() => {
      context = manager.initializeConversation(conversationId, sessionId, userId);
    });

    it('should update and retrieve conversation memory', () => {
      manager.updateConversationMemory(conversationId, 'user_preference', 'dark_theme', false);
      manager.updateConversationMemory(conversationId, 'session_info', 'first_visit', true);

      const preference = manager.getConversationMemory(conversationId, 'user_preference');
      const sessionInfo = manager.getConversationMemory(conversationId, 'session_info');

      expect(preference).toBe('dark_theme');
      expect(sessionInfo).toBe('first_visit');
    });

    it('should handle persistent vs short-term memory', () => {
      manager.updateConversationMemory(conversationId, 'temp_data', 'session_value', false);
      manager.updateConversationMemory(conversationId, 'user_setting', 'persistent_value', true);

      const context = manager.getConversationContext(conversationId);
      expect(context?.conversationMemory.shortTerm).toHaveProperty('temp_data');
      expect(context?.conversationMemory.longTerm).toHaveProperty('user_setting');
    });
  });

  describe('Conversation Statistics and Analytics', () => {
    let context: ConversationContext;

    beforeEach(() => {
      context = manager.initializeConversation(conversationId, sessionId, userId);
      
      // Create multiple turns with tool executions
      for (let i = 1; i <= 3; i++) {
        const userMessage: Message = {
          id: `msg_${i * 2 - 1}`,
          role: 'user',
          content: `User message ${i}`,
          timestamp: Date.now()
        };
        
        const turn = manager.startConversationTurn(conversationId, userMessage);
        
        // Add tool execution to some turns
        if (i <= 2) {
          const toolCall: ToolCall = {
            id: `tool_call_${i}`,
            name: i === 1 ? 'web_search' : 'file_read',
            parameters: { query: `test ${i}` }
          };

          const toolResult: ToolCallResult = {
            id: `tool_call_${i}`,
            name: toolCall.name,
            result: `result ${i}`,
            executionTime: 1000 + i * 500
          };

          manager.addToolExecution(conversationId, turn.turnId, toolCall, toolResult, userMessage.id);
        }

        const assistantMessage: Message = {
          id: `msg_${i * 2}`,
          role: 'assistant',
          content: `Assistant response ${i}`,
          timestamp: Date.now()
        };

        manager.completeConversationTurn(conversationId, turn.turnId, assistantMessage);
      }
    });

    it('should provide conversation statistics', () => {
      const stats = manager.getConversationStats(conversationId);

      expect(stats.totalTurns).toBe(3);
      expect(stats.completedTurns).toBe(3);
      expect(stats.totalToolExecutions).toBe(2);
      expect(stats.successfulToolExecutions).toBe(2);
      expect(stats.failedToolExecutions).toBe(0);
      expect(stats.averageToolExecutionTime).toBeGreaterThan(0);
      expect(stats.mostUsedTools).toHaveLength(2);
      expect(stats.mostUsedTools[0].count).toBe(1);
    });
  });

  describe('Conversation Persistence', () => {
    let context: ConversationContext;

    beforeEach(() => {
      context = manager.initializeConversation(conversationId, sessionId, userId);
      
      // Create a conversation with some content
      const userMessage: Message = {
        id: 'msg_1',
        role: 'user',
        content: 'Test message',
        timestamp: Date.now()
      };
      const turn = manager.startConversationTurn(conversationId, userMessage);
      
      const assistantMessage: Message = {
        id: 'msg_2',
        role: 'assistant',
        content: 'Test response',
        timestamp: Date.now()
      };
      manager.completeConversationTurn(conversationId, turn.turnId, assistantMessage);
    });

    it('should export conversation data', () => {
      const exportData = manager.exportConversation(conversationId);

      expect(exportData).toBeDefined();
      expect(exportData.conversationId).toBe(conversationId);
      expect(exportData.sessionId).toBe(sessionId);
      expect(exportData.userId).toBe(userId);
      expect(exportData.turns).toHaveLength(1);
      expect(exportData.exportedAt).toBeGreaterThan(0);
    });

    it('should import conversation data', () => {
      const exportData = manager.exportConversation(conversationId);
      manager.clearConversation(conversationId);

      const importSuccess = manager.importConversation(exportData);
      expect(importSuccess).toBe(true);

      const restoredContext = manager.getConversationContext(conversationId);
      expect(restoredContext).toBeDefined();
      expect(restoredContext?.turns).toHaveLength(1);
    });

    it('should handle invalid import data', () => {
      const invalidData = { invalid: 'data' };
      const importSuccess = manager.importConversation(invalidData);
      expect(importSuccess).toBe(false);
    });
  });

  describe('Configuration and Limits', () => {
    it('should respect history length limits', () => {
      const limitedManager = new ToolAwareConversationManager({
        maxHistoryLength: 2,
        maxToolExecutionsPerTurn: 1
      });

      const context = limitedManager.initializeConversation(conversationId, sessionId, userId);

      // Create more turns than the limit
      for (let i = 1; i <= 4; i++) {
        const userMessage: Message = {
          id: `msg_${i}`,
          role: 'user',
          content: `Message ${i}`,
          timestamp: Date.now()
        };
        const turn = limitedManager.startConversationTurn(conversationId, userMessage);
        
        const assistantMessage: Message = {
          id: `msg_${i}_response`,
          role: 'assistant',
          content: `Response ${i}`,
          timestamp: Date.now()
        };
        limitedManager.completeConversationTurn(conversationId, turn.turnId, assistantMessage);
      }

      const finalContext = limitedManager.getConversationContext(conversationId);
      expect(finalContext?.turns.length).toBeLessThanOrEqual(2);
    });
  });
});