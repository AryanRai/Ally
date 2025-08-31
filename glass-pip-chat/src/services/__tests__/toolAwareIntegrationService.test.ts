/**
 * Integration tests for Tool-Aware Integration Service
 * Requirements: 15.1, 3.3
 * 
 * Tests integration between tool calling service and conversation management
 * Tests tool result integration into ongoing conversation flow
 * Tests multi-turn conversation support with tool execution context
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolAwareIntegrationService } from '../toolAwareIntegrationService';
import { OllamaService } from '../ollamaService';
import { ToolCallingService } from '../toolCallingService';
import { ToolAwareConversationManager } from '../../utils/toolAwareConversationManager';
import { ToolManager } from '../../../tool-calling-framework/src/manager/ToolManager';
import { ToolRegistry } from '../../../tool-calling-framework/src/registry/ToolRegistry';
import { ToolExecutor } from '../../../tool-calling-framework/src/executor/ToolExecutor';
import { Message } from '../../types/chat';

// Mock the tool framework components
vi.mock('../../../tool-calling-framework/src/manager/ToolManager');
vi.mock('../../../tool-calling-framework/src/registry/ToolRegistry');
vi.mock('../../../tool-calling-framework/src/executor/ToolExecutor');

describe('ToolAwareIntegrationService', () => {
  let integrationService: ToolAwareIntegrationService;
  let mockOllamaService: OllamaService;
  let mockToolCallingService: ToolCallingService;
  let mockConversationManager: ToolAwareConversationManager;
  let mockToolManager: ToolManager;
  let mockToolRegistry: ToolRegistry;
  let mockToolExecutor: ToolExecutor;

  const conversationId = 'test_conversation_1';
  const sessionId = 'test_session_1';
  const userId = 'test_user_1';

  beforeEach(() => {
    // Create mock instances
    mockToolRegistry = new ToolRegistry() as any;
    mockToolExecutor = new ToolExecutor(mockToolRegistry) as any;
    mockToolManager = new ToolManager(mockToolRegistry, mockToolExecutor) as any;

    mockOllamaService = {
      chat: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
      getModels: vi.fn().mockResolvedValue([]),
      getConfig: vi.fn().mockReturnValue({}),
      updateConfig: vi.fn()
    } as any;

    mockToolCallingService = {
      chatWithTools: vi.fn(),
      getToolExecutionStats: vi.fn().mockReturnValue({
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        mostUsedTools: []
      }),
      updateConfig: vi.fn(),
      getConfig: vi.fn().mockReturnValue({})
    } as any;

    mockConversationManager = {
      initializeConversation: vi.fn(),
      startConversationTurn: vi.fn(),
      completeConversationTurn: vi.fn(),
      addToolExecution: vi.fn(),
      getConversationContext: vi.fn(),
      getToolAwareMessages: vi.fn().mockReturnValue([]),
      getRecentToolContext: vi.fn().mockReturnValue({
        recentExecutions: [],
        successfulTools: [],
        failedTools: [],
        toolResults: {}
      }),
      getConversationStats: vi.fn().mockReturnValue({
        totalTurns: 0,
        completedTurns: 0,
        totalToolExecutions: 0,
        successfulToolExecutions: 0,
        failedToolExecutions: 0,
        averageToolExecutionTime: 0,
        mostUsedTools: []
      }),
      updateConversationMemory: vi.fn(),
      exportConversation: vi.fn(),
      importConversation: vi.fn(),
      clearConversation: vi.fn()
    } as any;

    integrationService = new ToolAwareIntegrationService(
      mockOllamaService,
      mockToolCallingService,
      mockConversationManager
    );
  });

  describe('Context Initialization', () => {
    it('should initialize integrated conversation context', () => {
      const mockConversationContext = {
        conversationId,
        sessionId,
        userId,
        turns: [],
        globalToolContext: {},
        toolExecutionHistory: [],
        activeToolCalls: new Map(),
        conversationMemory: { shortTerm: {}, longTerm: {} }
      };

      mockConversationManager.initializeConversation.mockReturnValue(mockConversationContext);

      const context = integrationService.initializeIntegratedContext(
        conversationId,
        sessionId,
        userId,
        ['web_search', 'file_read']
      );

      expect(context).toBeDefined();
      expect(context.conversationId).toBe(conversationId);
      expect(context.sessionId).toBe(sessionId);
      expect(context.userId).toBe(userId);
      expect(context.toolContext.availableTools).toEqual(['web_search', 'file_read']);
      expect(context.conversationContext).toEqual(mockConversationContext);

      expect(mockConversationManager.initializeConversation).toHaveBeenCalledWith(
        conversationId,
        sessionId,
        userId
      );
    });

    it('should retrieve integrated context after initialization', () => {
      const mockConversationContext = {
        conversationId,
        sessionId,
        userId,
        turns: [],
        globalToolContext: {},
        toolExecutionHistory: [],
        activeToolCalls: new Map(),
        conversationMemory: { shortTerm: {}, longTerm: {} }
      };

      mockConversationManager.initializeConversation.mockReturnValue(mockConversationContext);

      integrationService.initializeIntegratedContext(conversationId, sessionId, userId);
      const context = integrationService.getIntegratedContext(conversationId);

      expect(context).toBeDefined();
      expect(context?.conversationId).toBe(conversationId);
    });
  });

  describe('Tool-Aware Message Processing', () => {
    let mockContext: any;
    let messages: Message[];

    beforeEach(() => {
      mockContext = {
        conversationId,
        sessionId,
        userId,
        toolContext: {
          userId,
          sessionId,
          conversationId,
          toolExecutionHistory: [],
          availableTools: ['web_search'],
          environment: {}
        },
        conversationContext: {
          conversationId,
          sessionId,
          userId,
          turns: [],
          globalToolContext: {},
          toolExecutionHistory: [],
          activeToolCalls: new Map(),
          conversationMemory: { shortTerm: {}, longTerm: {} }
        }
      };

      messages = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Hello',
          timestamp: Date.now()
        }
      ];

      // Mock initialization
      mockConversationManager.initializeConversation.mockReturnValue(mockContext.conversationContext);
      integrationService.initializeIntegratedContext(conversationId, sessionId, userId, ['web_search']);
    });

    it('should process message with tool awareness', async () => {
      const mockTurn = {
        turnId: 'turn_1',
        userMessage: {
          id: 'msg_2',
          role: 'user',
          content: 'Search for TypeScript information',
          timestamp: Date.now()
        },
        toolExecutions: [],
        startTime: Date.now(),
        status: 'in_progress'
      };

      const mockToolResult = {
        response: 'I found information about TypeScript.',
        toolCalls: [{
          id: 'tool_1',
          name: 'web_search',
          parameters: { query: 'TypeScript' }
        }],
        toolResults: [{
          id: 'tool_1',
          name: 'web_search',
          result: { summary: 'TypeScript is a typed superset of JavaScript' },
          executionTime: 1000
        }]
      };

      const mockExecution = {
        id: 'exec_1',
        toolCall: mockToolResult.toolCalls[0],
        result: mockToolResult.toolResults[0],
        timestamp: Date.now(),
        messageId: 'msg_2',
        conversationTurn: 'turn_1'
      };

      mockConversationManager.startConversationTurn.mockReturnValue(mockTurn);
      mockToolCallingService.chatWithTools.mockResolvedValue(mockToolResult);
      mockConversationManager.addToolExecution.mockReturnValue(mockExecution);
      mockConversationManager.getConversationContext.mockReturnValue(mockContext.conversationContext);

      const progressUpdates: any[] = [];
      const result = await integrationService.processMessageWithToolAwareness(
        conversationId,
        messages,
        'Search for TypeScript information',
        undefined,
        (progress) => progressUpdates.push(progress)
      );

      expect(result).toBeDefined();
      expect(result.response).toBe('I found information about TypeScript.');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolResults).toHaveLength(1);
      expect(result.toolExecutions).toHaveLength(1);

      expect(mockConversationManager.startConversationTurn).toHaveBeenCalled();
      expect(mockToolCallingService.chatWithTools).toHaveBeenCalled();
      expect(mockConversationManager.addToolExecution).toHaveBeenCalled();
      expect(mockConversationManager.completeConversationTurn).toHaveBeenCalled();

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0].type).toBe('thinking');
      expect(progressUpdates[progressUpdates.length - 1].type).toBe('done');
    });

    it('should handle processing errors gracefully', async () => {
      const mockTurn = {
        turnId: 'turn_1',
        userMessage: {
          id: 'msg_2',
          role: 'user',
          content: 'Test message',
          timestamp: Date.now()
        },
        toolExecutions: [],
        startTime: Date.now(),
        status: 'in_progress'
      };

      mockConversationManager.startConversationTurn.mockReturnValue(mockTurn);
      mockToolCallingService.chatWithTools.mockRejectedValue(new Error('Tool execution failed'));

      await expect(
        integrationService.processMessageWithToolAwareness(
          conversationId,
          messages,
          'Test message'
        )
      ).rejects.toThrow('Tool execution failed');

      expect(mockConversationManager.completeConversationTurn).toHaveBeenCalledWith(
        conversationId,
        mockTurn.turnId,
        expect.objectContaining({
          content: expect.stringContaining('Error: Tool execution failed')
        })
      );
    });

    it('should handle missing context error', async () => {
      await expect(
        integrationService.processMessageWithToolAwareness(
          'nonexistent_conversation',
          messages,
          'Test message'
        )
      ).rejects.toThrow('Conversation context not found');
    });
  });

  describe('Tool-Aware Message Generation', () => {
    beforeEach(() => {
      const mockContext = {
        conversationId,
        sessionId,
        userId,
        toolContext: { availableTools: ['web_search'] },
        conversationContext: {}
      };

      mockConversationManager.initializeConversation.mockReturnValue(mockContext.conversationContext);
      integrationService.initializeIntegratedContext(conversationId, sessionId, userId);
    });

    it('should get tool-aware messages for LLM context', () => {
      const mockMessages = [
        {
          id: 'sys_1',
          role: 'system',
          content: 'Tool context information',
          toolContext: {
            availableTools: ['web_search'],
            executionHistory: [],
            conversationContext: {}
          }
        },
        {
          id: 'msg_1',
          role: 'user',
          content: 'Hello',
          conversationTurn: 'turn_1'
        }
      ];

      mockConversationManager.getToolAwareMessages.mockReturnValue(mockMessages);

      const messages = integrationService.getToolAwareMessagesForLLM(conversationId, true);

      expect(messages).toEqual(mockMessages);
      expect(mockConversationManager.getToolAwareMessages).toHaveBeenCalledWith(
        conversationId,
        true
      );
    });

    it('should get recent tool context', () => {
      const mockToolContext = {
        recentExecutions: [{
          id: 'exec_1',
          toolCall: { id: 'tool_1', name: 'web_search', parameters: {} },
          result: { result: 'search results', executionTime: 1000 },
          timestamp: Date.now(),
          messageId: 'msg_1',
          conversationTurn: 'turn_1'
        }],
        successfulTools: ['web_search'],
        failedTools: [],
        toolResults: { web_search: 'search results' }
      };

      mockConversationManager.getRecentToolContext.mockReturnValue(mockToolContext);

      const context = integrationService.getRecentToolContext(conversationId, 5);

      expect(context).toEqual(mockToolContext);
      expect(mockConversationManager.getRecentToolContext).toHaveBeenCalledWith(
        conversationId,
        5
      );
    });
  });

  describe('Statistics and Analytics', () => {
    beforeEach(() => {
      const mockContext = {
        conversationId,
        sessionId,
        userId,
        toolContext: { availableTools: [] },
        conversationContext: {
          turns: [
            { toolExecutions: [{ id: 'exec_1' }] },
            { toolExecutions: [] },
            { toolExecutions: [{ id: 'exec_2' }, { id: 'exec_3' }] }
          ]
        }
      };

      mockConversationManager.initializeConversation.mockReturnValue(mockContext.conversationContext);
      integrationService.initializeIntegratedContext(conversationId, sessionId, userId);
    });

    it('should get integrated conversation statistics', () => {
      const mockConversationStats = {
        totalTurns: 3,
        completedTurns: 3,
        totalToolExecutions: 3,
        successfulToolExecutions: 3,
        failedToolExecutions: 0,
        averageToolExecutionTime: 1200,
        mostUsedTools: [{ name: 'web_search', count: 2 }]
      };

      const mockToolStats = {
        totalExecutions: 3,
        successfulExecutions: 3,
        failedExecutions: 0,
        averageExecutionTime: 1200,
        mostUsedTools: [{ name: 'web_search', count: 2 }]
      };

      mockConversationManager.getConversationStats.mockReturnValue(mockConversationStats);
      mockToolCallingService.getToolExecutionStats.mockReturnValue(mockToolStats);

      const stats = integrationService.getIntegratedConversationStats(conversationId);

      expect(stats).toBeDefined();
      expect(stats?.conversation).toEqual(mockConversationStats);
      expect(stats?.tools).toEqual(mockToolStats);
      expect(stats?.integration.totalTurnsWithTools).toBe(2);
      expect(stats?.integration.averageToolsPerTurn).toBe(1);
      expect(stats?.integration.toolSuccessRate).toBe(1);
    });
  });

  describe('Memory Management', () => {
    beforeEach(() => {
      const mockContext = {
        conversationId,
        sessionId,
        userId,
        toolContext: { availableTools: [] },
        conversationContext: {}
      };

      mockConversationManager.initializeConversation.mockReturnValue(mockContext.conversationContext);
      integrationService.initializeIntegratedContext(conversationId, sessionId, userId);
    });

    it('should update tool-aware memory', () => {
      integrationService.updateToolAwareMemory(conversationId, 'test_key', 'test_value', true);

      expect(mockConversationManager.updateConversationMemory).toHaveBeenCalledWith(
        conversationId,
        'test_key',
        'test_value',
        true
      );
    });
  });

  describe('Data Persistence', () => {
    let mockContext: any;

    beforeEach(() => {
      mockContext = {
        conversationId,
        sessionId,
        userId,
        toolContext: { availableTools: ['web_search'] },
        conversationContext: {
          conversationId,
          sessionId,
          userId,
          turns: [],
          toolExecutionHistory: []
        }
      };

      mockConversationManager.initializeConversation.mockReturnValue(mockContext.conversationContext);
      integrationService.initializeIntegratedContext(conversationId, sessionId, userId);
    });

    it('should export integrated conversation data', () => {
      const mockConversationData = {
        conversationId,
        sessionId,
        userId,
        turns: [],
        toolExecutionHistory: [],
        exportedAt: Date.now()
      };

      const mockToolStats = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        mostUsedTools: []
      };

      mockConversationManager.exportConversation.mockReturnValue(mockConversationData);
      mockToolCallingService.getToolExecutionStats.mockReturnValue(mockToolStats);

      const exportData = integrationService.exportIntegratedConversation(conversationId);

      expect(exportData).toBeDefined();
      expect(exportData?.conversation).toEqual(mockConversationData);
      expect(exportData?.toolContext).toEqual(mockContext.toolContext);
      expect(exportData?.toolStats).toEqual(mockToolStats);
      expect(exportData?.exportedAt).toBeGreaterThan(0);
    });

    it('should import integrated conversation data', () => {
      const importData = {
        conversation: {
          conversationId: 'imported_conv',
          sessionId: 'imported_session',
          userId: 'imported_user',
          turns: [],
          toolExecutionHistory: []
        },
        toolContext: {
          availableTools: ['file_read'],
          toolExecutionHistory: []
        },
        toolStats: {},
        exportedAt: Date.now()
      };

      mockConversationManager.importConversation.mockReturnValue(true);
      mockConversationManager.getConversationContext.mockReturnValue(importData.conversation);

      const success = integrationService.importIntegratedConversation(importData);

      expect(success).toBe(true);
      expect(mockConversationManager.importConversation).toHaveBeenCalledWith(importData.conversation);
    });

    it('should handle invalid import data', () => {
      const invalidData = { invalid: 'data' };
      const success = integrationService.importIntegratedConversation(invalidData);

      expect(success).toBe(false);
    });
  });

  describe('Context Management', () => {
    it('should clear integrated conversation', () => {
      const mockContext = {
        conversationId,
        sessionId,
        userId,
        toolContext: { availableTools: [] },
        conversationContext: {}
      };

      mockConversationManager.initializeConversation.mockReturnValue(mockContext.conversationContext);
      integrationService.initializeIntegratedContext(conversationId, sessionId, userId);

      integrationService.clearIntegratedConversation(conversationId);

      expect(mockConversationManager.clearConversation).toHaveBeenCalledWith(conversationId);
      expect(integrationService.getIntegratedContext(conversationId)).toBeUndefined();
    });
  });
});