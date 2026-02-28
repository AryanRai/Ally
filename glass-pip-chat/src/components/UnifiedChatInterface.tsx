/**
 * Tool Call Test Interface Component
 * 
 * Test interface for tool calling functionality
 * Demonstrates the integration of:
 * - UI tool calling components
 * - Tool calling framework
 * - Stream handler and comms integration
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';

// Hooks
import { useOllamaIntegration } from '../hooks/useOllamaIntegration';
import { useUnifiedToolIntegration } from '../hooks/useUnifiedToolIntegration';
import { ToolAwareProcessingProgress } from '../services/toolAwareIntegrationService';

// Components
import { ToolExecutionStatus } from './chat/ToolExecutionStatus';

// Types
import { Message } from '../types/chat';

interface ToolCallTestProps {
  conversationId: string;
  className?: string;
}

interface ConnectionStatusProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  latency?: number;
  lastError?: string;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status, latency, lastError }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'connected': return 'text-green-500';
      case 'connecting': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'connected': return '🟢';
      case 'connecting': return '🟡';
      case 'error': return '🔴';
      default: return '⚪';
    }
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span>{getStatusIcon()}</span>
      <span className={cn('font-medium', getStatusColor())}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
      {latency && status === 'connected' && (
        <span className="text-gray-400">({latency}ms)</span>
      )}
      {lastError && status === 'error' && (
        <span className="text-red-400 text-xs">({lastError})</span>
      )}
    </div>
  );
};

interface ProcessingIndicatorProps {
  progress?: ToolAwareProcessingProgress;
  isProcessing: boolean;
}

const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = ({ progress, isProcessing }) => {
  if (!isProcessing && !progress) return null;

  const getProgressIcon = () => {
    if (!progress) return '⏳';
    
    switch (progress.type) {
      case 'thinking': return '🤔';
      case 'tool_call': return '🔧';
      case 'tool_execution': return '⚙️';
      case 'tool_result': return '✅';
      case 'response': return '💬';
      case 'done': return '✨';
      default: return '⏳';
    }
  };

  const getProgressText = () => {
    if (!progress) return 'Processing...';
    
    switch (progress.type) {
      case 'thinking': return 'Thinking...';
      case 'tool_call': return 'Calling tools...';
      case 'tool_execution': return 'Executing tools...';
      case 'tool_result': return 'Processing results...';
      case 'response': return 'Generating response...';
      case 'done': return 'Complete';
      default: return 'Processing...';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-2 text-sm text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg"
    >
      <span className="animate-pulse">{getProgressIcon()}</span>
      <span>{getProgressText()}</span>
      {progress?.toolCalls && progress.toolCalls.length > 0 && (
        <span className="text-xs text-gray-500">
          ({progress.toolCalls.length} tools)
        </span>
      )}
    </motion.div>
  );
};

export const UnifiedChatInterface: React.FC<ToolCallTestProps> = ({
  conversationId,
  className
}) => {
  // Ollama integration
  const ollamaIntegration = useOllamaIntegration();
  
  // Unified tool integration
  const unifiedIntegration = useUnifiedToolIntegration(
    conversationId,
    null, // ollamaIntegration doesn't have service property
    {
      streamHandlerUrl: 'ws://localhost:3000',
      enableToolExecution: true,
      enableConversationMemory: true,
      autoConnect: true,
      autoReconnect: true
    }
  );

  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState<ToolAwareProcessingProgress>();

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Handle message submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isProcessing || !unifiedIntegration.isReady()) {
      return;
    }

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsProcessing(true);

    try {
      const result = await unifiedIntegration.processMessage(
        newMessages,
        userMessage.content,
        {
          model: 'llama3.2:3b',
          onProgress: (progress) => {
            setCurrentProgress(progress);
          },
          onToolExecution: (executionId, toolName) => {
            console.log(`Tool execution started: ${toolName} (${executionId})`);
          },
          onToolComplete: (executionId, result) => {
            console.log(`Tool execution completed: ${executionId}`, result);
          },
          onToolError: (executionId, error) => {
            console.error(`Tool execution failed: ${executionId}`, error);
          }
        }
      );

      const assistantMessage: Message = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: result.response,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Error processing message:', error);
      
      const errorMessage: Message = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
      setCurrentProgress(undefined);
    }
  }, [input, isProcessing, messages, unifiedIntegration]);

  // Handle key press
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  }, [handleSubmit]);

  // Register demo tools
  useEffect(() => {
    if (!unifiedIntegration.isReady()) return;

    // Register demo tools
    unifiedIntegration.registerTool('calculator', async (params: any) => {
      const { expression } = params;
      try {
        // Simple calculator implementation
        const result = eval(expression);
        return { result, expression };
      } catch (error) {
        throw new Error(`Invalid expression: ${expression}`);
      }
    });

    unifiedIntegration.registerTool('current_time', async () => {
      return {
        time: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
    });

    unifiedIntegration.registerTool('weather', async (params: any) => {
      const { location } = params;
      // Mock weather data
      return {
        location,
        temperature: Math.round(Math.random() * 30 + 10),
        condition: ['sunny', 'cloudy', 'rainy'][Math.floor(Math.random() * 3)],
        humidity: Math.round(Math.random() * 100)
      };
    });

  }, [unifiedIntegration]);

  const connectionStats = unifiedIntegration.getConnectionStats();
  const toolStats = unifiedIntegration.getToolStats();
  const processingStatus = unifiedIntegration.getProcessingStatus();

  return (
    <div className={cn('flex flex-col h-full bg-white dark:bg-gray-900', className)}>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Tool Call Test Interface
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Conversation: {conversationId}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <ConnectionStatus
              status={connectionStats.connectionStatus}
              latency={connectionStats.latency}
              lastError={connectionStats.lastError}
            />
            
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
              <span className="text-blue-400">🔧</span>
              <span className="text-sm font-medium">
                {connectionStats.activeExecutions > 0 
                  ? `${connectionStats.activeExecutions} tools running`
                  : `${toolStats.availableTools?.length || toolStats.toolCount || 0} tools available`
                }
              </span>
            </div>
          </div>
        </div>

        {/* Tool Dashboard Toggle */}
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {toolStats.toolCount} tools available • Click tool status to manage
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'flex',
              message.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-lg px-4 py-2',
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
              )}
            >
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
              
              <div className="text-xs opacity-70 mt-1">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {/* Processing Indicator */}
        <AnimatePresence>
          {(isProcessing || currentProgress) && (
            <ProcessingIndicator
              progress={currentProgress}
              isProcessing={isProcessing}
            />
          )}
        </AnimatePresence>

        {/* Tool Execution Status */}
        {connectionStats.activeExecutions > 0 && (
          <ToolExecutionStatus
            currentToolCalls={[]} // Would be populated from actual tool calls
            currentToolResults={[]} // Would be populated from actual results
            isExecuting={connectionStats.activeExecutions > 0}
            platform="web"
            theme="dark"
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={
              unifiedIntegration.isReady()
                ? "Type a message... (try 'calculate 2+2' or 'what time is it?')"
                : "Connecting to services..."
            }
            disabled={isProcessing || !unifiedIntegration.isReady()}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          
          <button
            type="submit"
            disabled={isProcessing || !input.trim() || !unifiedIntegration.isReady()}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? '⏳' : '📤'}
          </button>
        </form>

        {/* Status Bar */}
        <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span>System: {processingStatus.systemStatus}</span>
            <span>Tools: {toolStats.toolCount}</span>
            <span>Active: {connectionStats.activeExecutions}</span>
          </div>
          
          <div className="flex items-center gap-2">
            {connectionStats.latency && (
              <span>Latency: {connectionStats.latency}ms</span>
            )}
            <span>Ready: {unifiedIntegration.isReady() ? '✅' : '❌'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Keep the old export for backward compatibility
export const ToolCallTest = UnifiedChatInterface;