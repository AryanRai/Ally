/**
 * Unit tests for useToolCalling Hook
 * Requirements: 10.1, 10.2
 * 
 * Tests hook initialization, tool call execution, conversation context management,
 * and integration with tool calling service
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useToolCalling } from '../useToolCalling';
import { OllamaService } from '../../services/ollamaService';
import { ToolCallingService } from '../../services/toolCallingService';
import { Message } from '../../types/chat';

// Mock dependencies
vi.mock('../../services/ollamaService');
vi.mock('../../services/toolCallingService');
vi.mock('../../../tool-calling-framework/src/manager/ToolManager');
vi.mock('../../../tool-calling-framework/src/registry/ToolRegistry');
vi.mock('../../../tool-calling-framework/src/executor/ToolExecutor');

describe('useToolCalling', () => {
  let mockOllamaService: vi.Mocked<OllamaService>;
  let mockToolCallingService: vi.Mocked<ToolCallingService>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock Ollama service
    mockOllamaService = {
      chat: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
      getModels: vi.fn().mockResolvedValue([]),
      generate: vi.fn(),
      updateConfig: vi.fn(),
      getConfig: vi.fn()
    } as any;

    // Create mock tool calling service
    mockToolCallingService = {
      chatWithTools: vi.fn(),
      updateConfig: vi.fn(),
      getConfig: vi.fn(),
      getToolExecutionStats: vi.fn().mockReturnValue({
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        mostUsedTools: []
      })
    } as any;

    // Mock constructors to return our mocked instances
    vi.mocked(ToolCallingService).mockImplementation(() => mockToolCallingService as any);
  });

  describe('Hook Initialization', () => {
    it('should initialize with default configuration', () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      expect(result.current.state.isEnabled).toBe(true);
      expect(result.current.state.isExecutingTools).toBe(false);
      expect(result.current.state.currentToolCalls).toEqual([]);
      expect(result.current.state.currentToolResults).toEqual([]);
      expect(result.current.state.executionHistory).toEqual([]);
      expect(result.current.config.enableToolCalling).toBe(true);
      expect(result.current.config.maxToolCalls).toBe(5);
    });

    it('should initialize with custom configuration', () => {
      const customConfig = {
        enableToolCalling: false,
        maxToolCalls: 10,
        toolCallTimeout: 60000,
        userId: 'custom_user'
      };

      const { result } = renderHook(() => useToolCalling(mockOllamaService, customConfig));

      expect(result.current.state.isEnabled).toBe(false);
      expect(result.current.config.maxToolCalls).toBe(10);
      expect(result.current.config.toolCallTimeout).toBe(60000);
      expect(result.current.config.userId).toBe('custom_user');
    });

    it('should initialize conversation context', async () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      await waitFor(() => {
        expect(result.current.state.conversationContext).toBeTruthy();
      });

      const context = result.current.state.conversationContext!;
      expect(context.sessionId).toMatch(/^session_/);
      expect(context.conversationId).toMatch(/^conv_/);
      expect(context.toolExecutionHistory).toEqual([]);
      expect(context.environment).toBeDefined();
    });
  });

  describe('Tool Calling Integration', () => {
    it('should send message with tools successfully', async () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      const mockResponse = {
        response: 'Tool executed successfully',
        toolCalls: [{
          id: 'tool_1',
          name: 'test_tool',
          parameters: { input: 'test' }
        }],
        toolResults: [{
          id: 'tool_1',
          name: 'test_tool',
          result: 'Tool result',
          executionTime: 100
        }]
      };

      mockToolCallingService.chatWithTools.mockResolvedValue(mockResponse);

      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Previous message', timestamp: Date.now() }
      ];

      let progressUpdates: any[] = [];
      const onProgress = (progress: any) => {
        progressUpdates.push(progress);
      };

      await act(async () => {
        const result_value = await result.current.sendMessageWithTools(
          messages,
          'Use a tool to help me',
          onProgress
        );

        expect(result_value).toEqual(mockResponse);
      });

      expect(mockToolCallingService.chatWithTools).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Previous message' }),
          expect.objectContaining({ role: 'user', content: 'Use a tool to help me' })
        ]),
        expect.objectContaining({
          sessionId: expect.stringMatching(/^session_/),
          conversationId: expect.stringMatching(/^conv_/)
        }),
        undefined,
        expect.any(Function)
      );

      // Check that state was updated
      expect(result.current.state.currentToolCalls).toEqual(mockResponse.toolCalls);
      expect(result.current.state.currentToolResults).toEqual(mockResponse.toolResults);
      expect(result.current.state.executionHistory).toEqual(mockResponse.toolResults);
      expect(result.current.state.isExecutingTools).toBe(false);
    });

    it('should handle tool calling service errors', async () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      mockToolCallingService.chatWithTools.mockRejectedValue(new Error('Service error'));

      const messages: Message[] = [];

      await act(async () => {
        await expect(result.current.sendMessageWithTools(messages, 'Test message'))
          .rejects.toThrow('Service error');
      });

      expect(result.current.state.isExecutingTools).toBe(false);
    });

    it('should update state during tool execution progress', async () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      const mockResponse = {
        response: 'Final response',
        toolCalls: [{ id: 'tool_1', name: 'test_tool', parameters: {} }],
        toolResults: [{ id: 'tool_1', name: 'test_tool', result: 'result', executionTime: 100 }]
      };

      // Mock the progress callback behavior
      mockToolCallingService.chatWithTools.mockImplementation(async (messages, context, model, onProgress) => {
        // Simulate progress updates
        if (onProgress) {
          onProgress('Thinking...', [], []);
          onProgress('Executing tool...', mockResponse.toolCalls, []);
          onProgress('Tool completed', mockResponse.toolCalls, mockResponse.toolResults);
        }
        return mockResponse;
      });

      const messages: Message[] = [];
      let progressUpdates: any[] = [];

      await act(async () => {
        await result.current.sendMessageWithTools(messages, 'Test', (progress) => {
          progressUpdates.push(progress);
        });
      });

      expect(progressUpdates).toHaveLength(4); // 3 progress + 1 done
      expect(progressUpdates[0].type).toBe('response');
      expect(progressUpdates[1].type).toBe('tool_call');
      expect(progressUpdates[2].type).toBe('tool_result');
      expect(progressUpdates[3].type).toBe('done');
    });
  });

  describe('Manual Tool Execution', () => {
    it('should execute single tool call manually', async () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      await act(async () => {
        const toolResult = await result.current.executeToolCall('test_tool', { input: 'test' });

        expect(toolResult.name).toBe('test_tool');
        expect(toolResult.result).toBeDefined();
        expect(toolResult.executionTime).toBeGreaterThan(0);
      });

      expect(result.current.state.executionHistory).toHaveLength(1);
      expect(result.current.state.isExecutingTools).toBe(false);
    });

    it('should handle manual tool execution errors', async () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      // Mock the service to not be initialized
      result.current.state.conversationContext = null;

      await act(async () => {
        await expect(result.current.executeToolCall('test_tool', {}))
          .rejects.toThrow('Tool calling service not initialized');
      });
    });
  });

  describe('Configuration Management', () => {
    it('should enable and disable tool calling', () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      act(() => {
        result.current.setToolCallingEnabled(false);
      });

      expect(result.current.state.isEnabled).toBe(false);
      expect(result.current.config.enableToolCalling).toBe(false);

      act(() => {
        result.current.setToolCallingEnabled(true);
      });

      expect(result.current.state.isEnabled).toBe(true);
      expect(result.current.config.enableToolCalling).toBe(true);
    });

    it('should update tool configuration', () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      const newConfig = {
        maxToolCalls: 10,
        toolCallTimeout: 60000,
        enableMultiStepReasoning: false
      };

      act(() => {
        result.current.updateToolConfig(newConfig);
      });

      expect(result.current.config.maxToolCalls).toBe(10);
      expect(result.current.config.toolCallTimeout).toBe(60000);
      expect(result.current.config.enableMultiStepReasoning).toBe(false);
    });

    it('should update service configuration when config changes', async () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      // Wait for service initialization
      await waitFor(() => {
        expect(result.current.toolCallingService).toBeTruthy();
      });

      const newConfig = { maxToolCalls: 15 };

      act(() => {
        result.current.updateToolConfig(newConfig);
      });

      expect(mockToolCallingService.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({ maxToolCalls: 15 })
      );
    });
  });

  describe('Conversation Management', () => {
    it('should start new conversation and reset context', () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      // Add some execution history
      act(() => {
        (result.current as any).executionHistoryRef.current = [
          { id: 'old_1', name: 'old_tool', result: 'old_result', executionTime: 100 }
        ];
      });

      const oldConversationId = result.current.state.conversationContext?.conversationId;

      act(() => {
        result.current.startNewConversation();
      });

      expect(result.current.state.conversationContext?.conversationId).not.toBe(oldConversationId);
      expect(result.current.state.executionHistory).toEqual([]);
      expect(result.current.state.currentToolCalls).toEqual([]);
      expect(result.current.state.currentToolResults).toEqual([]);
    });

    it('should clear execution history', () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      // Add some execution history
      act(() => {
        (result.current as any).executionHistoryRef.current = [
          { id: 'test_1', name: 'test_tool', result: 'result', executionTime: 100 }
        ];
      });

      act(() => {
        result.current.clearExecutionHistory();
      });

      expect(result.current.state.executionHistory).toEqual([]);
    });
  });

  describe('Tool Management', () => {
    it('should get available tools', () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      const mockTools = [
        { name: 'tool1', description: 'Tool 1' },
        { name: 'tool2', description: 'Tool 2' }
      ];

      // Mock the registry
      const mockRegistry = {
        getAllTools: vi.fn().mockReturnValue(mockTools)
      };

      // Set the registry in the hook
      act(() => {
        (result.current as any).toolRegistry = mockRegistry;
      });

      const tools = result.current.getAvailableTools();
      expect(tools).toEqual(mockTools);
    });

    it('should register new tools', async () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      const mockRegistry = {
        registerTool: vi.fn().mockResolvedValue(true),
        getAllTools: vi.fn().mockReturnValue([
          { name: 'new_tool', description: 'New tool' }
        ])
      };

      // Set the registry in the hook
      act(() => {
        (result.current as any).toolRegistry = mockRegistry;
      });

      const toolDefinition = { name: 'new_tool', description: 'New tool' };
      const handler = vi.fn();

      await act(async () => {
        const success = await result.current.registerTool(toolDefinition, handler);
        expect(success).toBe(true);
      });

      expect(mockRegistry.registerTool).toHaveBeenCalledWith(toolDefinition, handler);
      expect(result.current.state.availableTools).toContain('new_tool');
    });

    it('should handle tool registration failures', async () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      const mockRegistry = {
        registerTool: vi.fn().mockRejectedValue(new Error('Registration failed')),
        getAllTools: vi.fn().mockReturnValue([])
      };

      act(() => {
        (result.current as any).toolRegistry = mockRegistry;
      });

      await act(async () => {
        const success = await result.current.registerTool({}, vi.fn());
        expect(success).toBe(false);
      });
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should get execution statistics', () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      const stats = result.current.getExecutionStats();

      expect(stats).toEqual({
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        mostUsedTools: []
      });
    });

    it('should return default stats when service not initialized', () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService, { enableToolCalling: false }));

      const stats = result.current.getExecutionStats();

      expect(stats.totalExecutions).toBe(0);
      expect(stats.successfulExecutions).toBe(0);
      expect(stats.failedExecutions).toBe(0);
    });
  });

  describe('Service Instance Access', () => {
    it('should provide access to service instances', async () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService));

      await waitFor(() => {
        expect(result.current.toolCallingService).toBeTruthy();
        expect(result.current.toolManager).toBeTruthy();
        expect(result.current.toolRegistry).toBeTruthy();
        expect(result.current.toolExecutor).toBeTruthy();
      });
    });

    it('should not initialize services when tool calling is disabled', () => {
      const { result } = renderHook(() => useToolCalling(mockOllamaService, { enableToolCalling: false }));

      expect(result.current.toolCallingService).toBeNull();
      expect(result.current.toolManager).toBeNull();
      expect(result.current.toolRegistry).toBeNull();
      expect(result.current.toolExecutor).toBeNull();
    });
  });
});