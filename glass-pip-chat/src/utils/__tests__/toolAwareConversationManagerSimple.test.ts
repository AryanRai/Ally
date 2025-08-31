/**
 * Simple integration tests for Tool-Aware Conversation Manager
 * Requirements: 15.1, 3.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolAwareConversationManager } from '../toolAwareConversationManager';

describe('ToolAwareConversationManager - Basic Tests', () => {
  let manager: ToolAwareConversationManager;
  const conversationId = 'test_conversation_1';
  const sessionId = 'test_session_1';
  const userId = 'test_user_1';

  beforeEach(() => {
    manager = new ToolAwareConversationManager({
      maxHistoryLength: 10,
      maxToolExecutionsPerTurn: 5,
      enableToolContextPersistence: true,
      enableConversationMemory: true
    });
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
    beforeEach(() => {
      manager.initializeConversation(conversationId, sessionId, userId);
    });

    it('should start a new conversation turn', () => {
      const userMessage = {
        id: 'msg_1',
        role: 'user' as const,
        content: 'Hello, can you help me with a task?',
        timestamp: Date.now()
      };

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
      const userMessage = {
        id: 'msg_1',
        role: 'user' as const,
        content: 'Hello, can you help me with a task?',
        timestamp: Date.now()
      };

      const turn = manager.startConversationTurn(conversationId, userMessage);
      const assistantMessage = {
        id: 'msg_2',
        role: 'assistant' as const,
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
  });

  describe('Tool Execution Integration', () => {
    beforeEach(() => {
      manager.initializeConversation(conversationId, sessionId, userId);
    });

    it('should add tool execution to conversation turn', () => {
      const userMessage = {
        id: 'msg_1',
        role: 'user' as const,
        content: 'Can you search for information about TypeScript?',
        timestamp: Date.now()
      };

      const turn = manager.startConversationTurn(conversationId, userMessage);

      const toolCall = {
        id: 'tool_call_1',
        name: 'web_search',
        parameters: { query: 'TypeScript programming language' }
      };

      const toolResult = {
        id: 'tool_call_1',
        name: 'web_search',
        result: { 
          title: 'TypeScript - JavaScript with syntax for types',
          summary: 'TypeScript is a strongly typed programming language...'
        },
        executionTime: 1500
      };

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
      const toolCall = {
        id: 'tool_call_1',
        name: 'web_search',
        parameters: { query: 'TypeScript' }
      };

      manager.registerActiveToolCall(conversationId, toolCall);

      const context = manager.getConversationContext(conversationId);
      expect(context?.activeToolCalls.has(toolCall.id)).toBe(true);
      expect(context?.activeToolCalls.get(toolCall.id)).toEqual(toolCall);
    });
  });

  describe('Memory Management', () => {
    beforeEach(() => {
      manager.initializeConversation(conversationId, sessionId, userId);
    });

    it('should update and retrieve conversation memory', () => {
      manager.updateConversationMemory(conversationId, 'user_preference', 'dark_theme', false);
      manager.updateConversationMemory(conversationId, 'session_info', 'first_visit', true);

      const preference = manager.getConversationMemory(conversationId, 'user_preference');
      const sessionInfo = manager.getConversationMemory(conversationId, 'session_info');

      expect(preference).toBe('dark_theme');
      expect(sessionInfo).toBe('first_visit');
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      manager.initializeConversation(conversationId, sessionId, userId);
    });

    it('should provide conversation statistics', () => {
      const stats = manager.getConversationStats(conversationId);

      expect(stats).toBeDefined();
      expect(stats.totalTurns).toBe(0);
      expect(stats.completedTurns).toBe(0);
      expect(stats.totalToolExecutions).toBe(0);
      expect(stats.successfulToolExecutions).toBe(0);
      expect(stats.failedToolExecutions).toBe(0);
      expect(stats.averageToolExecutionTime).toBe(0);
      expect(stats.mostUsedTools).toEqual([]);
    });
  });
});