/**
 * Remote Message Processor
 * Requirements: 3.4, 13.1, 13.2, 13.3
 * 
 * Integrates remote message processing with existing Ally services
 * Connects to OllamaService and ToolCallingService
 * Preserves existing error handling and logging patterns
 */

import { OllamaService, ChatMessage, ThinkingChunk } from './ollamaService';
import { ToolCallingService, ToolCall, ToolCallResult, ConversationContext } from './toolCallingService';
import { RemoteMessage } from './remoteMessagePoller';
import { ResponseStreamer, StreamingConfig } from './responseStreamer';
import { env } from '../utils/env';

export interface ProcessMessageRequest {
  messageId: string;
  content: string;
  sessionId: string;
  userId: string;
  onProgress?: (chunk: string) => Promise<void>;
  onToolExecution?: (execution: ToolExecutionUpdate) => Promise<void>;
}

export interface ProcessMessageResponse {
  response: string;
  toolResults: ToolCallResult[];
  processingTime: number;
  error?: string;
}

export interface ToolExecutionUpdate {
  id: string;
  toolName: string;
  status: 'started' | 'completed' | 'failed';
  result?: any;
  error?: string;
  executionTime?: number;
}

export class RemoteMessageProcessor {
  private ollamaService: OllamaService;
  private toolCallingService: ToolCallingService;
  private responseStreamer: ResponseStreamer;

  constructor(
    ollamaService: OllamaService,
    toolCallingService: ToolCallingService,
    streamingConfig?: StreamingConfig
  ) {
    this.ollamaService = ollamaService;
    this.toolCallingService = toolCallingService;
    
    // Initialize response streamer with default config if not provided
    this.responseStreamer = new ResponseStreamer(streamingConfig || {
      supabaseUrl: env.SUPABASE_URL,
      supabaseServiceKey: env.SUPABASE_SERVICE_KEY,
      batchSize: 3,
      flushInterval: 100, // 100ms for responsive streaming
      maxRetries: 3,
      retryDelay: 1000
    });
  }

  /**
   * Process a remote message using existing Ally services with streaming
   */
  async processMessage(request: ProcessMessageRequest): Promise<ProcessMessageResponse> {
    const startTime = Date.now();
    
    try {
      console.log(`🔄 RemoteMessageProcessor: Processing remote message ${request.messageId}: ${request.content.substring(0, 100)}...`);
      
      // Start streaming for this message
      console.log(`📡 RemoteMessageProcessor: Starting streaming for message ${request.messageId}`);
      this.responseStreamer.startStreaming(request.messageId);
      
      // Build conversation context for tool calling service
      const conversationContext: ConversationContext = {
        userId: request.userId,
        sessionId: request.sessionId,
        conversationId: request.messageId,
        toolExecutionHistory: [], // Initialize empty history
        availableTools: [], // Initialize empty tools list
        environment: {
          isRemote: true,
          messageId: request.messageId,
          timestamp: new Date().toISOString()
        }
      };

      console.log(`🎯 RemoteMessageProcessor: Built conversation context:`, conversationContext);

      // Create message array for Ollama
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: request.content
        }
      ];

      console.log(`💬 RemoteMessageProcessor: Created messages array:`, messages);

      // Create streaming progress handler (no longer streams to Supabase here, handled in processing methods)
      const streamingProgressHandler = async (chunk: string) => {
        console.log(`📤 RemoteMessageProcessor: Progress chunk for ${request.messageId}:`, chunk.substring(0, 50));
        
        // Call the original progress handler if provided
        if (request.onProgress) {
          await request.onProgress(chunk);
        }
      };

      let result: ProcessMessageResponse;

      // Process through tool-aware conversation if tool calling is enabled
      if (this.toolCallingService) {
        console.log(`🔧 RemoteMessageProcessor: Using tool calling service for message ${request.messageId}`);
        result = await this.processWithToolCalling(
          messages,
          conversationContext,
          { ...request, onProgress: streamingProgressHandler },
          startTime
        );
      } else {
        console.log(`🤖 RemoteMessageProcessor: Using direct Ollama processing for message ${request.messageId}`);
        // Fallback to direct Ollama processing
        result = await this.processDirectOllama(
          messages,
          { ...request, onProgress: streamingProgressHandler },
          startTime
        );
      }

      console.log(`✅ RemoteMessageProcessor: Processing completed for message ${request.messageId}:`, result);

      // Complete streaming
      console.log(`📡 RemoteMessageProcessor: Completing streaming for message ${request.messageId}`);
      await this.responseStreamer.completeStreaming(request.messageId);
      
      return result;

    } catch (error) {
      console.error(`❌ RemoteMessageProcessor: Failed to process remote message ${request.messageId}:`, error);
      
      // Handle streaming error
      console.log(`📡 RemoteMessageProcessor: Handling streaming error for message ${request.messageId}`);
      await this.responseStreamer.errorStreaming(request.messageId, error as Error);
      
      return {
        response: '',
        toolResults: [],
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown processing error'
      };
    }
  }

  /**
   * Process message with tool calling support
   */
  private async processWithToolCalling(
    messages: ChatMessage[],
    context: ConversationContext,
    request: ProcessMessageRequest,
    startTime: number
  ): Promise<ProcessMessageResponse> {
    let fullResponse = '';
    const toolResults: ToolCallResult[] = [];

    try {
      // Convert ChatMessage[] to ToolAwareMessage[] for the tool calling service
      const toolAwareMessages = messages.map(msg => ({
        ...msg,
        toolCalls: undefined,
        toolResults: undefined
      }));

      // Use the tool calling service's chatWithTools method
      const result = await this.toolCallingService.chatWithTools(
        toolAwareMessages,
        context,
        'llama3.2', // Default model
        async (chunk: string, toolCalls?: ToolCall[], currentToolResults?: ToolCallResult[]) => {
          // The chunk from Ollama is already cumulative, don't accumulate again
          fullResponse = chunk;
          
          // Stream the response content directly
          await this.responseStreamer.streamChunk(request.messageId, fullResponse);
          
          // Update tool results if provided
          if (currentToolResults) {
            // Add new tool results
            currentToolResults.forEach(result => {
              if (!toolResults.find(existing => existing.id === result.id)) {
                toolResults.push(result);
                
                // Notify about tool execution
                if (request.onToolExecution) {
                  const update: ToolExecutionUpdate = {
                    id: result.id,
                    toolName: result.name,
                    status: result.error ? 'failed' : 'completed',
                    result: result.result,
                    error: result.error,
                    executionTime: result.executionTime
                  };
                  
                  request.onToolExecution(update).catch(console.error);
                }
              }
            });
          }
          
          if (request.onProgress) {
            await request.onProgress(chunk);
          }
        }
      );

      return {
        response: result.response || fullResponse,
        toolResults: result.toolResults || toolResults,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Tool-aware processing failed:', error);
      
      // Fallback to direct Ollama processing
      return await this.processDirectOllama(messages, request, startTime);
    }
  }

  /**
   * Process message directly through Ollama without tool calling
   */
  private async processDirectOllama(
    messages: ChatMessage[],
    request: ProcessMessageRequest,
    startTime: number
  ): Promise<ProcessMessageResponse> {
    let fullResponse = '';

    try {
      // Use Ollama's streaming with thinking
      await this.ollamaService.streamChatWithThinking(
        messages,
        'llama3.2', // Default model
        async (chunk: ThinkingChunk) => {
          if (chunk.type === 'response') {
            // chunk.content is already cumulative from Ollama service
            fullResponse = chunk.content;
            
            // Stream the cumulative response
            await this.responseStreamer.streamChunk(request.messageId, fullResponse);
            
            if (request.onProgress) {
              await request.onProgress(chunk.content);
            }
          }
          // We can ignore thinking chunks for remote processing
        }
      );

      return {
        response: fullResponse,
        toolResults: [],
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Direct Ollama processing failed:', error);
      throw error;
    }
  }

  /**
   * Extract tool calls from LLM response using existing patterns
   */
  private extractToolCalls(response: string): ToolCall[] {
    // Use the same tool call extraction logic as the existing tool calling service
    const toolCallPattern = /```json\s*(\{[^`]*"tool_calls"[^`]*\})\s*```/g;
    const toolCalls: ToolCall[] = [];
    
    let match;
    while ((match = toolCallPattern.exec(response)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
          parsed.tool_calls.forEach((call: any) => {
            toolCalls.push({
              id: call.id || `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: call.name || call.function?.name,
              parameters: call.parameters || call.function?.arguments || {}
            });
          });
        }
      } catch (error) {
        console.error('Failed to parse tool call JSON:', error);
      }
    }
    
    return toolCalls;
  }

  /**
   * Execute tool calls using the existing tool calling service
   */
  private async executeToolCalls(
    toolCalls: ToolCall[],
    context: ConversationContext,
    onToolExecution?: (execution: ToolExecutionUpdate) => Promise<void>
  ): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];

    for (const toolCall of toolCalls) {
      const startTime = Date.now();
      
      try {
        // Notify tool execution started
        if (onToolExecution) {
          await onToolExecution({
            id: toolCall.id,
            toolName: toolCall.name,
            status: 'started'
          });
        }

        // Execute through the tool calling service
        // Note: We'll need to access the internal tool executor
        // For now, we'll use a simplified approach
        const result = await this.executeToolDirect(toolCall, context);
        
        const toolResult: ToolCallResult = {
          id: toolCall.id,
          name: toolCall.name,
          result: result,
          executionTime: Date.now() - startTime
        };

        results.push(toolResult);

        // Notify tool execution completed
        if (onToolExecution) {
          await onToolExecution({
            id: toolCall.id,
            toolName: toolCall.name,
            status: 'completed',
            result: result,
            executionTime: toolResult.executionTime
          });
        }

      } catch (error) {
        const toolResult: ToolCallResult = {
          id: toolCall.id,
          name: toolCall.name,
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error',
          executionTime: Date.now() - startTime
        };

        results.push(toolResult);

        // Notify tool execution failed
        if (onToolExecution) {
          await onToolExecution({
            id: toolCall.id,
            toolName: toolCall.name,
            status: 'failed',
            error: toolResult.error,
            executionTime: toolResult.executionTime
          });
        }
      }
    }

    return results;
  }

  /**
   * Direct tool execution (simplified for remote processing)
   */
  private async executeToolDirect(toolCall: ToolCall, context: ConversationContext): Promise<any> {
    // This is a simplified implementation
    // In a full implementation, this would integrate with the tool registry
    
    console.log(`Executing tool: ${toolCall.name} with parameters:`, toolCall.parameters);
    
    // For now, return a mock result
    // TODO: Integrate with actual tool execution framework
    return {
      toolName: toolCall.name,
      parameters: toolCall.parameters,
      result: `Tool ${toolCall.name} executed successfully`,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format tool results for display in chat
   */
  formatToolResults(toolResults: ToolCallResult[]): string {
    if (toolResults.length === 0) return '';
    
    const formattedResults = toolResults.map(result => {
      if (result.error) {
        return `**${result.name}** (Error): ${result.error}`;
      } else {
        const resultText = typeof result.result === 'object' 
          ? JSON.stringify(result.result, null, 2)
          : String(result.result);
        return `**${result.name}**: ${resultText}`;
      }
    });
    
    return `\n\n**Tool Execution Results:**\n${formattedResults.join('\n\n')}`;
  }

  /**
   * Get service status
   */
  getStatus(): {
    ollamaConnected: boolean;
    toolCallingEnabled: boolean;
    activeStreams: string[];
  } {
    return {
      ollamaConnected: !!this.ollamaService,
      toolCallingEnabled: !!this.toolCallingService,
      activeStreams: this.responseStreamer.getActiveStreams()
    };
  }

  /**
   * Get streaming metrics for a message
   */
  getStreamingMetrics(messageId: string) {
    return this.responseStreamer.getMetrics(messageId);
  }

  /**
   * Shutdown the processor and clean up resources
   */
  async shutdown(): Promise<void> {
    await this.responseStreamer.shutdown();
  }
}