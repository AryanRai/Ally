import React, { useState } from 'react';
import { useOllamaIntegration } from '../hooks/useOllamaIntegration';

interface StreamingTestProps {
  onClose: () => void;
}

export const StreamingTest: React.FC<StreamingTestProps> = ({ onClose }) => {
  const [testOutput, setTestOutput] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const ollamaIntegration = useOllamaIntegration();

  const runStreamingTest = async () => {
    if (!ollamaIntegration.ollamaAvailable) {
      setTestOutput('❌ Ollama is not available. Please ensure Ollama is running.');
      return;
    }

    setIsStreaming(true);
    setTestOutput('🚀 Starting streaming test...\n\n');

    const testMessages = [
      {
        id: 'test-1',
        role: 'user' as const,
        content: 'Explain how photosynthesis works in plants. Think through the process step by step.',
        timestamp: Date.now()
      }
    ];

    try {
      await ollamaIntegration.sendMessageToOllama(
        testMessages,
        'Explain how photosynthesis works in plants. Think through the process step by step.',
        (update) => {
          let statusText = '';
          
          if (update.type === 'thinking') {
            statusText = `🧠 THINKING PHASE:\n${update.thinking}\n\n`;
            if (update.response) {
              statusText += `📝 RESPONSE PHASE:\n${update.response}\n\n`;
            }
          } else if (update.type === 'response') {
            statusText = `🧠 THINKING PHASE:\n${update.thinking || 'No thinking detected'}\n\n`;
            statusText += `📝 RESPONSE PHASE:\n${update.response}\n\n`;
          } else if (update.type === 'done') {
            statusText = `✅ STREAMING COMPLETE!\n\n`;
            statusText += `🧠 FINAL THINKING:\n${update.thinking || 'No thinking detected'}\n\n`;
            statusText += `📝 FINAL RESPONSE:\n${update.response}\n\n`;
            statusText += `🎉 Test completed successfully!`;
          }
          
          setTestOutput(prev => {
            // Replace the content to show real-time updates
            const lines = prev.split('\n');
            const headerLine = lines[0]; // Keep the "Starting streaming test..." line
            return `${headerLine}\n\n${statusText}`;
          });
        }
      );
    } catch (error) {
      setTestOutput(prev => prev + `\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Real-time Streaming Test</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
        
        <div className="mb-4">
          <p className="text-gray-300 text-sm mb-2">
            This test will verify that real-time thinking and response streaming is working correctly.
          </p>
          <div className="flex gap-2">
            <button
              onClick={runStreamingTest}
              disabled={isStreaming || !ollamaIntegration.ollamaAvailable}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isStreaming || !ollamaIntegration.ollamaAvailable
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isStreaming ? '🔄 Streaming...' : '🚀 Run Test'}
            </button>
            <button
              onClick={() => setTestOutput('')}
              disabled={isStreaming}
              className="px-4 py-2 rounded-lg font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 h-96 overflow-y-auto">
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
            {testOutput || 'Click "Run Test" to start the streaming test...'}
          </pre>
        </div>

        <div className="mt-4 text-xs text-gray-500">
          <p>
            <strong>Status:</strong> Ollama {ollamaIntegration.ollamaAvailable ? '✅ Connected' : '❌ Disconnected'} | 
            Model: {ollamaIntegration.currentModel || 'None selected'}
          </p>
        </div>
      </div>
    </div>
  );
};