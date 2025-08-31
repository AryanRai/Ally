/**
 * Integration tests for useIntegratedToolAwareConversation hook
 * Requirements: 15.1, 3.3
 * 
 * Tests React hook integration for tool-aware conversation management
 * Tests hook state management and service integration
 * Tests multi-turn conversation support with tool execution context
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useIntegratedToolAwareConversation } from '../useIntegratedToolAwareConversation';
import { OllamaService } from '../../services/ollamaService';
import { Message } from '../../types/chat';

// Mock the service dependencies
vi.mock('../../services/ollamaService');
vi.mock('../../services/toolCallingService');
vi.mock('../../utils/toolAwareConversationManager');
vi.mock('../../services/toolAwareIntegrationService');
vi.mock('../../../tool-calling-framework/src/manager/ToolManager');
vi.mock('../../../tool-calling-framework/src/registry/ToolRegistry');
vi.mock('../../../tool-calling-framework/src/executor/ToolExecutor');

describe('useIntegratedToolAwareConversation', () => {
  let mockOllamaService: OllamaService;
  const conversationId = 'test_conversation_1';

  beforeEach(() => {
    mockOllamaService = {
      chat: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
      getModels: vi.fn().mockResolvedValue([]),
      getConfig: vi.fn().mockReturnValue({}),
      updateConfig: vi.fn()
    } as any;

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Hook Initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() =>
        useIntegratedToolAwareConversation(conversationId, mockOllamaService)
      );

      expect(result.current.state.isInitialized).toBe(false);
      expect(result.current.state.isProcessing).toBe(false);
      expect(result.current.state.currentContext).toBe(null);
      expect(result.current.state.lastProcessingResult).toBe(null);
      expect(result.current.state.processingProgress).toBe(null);
      expect(result.current.state.availableTools).toEqual([]);
      expect(result.current.state.conversationStats).toBe(null);
    });

    it('should initialize with custom configuration', () => {
      const config = {
        sessionId: 'custom_session',
        userId: 'custom_user',
        enableToolCalling: false,
        maxToolCalls: 3,
        availableTools: ['web_search', 'file_read']
      };

      const { result } = renderHook(() =>
        useIntegratedToolAwareConversation(conversationId, mockOllamaService, config)
      );

      expect(result.current.config.sessionId).toBe('custom_session');
      expect(result.current.config.userId).toBe('custom_user');
      expect(result.current.config.enableToolCalling).toBe(false);
      expect(result.current.config.maxToolCalls).toBe(3);
      expect(result.current.config.availableTools).toEqual(['web_search', 'file_read']);
    });

    it('should handle initialization without Ollama service', () => {
      const { result } = renderHook(() =>
        useIntegratedToolAwareConversation(conversationId, null as any)
      );

      expect(result.current.state.isInitialized).toBe(false);
    });
  });

  describe('Service Integration', () => {
    it('should initialize services when Ollama service is available', async () => {
      const { result } = renderHook(() =>
        useIntegratedToolAwareConversation(conversationId, mockOllamaService)
      );

      // Wait for initialization to complete
      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      }, { timeout: 5000 });

      expect(result.current.integrationService).toBeDefined();
      expect(result.current.toolCallingService).toBeDefined();
      expect(result.current.conversationManager).toBeDefined();
    });

    it('should handle service initialization errors', async () => {
      // Mock console.error to avoid test output noise
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Create a mock that throws during initialization
      const failingOllamaService = {
        ...mockOllamaService,
        isAvailable: vi.fn().mockRejectedValue(new Error('Service unavailable'))
      };

      const { result } = renderHook(() =>
        useIntegratedToolAwareConversation(conversationId, failingOllamaService)
      );

      // Wait a bit to allow initialization attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(result.current.state.isInitialized).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize integrated services'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Conversation ID Changes', () => {
    it('should handle conversation ID changes', async () => {
      const { result, rerender } = renderHook(
        ({ convId }) => useIntegratedToolAwareConversation(convId, mockOllamaService),
        { initialProps: { convId: 'conversation_1' } }
      );

      // Wait for initial initialization
      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      const initialContext = result.current.state.currentContext;

      // Change conversation ID
      rerender({ convId: 'conversation_2' });

      await waitFor(() => {
        expect(result.current.state.currentContext).not.toBe(initialContext);
      });

      expect(result.current.state.lastProcessingResult).toBe(null);
      expect(result.current.state.processingProgress).toBe(null);
    });
  });

  describe('Message Processing', () => {
    let hookResult: any;

    beforeEach(async () => {
      const { result } = renderHook(() =>
        useIntegratedToolAwareConversation(conversationId, mockOllamaService)
      );

      // Wait for initialization
      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      hookResult = result;
    });

    it('should process messages with tool awareness', async () => {
      const messages: Message[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Hello',
          timestamp: Date.now()
        }
      ];

      const mockResult = {
        response: 'Hello! How can I help you?',
        toolCalls: [],
        toolResults: [],
        conversationTurn: {
          turnId: 'turn_1',
          userMessage: messages[0],
          toolExecutions: [],
          startTime: Date.now(),
          status: 'completed'
        },
        toolExecutions: []
      };

      // Mock the integration service method
      if (hookResult.current.integrationService) {
        hookResult.current.integrationService.processMessageWithToolAwareness = vi.fn()
          .mockResolvedValue(mockResult);
        hookResult.current.integrationService.getIntegratedConversationStats = vi.fn()
          .mockReturnValue({ conversation: {}, tools: {}, integration: {} });
      }

      let progressUpdates: any[] = [];
      let result: any;

      await act(async () => {
        result = await hookResult.current.processMessage(
          messages,
          'How are you?',
          undefined,
          (progress: any) => progressUpdates.push(progress)
        );
      });

      expect(result).toEqual(mockResult);
      expect(hookResult.current.state.isProcessing).toBe(false);
      expect(hookResult.current.state.lastProcessingResult).toEqual(mockResult);
    });

    it('should handle processing errors', async () => {
      const messages: Message[] = [];

      // Mock the integration service to throw an error
      if (hookResult.current.integrationService) {
        hookResult.current.integrationService.processMessageWithToolAwareness = vi.fn()
          .mockRejectedValue(new Error('Processing failed'));
      }

      await act(async () => {
        await expect(
          hookResult.current.processMessage(messages, 'Test message')
        ).rejects.toThrow('Processing failed');
      });

      expect(hookResult.current.state.isProcessing).toBe(false);
      expect(hookResult.current.state.processingProgress).toBe(null);
    });

    it('should throw error when not initialized', async () => {
      const { result } = renderHook(() =>
        useIntegratedToolAwareConversation(conversationId, mockOllamaService)
      );

      // Don't wait for initialization
      await act(async () => {
        await expect(
          result.current.processMessage([], 'Test message')
        ).rejects.toThrow('Integration service not initialized');
      });
    });
  });

  describe('Tool-Aware Message Retrieval', () => {
    let hookResult: any;

    beforeEach(async () => {
      const { result } = renderHook(() =>
        useIntegratedToolAwareConversation(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      hookResult = result;
    });

    it('should get tool-aware messages', () => {
      const mockMessages = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Hello',
          toolExecutions: []
        }
      ];

      if (hookResult.current.integrationService) {
        hookResult.current.integrationService.getToolAwareMessagesForLLM = vi.fn()
          .mockReturnValue(mockMessages);
      }

      const messages = hookResult.current.getToolAwareMessages(true);

      expect(messages).toEqual(mockMessages);
    });

    it('should get recent tool context', () => {
      const mockContext = {
        recentExecutions: [],
        successfulTools: ['web_search'],
        failedTools: [],
        toolResults: {}
      };

      if (hookResult.current.integrationService) {
        hookResult.current.integrationService.getRecentToolContext = vi.fn()
          .mockReturnValue(mockContext);
      }

      const context = hookResult.current.getRecentToolContext(5);

      expect(context).toEqual(mockContext);
    });
  });

  describe('Memory Management', () => {
    let hookResult: any;

    beforeEach(async () => {
      const { result } = renderHook(() =>
        useIntegratedToolAwareConversation(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      hookResult = result;
    });

    it('should update memory', () => {
      if (hookResult.current.integrationService) {
        hookResult.current.integrationService.updateToolAwareMemory = vi.fn();
      }

      hookResult.current.updateMemory('test_key', 'test_value', true);

      expect(hookResult.current.integrationService.updateToolAwareMemory)
        .toHaveBeenCalledWith(conversationId, 'test_key', 'test_value', true);
    });
  });

  describe('Statistics and Analytics', () => {
    let hookResult: any;

    beforeEach(async () => {
      const { result } = renderHook(() =>
        useIntegratedToolAwareConversation(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      hookResult = result;
    });

    it('should get conversation statistics', () => {
      const mockStats = {
        conversation: { totalTurns: 5 },
        tools: { totalExecutions: 3 },
        integration: { toolSuccessRate: 0.9 }
      };

      if (hookResult.current.integrationService) {
        hookResult.current.integrationService.getIntegratedConversationStats = vi.fn()
          .mockReturnValue(mockStats);
      }

      const stats = hookResult.current.getConversationStats();

      expect(stats).toEqual(mockStats);
    });
  });

  describe('Data Persistence', () => {
    let hookResult: any;

    beforeEach(async () => {
      const { result } = renderHook(() =>
        useIntegratedToolAwareConversation(conversationId, mockOllamaService)
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      hookResult = result;
    });

    it('should export conversation', () => {
      const mockExportData = {
        conversation: { conversationId },
        toolContext: {},
        toolStats: {},
        exportedAt: Date.now()
      };

      if (hookResult.current.integrationService) {
        hookResult.current.integrationService.exportIntegratedConversation = vi.fn()
          .mockReturnValue(mockExportData);
      }

      const exportData = hookResult.current.exportConversation();

      expect(exportData).toEqual(mockExportData);
    });

    it('should import conversation', () => {
      const importData = {
        conversation: { conversationId: 'imported_conv' },
        toolContext: {},
        toolStats: {}
      };

      const mockContext = {
        conversationId: 'imported_conv',
        sessionId: 'session',
        userId: 'user',
        toolContext: {},
        conversationContext: {}
      };

      if (hookResult.current.integrationService) {
        hookResult.current.integrationService.importIntegratedConversation = vi.fn()
          .mockReturnValue(true);
        hookResult.current.integrationService.getIntegratedContext = vi.fn()
          .mockReturnValue(mockContext);
        hookResult.current.integrationService.getIntegratedConversationStats = vi.fn()
          .mockReturnValue({});
      }

      const success = hookResult.current.importConversation(importData);

      expect(success).toBe(true);
      expect(hookResult.current.state.currentContext).toEqual(mockContext);
    });
  });

  describe('Utility Functions', () => {
    let hookResult: any;

    beforeEach(async () => {
      const { result } = renderHook(() =>
        useIntegratedToolAwareConversation(conversationId, mockOllamaService, {
          availableTools: ['web_search', 'file_read']
        })
      );

      await waitFor(() => {
        expect(result.current.state.isInitialized).toBe(true);
      });

      hookResult = result;
    });

    it('should check if tool calling is enabled', () => {
      expect(hookResult.current.isToolCallingEnabled()).toBe(true);
    });

    it('should get available tools', () => {
      // Mock the state to have available tools
      act(() => {
        hookResult.current.state.availableTools = ['web_search', 'file_read'];
      });

      const tools = hookResult.current.getAvailableTools();
      expect(tools).toEqual(['web_search', 'file_read']);
    });

    it('should check if conversation has tool context', () => {
      // Mock context with tool execution history
      const mockContext = {
        conversationId,
        sessionId: 'session',
        userId: 'user',
        toolContext: {},
        conversationContext: {
          toolExecutionHistory: [{ id: 'exec_1' }]
        }
      };

      act(() => {
        hookResult.current.state.currentContext = mockContext;
      });

      expect(hookResult.current.hasToolContext()).toBe(true);
    });

    it('should get processing status', () => {
      const mockProgress = {
        type: 'thinking',
        content: 'Processing...',
        isComplete: false
      };

      const mockResult = {
        response: 'Done',
        toolCalls: [],
        toolResults: [],
        conversationTurn: {},
        toolExecutions: []
      };

      act(() => {
        hookResult.current.state.isProcessing = true;
        hookResult.current.state.processingProgress = mockProgress;
        hookResult.current.state.lastProcessingResult = mockResult;
      });

      const status = hookResult.current.getProcessingStatus();

      expect(status.isProcessing).toBe(true);
      expect(status.progress).toEqual(mockProgress);
      expect(status.lastResult).toEqual(mockResult);
    });

    it('should clear conversation', () => {
      if (hookResult.current.integrationService) {
        hookResult.current.integrationService.clearIntegratedConversation = vi.fn();
        hookResult.current.integrationService.initializeIntegratedContext = vi.fn()
          .mockReturnValue({
            conversationId,
            sessionId: 'session',
            userId: 'user',
            toolContext: {},
            conversationContext: {}
          });
      }

      hookResult.current.clearConversation();

      expect(hookResult.current.integrationService.clearIntegratedConversation)
        .toHaveBeenCalledWith(conversationId);
      expect(hookResult.current.state.lastProcessingResult).toBe(null);
      expect(hookResult.current.state.processingProgress).toBe(null);
    });
  });
});