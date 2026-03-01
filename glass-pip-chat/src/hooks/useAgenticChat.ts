/**
 * useAgenticChat Hook
 * 
 * Manages an agentic chat loop that allows the AI to use multiple tools
 * sequentially until the task is complete.
 */

import { useState, useCallback, useRef } from 'react';
import { 
  AgenticToolService, 
  ToolDefinition, 
  ToolExecution,
  AgenticMessage,
  parseToolCall,
  extractThinking,
  buildAgenticSystemPrompt
} from '../services/agenticToolService';

export interface AgenticChatConfig {
  maxIterations: number;
  maxToolCalls: number;
  toolCallTimeout: number;
  customSystemPrompt?: string;
}

export interface AgenticStreamState {
  isStreaming: boolean;
  currentText: string;
  thinking: string | null;
  messages: AgenticMessage[];
  toolExecutions: ToolExecution[];
  iteration: number;
  isComplete: boolean;
}

const DEFAULT_CONFIG: AgenticChatConfig = {
  maxIterations: 10,
  maxToolCalls: 20,
  toolCallTimeout: 30000,
};

export function useAgenticChat(
  sendToLLM: (messages: any[], content: string, onProgress: (update: any) => void) => Promise<string>,
  executeTool: (name: string, params: any) => Promise<any>,
  config: Partial<AgenticChatConfig> = {}
) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const [state, setState] = useState<AgenticStreamState>({
    isStreaming: false,
    currentText: '',
    thinking: null,
    messages: [],
    toolExecutions: [],
    iteration: 0,
    isComplete: false,
  });
  
  const abortRef = useRef(false);
  const serviceRef = useRef(new AgenticToolService(executeTool, fullConfig));
  
  /**
   * Run the agentic loop
   */
  const runAgenticLoop = useCallback(async (
    chatHistory: any[],
    userMessage: string,
    tools: ToolDefinition[],
    onUpdate: (state: AgenticStreamState) => void
  ): Promise<{ finalResponse: string; toolExecutions: ToolExecution[] }> => {
    abortRef.current = false;
    serviceRef.current.setTools(tools);
    
    const allMessages: AgenticMessage[] = [];
    const allToolExecutions: ToolExecution[] = [];
    let iteration = 0;
    let totalToolCalls = 0;
    let conversationContext = '';
    
    // Build system prompt with tools
    const systemPrompt = buildAgenticSystemPrompt(tools, fullConfig.customSystemPrompt);
    
    // Initial state
    setState({
      isStreaming: true,
      currentText: '',
      thinking: null,
      messages: [],
      toolExecutions: [],
      iteration: 0,
      isComplete: false,
    });
    
    // Prepare the initial message with system prompt
    let currentMessage = `[System: ${systemPrompt}]\n\nUser: ${userMessage}`;
    
    while (iteration < fullConfig.maxIterations && totalToolCalls < fullConfig.maxToolCalls && !abortRef.current) {
      iteration++;
      
      // Update state for this iteration
      const iterationState: AgenticStreamState = {
        isStreaming: true,
        currentText: '',
        thinking: null,
        messages: [...allMessages],
        toolExecutions: [...allToolExecutions],
        iteration,
        isComplete: false,
      };
      setState(iterationState);
      onUpdate(iterationState);
      
      // Stream response from LLM
      let accumulatedResponse = '';
      let currentThinking = '';
      
      await sendToLLM(
        chatHistory,
        currentMessage + (conversationContext ? `\n\n${conversationContext}` : ''),
        (update) => {
          if (update.type === 'response' || update.type === 'done') {
            accumulatedResponse = update.response || '';
            
            // Extract thinking
            const { thinking, rest } = extractThinking(accumulatedResponse);
            if (thinking) {
              currentThinking = thinking;
            }
            
            // Update streaming state
            const streamState: AgenticStreamState = {
              isStreaming: true,
              currentText: rest,
              thinking: currentThinking || null,
              messages: [...allMessages],
              toolExecutions: [...allToolExecutions],
              iteration,
              isComplete: false,
            };
            setState(streamState);
            onUpdate(streamState);
          }
        }
      );
      
      if (abortRef.current) break;
      
      // Parse for tool calls
      const { toolCall, beforeText } = parseToolCall(accumulatedResponse);
      
      // Add any text before the tool call as a message
      if (beforeText) {
        allMessages.push({ type: 'text', content: beforeText });
      }
      
      // If no tool call, we're done
      if (!toolCall) {
        // Add final text
        const { rest } = extractThinking(accumulatedResponse);
        if (rest && !allMessages.find(m => m.content === rest)) {
          allMessages.push({ type: 'text', content: rest });
        }
        
        const finalState: AgenticStreamState = {
          isStreaming: false,
          currentText: rest,
          thinking: currentThinking || null,
          messages: allMessages,
          toolExecutions: allToolExecutions,
          iteration,
          isComplete: true,
        };
        setState(finalState);
        onUpdate(finalState);
        
        return { 
          finalResponse: buildFinalResponse(allMessages, allToolExecutions, currentThinking),
          toolExecutions: allToolExecutions 
        };
      }
      
      // Execute the tool
      totalToolCalls++;
      
      // Add tool call message
      allMessages.push({ 
        type: 'tool_call', 
        content: `Calling ${toolCall.name}...`,
      });
      
      // Create execution record
      const execution: ToolExecution = {
        id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: toolCall.name,
        parameters: toolCall.parameters,
        status: 'executing',
        startTime: Date.now(),
      };
      allToolExecutions.push(execution);
      
      // Update state to show executing
      const executingState: AgenticStreamState = {
        isStreaming: true,
        currentText: beforeText,
        thinking: currentThinking || null,
        messages: [...allMessages],
        toolExecutions: [...allToolExecutions],
        iteration,
        isComplete: false,
      };
      setState(executingState);
      onUpdate(executingState);
      
      // Execute the tool
      try {
        const result = await Promise.race([
          executeTool(toolCall.name, toolCall.parameters),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Tool execution timeout')), fullConfig.toolCallTimeout)
          )
        ]);
        
        execution.status = 'success';
        execution.result = result;
        execution.endTime = Date.now();
        
        // Format result for display
        const resultText = serviceRef.current.formatToolResult(execution);
        
        // Add tool result message
        allMessages.push({ 
          type: 'tool_result', 
          content: resultText,
          toolExecution: execution
        });
        
        // Build context for next iteration
        conversationContext = `Tool "${toolCall.name}" returned:\n${resultText}\n\nBased on this result, continue with the task. If you need more information, use another tool. If the task is complete, provide your final response.`;
        
      } catch (error) {
        execution.status = 'error';
        execution.error = error instanceof Error ? error.message : String(error);
        execution.endTime = Date.now();
        
        allMessages.push({ 
          type: 'tool_result', 
          content: `Error: ${execution.error}`,
          toolExecution: execution
        });
        
        conversationContext = `Tool "${toolCall.name}" failed with error: ${execution.error}\n\nYou can try a different approach or tool, or explain the issue to the user.`;
      }
      
      // Update state after tool execution
      const afterToolState: AgenticStreamState = {
        isStreaming: true,
        currentText: '',
        thinking: null,
        messages: [...allMessages],
        toolExecutions: [...allToolExecutions],
        iteration,
        isComplete: false,
      };
      setState(afterToolState);
      onUpdate(afterToolState);
      
      // Reset message for next iteration (don't include system prompt again)
      currentMessage = '';
    }
    
    // Max iterations reached
    const finalState: AgenticStreamState = {
      isStreaming: false,
      currentText: 'Maximum iterations reached.',
      thinking: null,
      messages: allMessages,
      toolExecutions: allToolExecutions,
      iteration,
      isComplete: true,
    };
    setState(finalState);
    onUpdate(finalState);
    
    return { 
      finalResponse: buildFinalResponse(allMessages, allToolExecutions, null),
      toolExecutions: allToolExecutions 
    };
  }, [sendToLLM, executeTool, fullConfig]);
  
  /**
   * Stop the agentic loop
   */
  const stop = useCallback(() => {
    abortRef.current = true;
  }, []);
  
  /**
   * Reset state
   */
  const reset = useCallback(() => {
    abortRef.current = false;
    setState({
      isStreaming: false,
      currentText: '',
      thinking: null,
      messages: [],
      toolExecutions: [],
      iteration: 0,
      isComplete: false,
    });
  }, []);
  
  return {
    state,
    runAgenticLoop,
    stop,
    reset,
  };
}

/**
 * Build the final response string from messages and tool executions
 */
function buildFinalResponse(
  messages: AgenticMessage[], 
  toolExecutions: ToolExecution[],
  thinking: string | null
): string {
  const parts: string[] = [];
  
  // Add thinking if present
  if (thinking) {
    parts.push(`<think>${thinking}</think>`);
  }
  
  // Build response with inline tool results
  for (const msg of messages) {
    if (msg.type === 'text' && msg.content) {
      parts.push(msg.content);
    } else if (msg.type === 'tool_result' && msg.toolExecution) {
      const exec = msg.toolExecution;
      const resultDisplay = exec.status === 'error' 
        ? `❌ Error: ${exec.error}`
        : msg.content;
      parts.push(`🔧 **${exec.name}**\n\`\`\`\n${resultDisplay}\n\`\`\``);
    }
  }
  
  return parts.join('\n\n');
}

export default useAgenticChat;
