/**
 * Unit tests for Tool Calling Service
 * Requirements: 10.1, 10.2
 * 
 * Tests tool call parsing, validation, execution integration, and LLM response handling
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { ToolCallingService, ToolCall, ConversationContext } from '../toolCallingService';
import { OllamaService } from '../ollamaService';
import { ToolManager } from '../../../tool-calling-framework/src/manager/ToolManager';
import { ToolRegistry } from '../../../tool-calling-framework/src/registry/ToolRegistry';
import { ToolExecutor } from '../../../tool-calling-framework/src/executor/ToolExecutor';
import { ToolDefinition, SecurityLevel, ExecutionStatus } from '../../../tool-calling-framework/src/types/index';

// Mock dependencies
vi.mock('../ollamaService');
vi.mock('../../../tool-calling-framework/src/manager/ToolManager');
vi.mock('../../../tool-calling-framework/src/registry/ToolRegistry');
vi.mock('../../../tool-calling-framework/src/executor/ToolExecutor');

describe('ToolCallingService', () => {
  let toolCallingService: ToolCallingService;
  let mockOllamaService: vi.Mocked<OllamaService>;
  let mockToolManager: vi.Mocked<ToolManager>;
  let mockToolRegistry: vi.Mocked<ToolRegistry>;
  let mockToolExecutor: vi.Mocked<ToolExecutor>;

  const mockToolDefinition: ToolDefinition = {
    name: 'test_tool',
    description: 'A test tool',
    version: '1.0.0',
    category: 'test',
    securityLevel: SecurityLevel.LOW,
    parameters: {
      input: {
        type: 'string',
        required: true,
        description: 'Test input parameter'
      }
    },
    permissions: []
  };

  const mockContext: ConversationContext = {
    userId: 'test_user',
    sessionId: 'test_session',
    conversationId: 'test_conversation',
    toolExecutionHistory: [],
    availableTools: ['test_tool'],
    environment: {}
  };

  beforeEach(() => {
    // Create mocked instances
    mockOllamaService = {
      chat: vi.fn(),
      isAvailable: vi.fn(),
      getModels: vi.fn(),
      generate: vi.fn(),
      updateConfig: vi.fn(),
      getConfig: vi.fn()
    } as any;

    mockToolRegistry = {
      listTools: vi.fn(),
      getTool: vi.fn(),
      registerTool: vi.fn(),
      unregisterTool: vi.fn(),
      getToolsByCategory: vi.fn(),
      validateToolDefinition: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    } as any;

    mockToolExecutor = {
      executeToolSafe: vi.fn(),
      executeToolUnsafe: vi.fn(),
      validateParameters: vi.fn(),
      getExecutionHistory: vi.fn(),
      clearExecutionHistory: vi.fn()
    } as any;

    mockToolManager = {
      executeWorkflow: vi.fn(),
      createSimpleWorkflow: vi.fn(),
      createParallelWorkflow: vi.fn(),
      getActiveWorkflows: vi.fn(),
      cancelWorkflow: vi.fn(),
      getWorkflowContext: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn()
    } as any;

    // Initialize service
    toolCallingService = new ToolCallingService(
      mockOllamaService,
      mockToolManager,
      mockToolRegistry,
      mockToolExecutor
    );
  });

  describe('Tool Call Parsing', () => {
    it('should parse JSON format tool calls correctly', () => {
      const response = `
        I need to use a tool to help with this.
        
        \`\`\`json
        {
          "tool_call": {
            "name": "test_tool",
            "parameters": {
              "input": "test value"
            }
          }
        }
        \`\`\`
        
        This should work.
      `;

      // Access private method for testing
      const parseToolCalls = (toolCallingService as any).parseToolCalls.bind(toolCallingService);
      const toolCalls = parseToolCalls(response);

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toMatchObject({
        name: 'test_tool',
        parameters: { input: 'test value' }
      });
      expect(toolCalls[0].id).toBeDefined();
    });

    it('should parse structured format tool calls correctly', () => {
      const response = `
        Let me use the structured format:
        
        [TOOL_CALL]
        Name: test_tool
        Parameters: {"input": "structured test"}
        
        That should work.
      `;

      const parseToolCalls = (toolCallingService as any).parseToolCalls.bind(toolCallingService);
      const toolCalls = parseToolCalls(response);

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toMatchObject({
        name: 'test_tool',
        parameters: { input: 'structured test' }
      });
    });

    it('should handle malformed JSON gracefully', () => {
      const response = `
        \`\`\`json
        {
          "tool_call": {
            "name": "test_tool",
            "parameters": { invalid json }
          }
        }
        \`\`\`
      `;

      const parseToolCalls = (toolCallingService as any).parseToolCalls.bind(toolCallingService);
      const toolCalls = parseToolCalls(response);

      expect(toolCalls).toHaveLength(0);
    });

    it('should parse multiple tool calls from single response', () => {
      const response = `
        I'll use multiple tools:
        
        \`\`\`json
        {
          "tool_call": {
            "name": "tool_one",
            "parameters": {"param": "value1"}
          }
        }
        \`\`\`
        
        And then:
        
        [TOOL_CALL]
        Name: tool_two
        Parameters: {"param": "value2"}
      `;

      const parseToolCalls = (toolCallingService as any).parseToolCalls.bind(toolCallingService);
      const toolCalls = parseToolCalls(response);

      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].name).toBe('tool_one');
      expect(toolCalls[1].name).toBe('tool_two');
    });
  });

  describe('Tool Execution Integration', () => {
    it('should execute tool calls and return results', async () => {
      const toolCalls: ToolCall[] = [{
        id: 'test_call_1',
        name: 'test_tool',
        parameters: { input: 'test' }
      }];

      mockToolExecutor.executeToolSafe.mockResolvedValue({
        executionId: 'test_call_1',
        toolName: 'test_tool',
        status: ExecutionStatus.SUCCESS,
        result: 'Tool executed successfully',
        executionTime: 100,
        timestamp: new Date().toISOString()
      });

      const executeToolCalls = (toolCallingService as any).executeToolCalls.bind(toolCallingService);
      const results = await executeToolCalls(toolCalls, mockContext);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'test_call_1',
        name: 'test_tool',
        result: 'Tool executed successfully',
        error: undefined
      });
      expect(results[0].executionTime).toBeGreaterThan(0);
    });

    it('should handle tool execution failures gracefully', async () => {
      const toolCalls: ToolCall[] = [{
        id: 'test_call_1',
        name: 'failing_tool',
        parameters: { input: 'test' }
      }];

      mockToolExecutor.executeToolSafe.mockResolvedValue({
        executionId: 'test_call_1',
        toolName: 'failing_tool',
        status: ExecutionStatus.FAILED,
        error: {
          code: 'EXECUTION_ERROR',
          message: 'Tool execution failed',
          recoverable: false
        },
        executionTime: 50,
        timestamp: new Date().toISOString()
      });

      const executeToolCalls = (toolCallingService as any).executeToolCalls.bind(toolCallingService);
      const results = await executeToolCalls(toolCalls, mockContext);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'test_call_1',
        name: 'failing_tool',
        result: null,
        error: 'Tool execution failed'
      });
    });

    it('should handle tool execution exceptions', async () => {
      const toolCalls: ToolCall[] = [{
        id: 'test_call_1',
        name: 'exception_tool',
        parameters: { input: 'test' }
      }];

      mockToolExecutor.executeToolSafe.mockRejectedValue(new Error('Unexpected error'));

      const executeToolCalls = (toolCallingService as any).executeToolCalls.bind(toolCallingService);
      const results = await executeToolCalls(toolCalls, mockContext);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: 'test_call_1',
        name: 'exception_tool',
        result: null,
        error: 'Unexpected error'
      });
    });
  });

  describe('Chat with Tools Integration', () => {
    it('should handle conversation without tool calls', async () => {
      const messages = [
        { role: 'user' as const, content: 'Hello, how are you?' }
      ];

      mockOllamaService.chat.mockResolvedValue('I am doing well, thank you!');
      mockToolRegistry.listTools.mockReturnValue([mockToolDefinition]);

      const result = await toolCallingService.chatWithTools(messages, mockContext);

      expect(result.response).toBe('I am doing well, thank you!');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.toolResults).toHaveLength(0);
      expect(mockOllamaService.chat).toHaveBeenCalledTimes(1);
    });

    it('should execute tools when detected in LLM response', async () => {
      const messages = [
        { role: 'user' as const, content: 'Use the test tool with input "hello"' }
      ];

      // First call returns tool call, second call returns final response
      mockOllamaService.chat
        .mockResolvedValueOnce(`I'll use the test tool.
        
        \`\`\`json
        {
          "tool_call": {
            "name": "test_tool",
            "parameters": {"input": "hello"}
          }
        }
        \`\`\``)
        .mockResolvedValueOnce('The tool returned: Tool executed successfully');

      mockToolRegistry.listTools.mockReturnValue([mockToolDefinition]);
      mockToolExecutor.executeToolSafe.mockResolvedValue({
        executionId: 'test_execution',
        toolName: 'test_tool',
        status: ExecutionStatus.SUCCESS,
        result: 'Tool executed successfully',
        executionTime: 100,
        timestamp: new Date().toISOString()
      });

      const result = await toolCallingService.chatWithTools(messages, mockContext);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolResults).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('test_tool');
      expect(result.toolResults[0].result).toBe('Tool executed successfully');
      expect(mockOllamaService.chat).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple tool execution iterations', async () => {
      const messages = [
        { role: 'user' as const, content: 'Use multiple tools in sequence' }
      ];

      // Mock multiple LLM responses with tool calls
      mockOllamaService.chat
        .mockResolvedValueOnce(`First tool:
        \`\`\`json
        {"tool_call": {"name": "test_tool", "parameters": {"input": "first"}}}
        \`\`\``)
        .mockResolvedValueOnce(`Second tool:
        \`\`\`json
        {"tool_call": {"name": "test_tool", "parameters": {"input": "second"}}}
        \`\`\``)
        .mockResolvedValueOnce('All tools completed successfully');

      mockToolRegistry.listTools.mockReturnValue([mockToolDefinition]);
      mockToolExecutor.executeToolSafe
        .mockResolvedValueOnce({
          executionId: 'exec_1',
          toolName: 'test_tool',
          status: ExecutionStatus.SUCCESS,
          result: 'First result',
          executionTime: 100,
          timestamp: new Date().toISOString()
        })
        .mockResolvedValueOnce({
          executionId: 'exec_2',
          toolName: 'test_tool',
          status: ExecutionStatus.SUCCESS,
          result: 'Second result',
          executionTime: 150,
          timestamp: new Date().toISOString()
        });

      const result = await toolCallingService.chatWithTools(messages, mockContext);

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolResults).toHaveLength(2);
      expect(mockOllamaService.chat).toHaveBeenCalledTimes(3);
    });

    it('should respect max tool calls limit', async () => {
      const messages = [
        { role: 'user' as const, content: 'Keep using tools' }
      ];

      // Configure service with low max tool calls
      toolCallingService.updateConfig({ maxToolCalls: 2 });

      // Mock LLM to always return tool calls
      mockOllamaService.chat.mockResolvedValue(`
        \`\`\`json
        {"tool_call": {"name": "test_tool", "parameters": {"input": "test"}}}
        \`\`\`
      `);

      mockToolRegistry.listTools.mockReturnValue([mockToolDefinition]);
      mockToolExecutor.executeToolSafe.mockResolvedValue({
        executionId: 'test_exec',
        toolName: 'test_tool',
        status: ExecutionStatus.SUCCESS,
        result: 'Tool result',
        executionTime: 100,
        timestamp: new Date().toISOString()
      });

      const result = await toolCallingService.chatWithTools(messages, mockContext);

      // Should stop after 2 iterations due to max limit
      expect(result.toolCalls).toHaveLength(2);
      expect(mockOllamaService.chat).toHaveBeenCalledTimes(2);
    });
  });

  describe('Tool Context Management', () => {
    it('should build proper tool context prompt', () => {
      mockToolRegistry.listTools.mockReturnValue([mockToolDefinition]);

      const buildToolContextPrompt = (toolCallingService as any).buildToolContextPrompt.bind(toolCallingService);
      const prompt = buildToolContextPrompt([mockToolDefinition], mockContext);

      expect(prompt).toContain('test_tool');
      expect(prompt).toContain('A test tool');
      expect(prompt).toContain('input: string (required)');
      expect(prompt).toContain('tool_call');
      expect(prompt).toContain('parameters');
    });

    it('should include execution history in context', () => {
      const contextWithHistory: ConversationContext = {
        ...mockContext,
        toolExecutionHistory: [
          {
            id: 'prev_1',
            name: 'previous_tool',
            result: 'Previous result',
            executionTime: 200
          }
        ]
      };

      const buildToolContextPrompt = (toolCallingService as any).buildToolContextPrompt.bind(toolCallingService);
      const prompt = buildToolContextPrompt([mockToolDefinition], contextWithHistory);

      expect(prompt).toContain('Tool Execution History');
      expect(prompt).toContain('previous_tool: Success');
    });

    it('should format tool results correctly', () => {
      const results = [
        {
          id: 'result_1',
          name: 'tool_one',
          result: 'Simple result',
          executionTime: 100
        },
        {
          id: 'result_2',
          name: 'tool_two',
          result: { complex: 'object', data: [1, 2, 3] },
          executionTime: 150
        },
        {
          id: 'result_3',
          name: 'tool_three',
          result: null,
          error: 'Tool failed',
          executionTime: 50
        }
      ];

      const formatToolResults = (toolCallingService as any).formatToolResults.bind(toolCallingService);
      const formatted = formatToolResults(results);

      expect(formatted).toContain('Tool tool_one result:\nSimple result');
      expect(formatted).toContain('Tool tool_two result:\n{');
      expect(formatted).toContain('Tool tool_three failed: Tool failed');
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration correctly', () => {
      const newConfig = {
        enableToolCalling: false,
        maxToolCalls: 10,
        toolCallTimeout: 60000
      };

      toolCallingService.updateConfig(newConfig);
      const currentConfig = toolCallingService.getConfig();

      expect(currentConfig.enableToolCalling).toBe(false);
      expect(currentConfig.maxToolCalls).toBe(10);
      expect(currentConfig.toolCallTimeout).toBe(60000);
    });

    it('should fall back to regular chat when tool calling is disabled', async () => {
      toolCallingService.updateConfig({ enableToolCalling: false });

      const messages = [
        { role: 'user' as const, content: 'Use a tool' }
      ];

      mockOllamaService.chat.mockResolvedValue('Regular response without tools');

      const result = await toolCallingService.chatWithTools(messages, mockContext);

      expect(result.response).toBe('Regular response without tools');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.toolResults).toHaveLength(0);
      expect(mockOllamaService.chat).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM service errors gracefully', async () => {
      const messages = [
        { role: 'user' as const, content: 'Test message' }
      ];

      mockOllamaService.chat.mockRejectedValue(new Error('LLM service error'));
      mockToolRegistry.listTools.mockReturnValue([mockToolDefinition]);

      await expect(toolCallingService.chatWithTools(messages, mockContext))
        .rejects.toThrow('LLM service error');
    });

    it('should continue conversation when some tools fail', async () => {
      const messages = [
        { role: 'user' as const, content: 'Use tools' }
      ];

      mockOllamaService.chat
        .mockResolvedValueOnce(`
          \`\`\`json
          {"tool_call": {"name": "test_tool", "parameters": {"input": "test"}}}
          \`\`\`
        `)
        .mockResolvedValueOnce('Continuing despite tool failure');

      mockToolRegistry.listTools.mockReturnValue([mockToolDefinition]);
      mockToolExecutor.executeToolSafe.mockResolvedValue({
        executionId: 'test_exec',
        toolName: 'test_tool',
        status: ExecutionStatus.FAILED,
        error: {
          code: 'TOOL_ERROR',
          message: 'Tool failed',
          recoverable: true
        },
        executionTime: 100,
        timestamp: new Date().toISOString()
      });

      const result = await toolCallingService.chatWithTools(messages, mockContext);

      expect(result.toolResults[0].error).toBe('Tool failed');
      expect(result.response).toBe('Continuing despite tool failure');
    });
  });
});