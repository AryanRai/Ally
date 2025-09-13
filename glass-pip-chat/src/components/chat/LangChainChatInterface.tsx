/**
 * LangChain Chat Interface Component
 * 
 * Enhanced chat interface that uses LangChain for improved tool calling
 * and multi-step reasoning. Integrates with existing UI components.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Square, RefreshCw, Trash2, Settings, Wrench, Download, Upload } from 'lucide-react';
import { useLangChainChat, ChatMessage } from '../../hooks/useLangChainChat';
import { ToolExecutionStep } from '../../services/langchainService';

interface LangChainChatInterfaceProps {
  className?: string;
  sessionId?: string;
  userId?: string;
  onMessage?: (message: ChatMessage) => void;
  onToolExecution?: (step: ToolExecutionStep) => void;
}

interface ToolStepDisplayProps {
  step: ToolExecutionStep;
  isActive?: boolean;
}

const ToolStepDisplay: React.FC<ToolStepDisplayProps> = ({ step, isActive = false }) => {
  return (
    <div className={`p-3 rounded-lg border-l-4 ${
      isActive 
        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
        : step.output 
          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
          : 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <Wrench className="w-4 h-4" />
        <span className="font-medium text-sm">
          Step {step.step}: {step.tool}
        </span>
        {step.output && (
          <span className="text-xs text-gray-500">
            ({step.timestamp}ms)
          </span>
        )}
      </div>
      
      {step.reasoning && (
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          <strong>Reasoning:</strong> {step.reasoning}
        </div>
      )}
      
      {step.input && (
        <div className="text-sm mb-2">
          <strong>Input:</strong>
          <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto">
            {typeof step.input === 'string' ? step.input : JSON.stringify(step.input, null, 2)}
          </pre>
        </div>
      )}
      
      {step.output && (
        <div className="text-sm">
          <strong>Output:</strong>
          <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto">
            {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

interface MessageDisplayProps {
  message: ChatMessage;
  isStreaming?: boolean;
  currentResponse?: string;
  currentSteps?: ToolExecutionStep[];
}

const MessageDisplay: React.FC<MessageDisplayProps> = ({ 
  message, 
  isStreaming = false, 
  currentResponse = '',
  currentSteps = []
}) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] rounded-lg p-4 ${
        isUser 
          ? 'bg-blue-500 text-white' 
          : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
      }`}>
        <div className="whitespace-pre-wrap">
          {message.content}
          {isStreaming && !isUser && currentResponse}
        </div>
        
        {/* Show tool execution steps */}
        {(message.toolSteps || currentSteps.length > 0) && (
          <div className="mt-4 space-y-2">
            <div className="text-sm font-medium opacity-75">Tool Executions:</div>
            {(message.toolSteps || []).map((step, index) => (
              <ToolStepDisplay key={index} step={step} />
            ))}
            {currentSteps.map((step, index) => (
              <ToolStepDisplay key={`current-${index}`} step={step} isActive />
            ))}
          </div>
        )}
        
        {/* Show execution metadata */}
        {(message.executionTime || message.tokensUsed) && (
          <div className="mt-2 text-xs opacity-60 flex gap-4">
            {message.executionTime && (
              <span>⏱️ {message.executionTime}ms</span>
            )}
            {message.tokensUsed && (
              <span>🔤 {message.tokensUsed} tokens</span>
            )}
          </div>
        )}
        
        <div className="text-xs opacity-50 mt-2">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  availableTools: Array<{ name: string; description: string }>;
  onTestTools: () => Promise<{ working: string[]; failed: string[] }>;
  onReloadTools: () => Promise<void>;
  onClearMemory: () => Promise<void>;
  onExportChat: () => string;
  onImportChat: (data: string) => void;
  memoryEnabled: boolean;
  onConfigUpdate: (config: any) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  availableTools,
  onTestTools,
  onReloadTools,
  onClearMemory,
  onExportChat,
  onImportChat,
  memoryEnabled,
  onConfigUpdate
}) => {
  const [testResults, setTestResults] = useState<{ working: string[]; failed: string[] } | null>(null);
  const [isTestingTools, setIsTestingTools] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTestTools = async () => {
    setIsTestingTools(true);
    try {
      const results = await onTestTools();
      setTestResults(results);
    } catch (error) {
      console.error('Tool test failed:', error);
    } finally {
      setIsTestingTools(false);
    }
  };

  const handleExportChat = () => {
    const data = onExportChat();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportChat = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result as string;
      onImportChat(data);
    };
    reader.readAsText(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">LangChain Chat Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Available Tools */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Available Tools ({availableTools.length})</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {availableTools.map((tool, index) => (
              <div key={index} className="p-2 bg-gray-50 dark:bg-gray-700 rounded">
                <div className="font-medium text-sm">{tool.name}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">{tool.description}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tool Testing */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-lg font-semibold">Tool Testing</h3>
            <button
              onClick={handleTestTools}
              disabled={isTestingTools}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {isTestingTools ? 'Testing...' : 'Test All Tools'}
            </button>
            <button
              onClick={onReloadTools}
              className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          
          {testResults && (
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-green-600">✓ Working: {testResults.working.length}</span>
                <span className="ml-4 text-red-600">✗ Failed: {testResults.failed.length}</span>
              </div>
              {testResults.failed.length > 0 && (
                <div className="text-xs text-red-600">
                  Failed tools: {testResults.failed.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Memory Management */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Memory Management</h3>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={memoryEnabled}
                onChange={(e) => onConfigUpdate({ enableMemory: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Enable conversation memory</span>
            </label>
            <button
              onClick={onClearMemory}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              Clear Memory
            </button>
          </div>
        </div>

        {/* Chat Mode */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Chat Mode</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                onChange={(e) => onConfigUpdate({ casualChatMode: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Casual chat mode (disables tools for simple conversation)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                onChange={(e) => onConfigUpdate({ enableTools: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Enable tools (uncheck to disable all tool usage)</span>
            </label>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              💡 Enable casual chat mode for simple conversations without tool interference
            </div>
          </div>
        </div>

        {/* Chat Management */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Chat Management</h3>
          <div className="flex gap-2">
            <button
              onClick={handleExportChat}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              <Download className="w-4 h-4" />
              Export Chat
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
            >
              <Upload className="w-4 h-4" />
              Import Chat
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportChat}
              className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const LangChainChatInterface: React.FC<LangChainChatInterfaceProps> = ({
  className = '',
  sessionId,
  userId,
  onMessage,
  onToolExecution
}) => {
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [langChainAvailable, setLangChainAvailable] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    state,
    sendMessage,
    clearChat,
    clearMemory,
    stopGeneration,
    reloadTools,
    updateConfig,
    testTools,
    exportChat,
    importChat
  } = useLangChainChat({
    sessionId,
    userId,
    enableMemory: true,
    enableStreaming: true,
    onToolExecution,
    onError: (error) => {
      console.error('LangChain chat error:', error);
      if (error.message.includes('LangChain is not available')) {
        setLangChainAvailable(false);
      }
    }
  });

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, state.currentResponse]);

  // Notify parent of new messages
  useEffect(() => {
    if (state.messages.length > 0) {
      const lastMessage = state.messages[state.messages.length - 1];
      onMessage?.(lastMessage);
    }
  }, [state.messages, onMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || state.isLoading) return;

    const message = input.trim();
    setInput('');
    await sendMessage(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Installation Notice */}
      {!langChainAvailable && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="flex items-start gap-3">
            <div className="text-yellow-600 dark:text-yellow-400">⚠️</div>
            <div>
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                LangChain Dependencies Required
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                To use LangChain enhanced chat, please install the required dependencies:
              </p>
              <code className="block p-2 bg-yellow-100 dark:bg-yellow-900/40 rounded text-sm font-mono text-yellow-800 dark:text-yellow-200">
                npm install @langchain/core @langchain/ollama @langchain/community langchain --legacy-peer-deps
              </code>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                Then restart the application to enable enhanced tool calling.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">LangChain Chat</h2>
          <span className="text-sm text-gray-500">
            ({state.availableTools.length} tools available)
          </span>
          {!langChainAvailable && (
            <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-2 py-1 rounded">
              Fallback Mode
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={reloadTools}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Reload tools"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <button
            onClick={clearChat}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Display */}
      {state.error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-300">
          <strong>Error:</strong> {state.error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {state.messages.map((message) => (
          <MessageDisplay
            key={message.id}
            message={message}
          />
        ))}
        
        {/* Current streaming response */}
        {state.isStreaming && state.currentResponse && (
          <MessageDisplay
            message={{
              id: 'streaming',
              role: 'assistant',
              content: '',
              timestamp: Date.now()
            }}
            isStreaming={true}
            currentResponse={state.currentResponse}
            currentSteps={state.currentSteps}
          />
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything... I can use tools to help you!"
            className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            rows={1}
            disabled={state.isLoading}
          />
          
          {state.isLoading ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          )}
        </div>
      </form>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        availableTools={state.availableTools}
        onTestTools={testTools}
        onReloadTools={reloadTools}
        onClearMemory={clearMemory}
        onExportChat={exportChat}
        onImportChat={importChat}
        memoryEnabled={state.memoryEnabled}
        onConfigUpdate={updateConfig}
      />
    </div>
  );
};