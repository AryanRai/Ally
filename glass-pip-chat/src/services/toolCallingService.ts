/**
 * Tool Calling Service for Ally LLM Integration
 * Requirements: 10.1, 10.2, 15.1, 3.3
 * 
 * Integrates tool calling capabilities into Ollama LLM interface
 * Implements tool-aware prompt engineering and context management
 * Creates tool execution workflow in conversation processing
 * Builds tool result integration into LLM response generation
 */

import { OllamaService, ChatMessage } from './ollamaService';
import { ToolManager, WorkflowExecutionResult } from '../../tool-calling-framework/src/manager/ToolManager';
import { ToolRegistry } from '../../tool-calling-framework/src/registry/ToolRegistry';
import { ToolExecutor } from '../../tool-calling-framework/src/executor/ToolExecutor';
import {
  ToolExecutionRequest,
  ToolExecutionResult,
  ExecutionContext,
  ExecutionStatus,
  ToolDefinition
} from '../../tool-calling-framework/src/types/index';

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export interface ToolCallResult {
  id: string;
  name: string;
  result: any;
  error?: string;
  executionTime: number;
}

export interface ToolAwareMessage extends ChatMessage {
  toolCalls?: ToolCall[];
  toolResults?: ToolCallResult[];
}

export interface ToolCallingConfig {
  enableToolCalling: boolean;
  maxToolCalls: number;
  toolCallTimeout: number;
  enableMultiStepReasoning: boolean;
  toolCallPromptTemplate: string;
}

export interface ConversationContext {
  userId?: string;
  sessionId: string;
  conversationId: string;
  toolExecutionHistory: ToolCallResult[];
  availableTools: string[];
  environment: Record<string, any>;
}

export class ToolCallingService {
  private ollamaService: OllamaService;
  private toolManager: ToolManager;
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private config: ToolCallingConfig;

  constructor(
    ollamaService: OllamaService,
    toolManager: ToolManager,
    toolRegistry: ToolRegistry,
    toolExecutor: ToolExecutor,
    config: Partial<ToolCallingConfig> = {}
  ) {
    this.ollamaService = ollamaService;
    this.toolManager = toolManager;
    this.toolRegistry = toolRegistry;
    this.toolExecutor = toolExecutor;
    
    this.config = {
      enableToolCalling: true,
      maxToolCalls: 5,
      toolCallTimeout: 30000,
      enableMultiStepReasoning: true,
      toolCallPromptTemplate: this.getDefaultToolCallPrompt(),
      ...config
    };
  }

  /**
   * Enhanced chat method with tool calling capabilities
   */
  async chatWithTools(
    messages: ToolAwareMessage[],
    context: ConversationContext,
    model?: string,
    onProgress?: (chunk: string, toolCalls?: ToolCall[], toolResults?: ToolCallResult[]) => void
  ): Promise<{ response: string; toolCalls: ToolCall[]; toolResults: ToolCallResult[] }> {
    if (!this.config.enableToolCalling) {
      // Fall back to regular chat if tool calling is disabled
      const response = await this.ollamaService.chat(messages, model, onProgress);
      return { response, toolCalls: [], toolResults: [] };
    }

    const availableTools = this.getAvailableTools(context);
    const toolAwareMessages = this.enhanceMessagesWithToolContext(messages, availableTools, context);
    
    let allToolCalls: ToolCall[] = [];
    let allToolResults: ToolCallResult[] = [];
    let conversationComplete = false;
    let iterationCount = 0;

    while (!conversationComplete && iterationCount < this.config.maxToolCalls) {
      iterationCount++;
      
      // Get LLM response with tool awareness
      const llmResponse = await this.ollamaService.chat(
        toolAwareMessages,
        model,
        (chunk) => onProgress?.(chunk, allToolCalls, allToolResults)
      );

      // Parse tool calls from LLM response
      const toolCalls = this.parseToolCalls(llmResponse);
      
      if (toolCalls.length === 0) {
        // No tool calls found, conversation is complete
        conversationComplete = true;
        return {
          response: llmResponse,
          toolCalls: allToolCalls,
          toolResults: allToolResults
        };
      }

      // Execute tool calls
      const toolResults = await this.executeToolCalls(toolCalls, context);
      
      allToolCalls.push(...toolCalls);
      allToolResults.push(...toolResults);

      // Add tool execution results to conversation
      toolAwareMessages.push({
        role: 'assistant',
        content: llmResponse,
        toolCalls
      });

      toolAwareMessages.push({
        role: 'system',
        content: this.formatToolResults(toolResults),
        toolResults
      });

      // Update progress with tool results
      onProgress?.(llmResponse, allToolCalls, allToolResults);

      // Check if we should continue the conversation
      const shouldContinue = this.shouldContinueConversation(toolResults, iterationCount);
      if (!shouldContinue) {
        conversationComplete = true;
      }
    }

    // Generate final response incorporating all tool results
    const finalMessages = [...toolAwareMessages, {
      role: 'system',
      content: 'Please provide a final response incorporating the results from the tool executions above.'
    }];

    const finalResponse = await this.ollamaService.chat(
      finalMessages,
      model,
      (chunk) => onProgress?.(chunk, allToolCalls, allToolResults)
    );

    return {
      response: finalResponse,
      toolCalls: allToolCalls,
      toolResults: allToolResults
    };
  }

  /**
   * Parse tool calls from LLM response using structured patterns
   */
  private parseToolCalls(response: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    
    // Pattern 1: JSON tool call format
    const jsonPattern = /```json\s*{\s*"tool_call":\s*{\s*"name":\s*"([^"]+)",\s*"parameters":\s*({[^}]*})\s*}\s*}\s*```/g;
    let match;
    
    while ((match = jsonPattern.exec(response)) !== null) {
      try {
        const toolName = match[1];
        const parameters = JSON.parse(match[2]);
        
        toolCalls.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: toolName,
          parameters
        });
      } catch (error) {
        console.warn('Failed to parse JSON tool call:', error);
      }
    }

    // Pattern 2: Structured tool call format
    const structuredPattern = /\[TOOL_CALL\]\s*Name:\s*([^\n]+)\s*Parameters:\s*({[^}]*}|\{[^}]*\})/g;
    
    while ((match = structuredPattern.exec(response)) !== null) {
      try {
        const toolName = match[1].trim();
        const parameters = JSON.parse(match[2]);
        
        toolCalls.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: toolName,
          parameters
        });
      } catch (error) {
        console.warn('Failed to parse structured tool call:', error);
      }
    }

    // Pattern 3: Natural language tool call detection
    const naturalLanguagePatterns = [
      /I need to use the (\w+) tool with (.+)/i,
      /Let me call the (\w+) tool to (.+)/i,
      /I'll use (\w+) to (.+)/i
    ];

    for (const pattern of naturalLanguagePatterns) {
      const match = response.match(pattern);
      if (match) {
        const toolName = match[1];
        const description = match[2];
        
        // Try to extract parameters from description
        const parameters = this.extractParametersFromDescription(description, toolName);
        
        if (this.toolRegistry.getTool(toolName)) {
          toolCalls.push({
            id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: toolName,
            parameters
          });
        }
      }
    }

    return toolCalls;
  }

  /**
   * Execute multiple tool calls in parallel or sequence based on dependencies
   */
  private async executeToolCalls(
    toolCalls: ToolCall[],
    context: ConversationContext
  ): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];

    for (const toolCall of toolCalls) {
      const startTime = Date.now();
      
      try {
        // Create execution context
        const executionContext: ExecutionContext = {
          userId: context.userId,
          sessionId: context.sessionId,
          workflowId: context.conversationId,
          timestamp: new Date().toISOString(),
          environment: {
            ...context.environment,
            conversationId: context.conversationId,
            previousToolResults: results
          }
        };

        // Create execution request
        const request: ToolExecutionRequest = {
          toolName: toolCall.name,
          parameters: toolCall.parameters,
          executionId: toolCall.id,
          context: executionContext,
          timeout: this.config.toolCallTimeout
        };

        // Execute tool
        const executionResult = await this.toolExecutor.executeToolSafe(request);
        
        const result: ToolCallResult = {
          id: toolCall.id,
          name: toolCall.name,
          result: executionResult.result,
          error: executionResult.error?.message,
          executionTime: Date.now() - startTime
        };

        results.push(result);

      } catch (error) {
        const result: ToolCallResult = {
          id: toolCall.id,
          name: toolCall.name,
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error',
          executionTime: Date.now() - startTime
        };

        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get available tools for the current context
   */
  private getAvailableTools(context: ConversationContext): ToolDefinition[] {
    const allTools = this.toolRegistry.getAllTools();
    
    // Filter tools based on context and permissions
    return allTools.filter(tool => {
      // Check if tool is in available tools list
      if (context.availableTools.length > 0 && !context.availableTools.includes(tool.name)) {
        return false;
      }

      // Add additional filtering logic based on security level, permissions, etc.
      return true;
    });
  }

  /**
   * Enhance messages with tool context and available tools information
   */
  private enhanceMessagesWithToolContext(
    messages: ToolAwareMessage[],
    availableTools: ToolDefinition[],
    context: ConversationContext
  ): ToolAwareMessage[] {
    const toolContextMessage: ToolAwareMessage = {
      role: 'system',
      content: this.buildToolContextPrompt(availableTools, context)
    };

    return [toolContextMessage, ...messages];
  }

  /**
   * Build tool context prompt with available tools and usage instructions
   */
  private buildToolContextPrompt(tools: ToolDefinition[], context: ConversationContext): string {
    const toolDescriptions = tools.map(tool => {
      const params = Object.entries(tool.parameters)
        .map(([name, schema]) => `${name}: ${schema.type}${schema.required ? ' (required)' : ''}`)
        .join(', ');
      
      return `- ${tool.name}: ${tool.description}\n  Parameters: {${params}}`;
    }).join('\n');

    return `${this.config.toolCallPromptTemplate}

Available Tools:
${toolDescriptions}

Tool Execution History:
${context.toolExecutionHistory.slice(-5).map(result => 
  `- ${result.name}: ${result.error ? 'Failed - ' + result.error : 'Success'}`
).join('\n')}

To use a tool, respond with:
\`\`\`json
{
  "tool_call": {
    "name": "tool_name",
    "parameters": {
      "param1": "value1",
      "param2": "value2"
    }
  }
}
\`\`\`

Or use the structured format:
[TOOL_CALL]
Name: tool_name
Parameters: {"param1": "value1", "param2": "value2"}`;
  }

  /**
   * Format tool results for inclusion in conversation
   */
  private formatToolResults(results: ToolCallResult[]): string {
    return results.map(result => {
      if (result.error) {
        return `Tool ${result.name} failed: ${result.error}`;
      }
      
      const resultStr = typeof result.result === 'object' 
        ? JSON.stringify(result.result, null, 2)
        : String(result.result);
      
      return `Tool ${result.name} result:\n${resultStr}`;
    }).join('\n\n');
  }

  /**
   * Determine if conversation should continue based on tool results
   */
  private shouldContinueConversation(results: ToolCallResult[], iterationCount: number): boolean {
    // Stop if we've reached max iterations
    if (iterationCount >= this.config.maxToolCalls) {
      return false;
    }

    // Stop if all tools failed
    if (results.every(result => result.error)) {
      return false;
    }

    // Continue if multi-step reasoning is enabled and we have successful results
    return this.config.enableMultiStepReasoning && results.some(result => !result.error);
  }

  /**
   * Extract parameters from natural language description
   */
  private extractParametersFromDescription(description: string, toolName: string): Record<string, any> {
    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) return {};

    const parameters: Record<string, any> = {};
    
    // Simple parameter extraction patterns
    const patterns = [
      /with\s+(\w+)\s*[=:]\s*"([^"]+)"/g,
      /(\w+)\s*[=:]\s*"([^"]+)"/g,
      /(\w+)\s*[=:]\s*(\d+)/g,
      /(\w+)\s*[=:]\s*(true|false)/g
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(description)) !== null) {
        const paramName = match[1];
        let paramValue: any = match[2];
        
        // Type conversion based on tool definition
        if (tool.parameters[paramName]) {
          const paramSchema = tool.parameters[paramName];
          if (paramSchema.type === 'number') {
            paramValue = Number(paramValue);
          } else if (paramSchema.type === 'boolean') {
            paramValue = paramValue === 'true';
          }
        }
        
        parameters[paramName] = paramValue;
      }
    }

    return parameters;
  }

  /**
   * Get default tool calling prompt template
   */
  private getDefaultToolCallPrompt(): string {
    return `You are an AI assistant with access to various tools that can help you complete tasks and answer questions. 

When you need to use a tool to gather information, perform an action, or complete a task, you should:

1. Analyze the user's request to determine what tools might be helpful
2. Use the appropriate tool(s) with the correct parameters
3. Wait for the tool results
4. Incorporate the results into your response
5. If needed, use additional tools based on the results

You can use multiple tools in sequence to complete complex tasks. Always explain what you're doing and why you're using specific tools.`;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ToolCallingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): ToolCallingConfig {
    return { ...this.config };
  }

  /**
   * Get tool execution statistics
   */
  getToolExecutionStats(): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
    mostUsedTools: Array<{ name: string; count: number }>;
  } {
    // This would be implemented with proper statistics tracking
    // For now, return placeholder data
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      mostUsedTools: []
    };
  }
}