import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Activity, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useOllamaIntegration } from '../hooks/useOllamaIntegration';

interface StreamingTestProps {
  onClose: () => void;
  platform?: string;
  theme?: 'light' | 'dark';
}

export const StreamingTest: React.FC<StreamingTestProps> = ({ 
  onClose, 
  platform = 'win32', 
  theme = 'dark' 
}) => {
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
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-md z-50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4 z-50" onClick={(e) => e.stopPropagation()}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)'
          }}
          className={cn(
            "w-full max-w-2xl max-h-[85vh] overflow-hidden",
            "rounded-2xl border shadow-[0_12px_60px_rgba(0,0,0,0.6)]",
            // Theme-aware styling with less transparency
            theme === 'dark' 
              ? "border-white/30 text-white/95" 
              : "border-black/30 text-black/95",
            // Platform-specific backgrounds with reduced transparency
            platform === 'win32' 
              ? "bg-black/60" // More opaque for Windows acrylic
              : theme === 'dark'
                ? "bg-gradient-to-b from-gray-900/95 to-gray-800/95"
                : "bg-gradient-to-b from-gray-100/95 to-gray-200/95"
          )}
        >
          {/* Header */}
          <div className={cn(
            "flex items-center justify-between p-4 border-b",
            platform === 'win32'
              ? "border-white/10"
              : theme === 'dark' ? "border-white/10" : "border-black/10"
          )}>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Real-time Streaming Test
            </h2>
            <button
              onClick={onClose}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                platform === 'win32' 
                  ? "hover:bg-white/10"
                  : theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
              )}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 max-h-[calc(85vh-80px)] overflow-y-auto">
            {/* Description */}
            <div className={cn(
              "p-3 rounded-lg border",
              platform === 'win32'
                ? "border-white/10 bg-white/5"
                : theme === 'dark' ? "border-white/10 bg-white/5" : "border-black/10 bg-black/5"
            )}>
              <p className={cn(
                "text-sm",
                platform === 'win32'
                  ? "text-white/80"
                  : theme === 'dark' ? "text-white/80" : "text-black/80"
              )}>
                This test verifies that real-time thinking and response streaming is working correctly with Ollama.
              </p>
            </div>

            {/* Controls */}
            <div className="flex gap-2">
              <button
                onClick={runStreamingTest}
                disabled={isStreaming || !ollamaIntegration.ollamaAvailable}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors border",
                  isStreaming || !ollamaIntegration.ollamaAvailable
                    ? "opacity-50 cursor-not-allowed"
                    : "",
                  platform === 'win32'
                    ? "border-white/20 bg-white/10 hover:bg-white/20 text-white/90"
                    : theme === 'dark' 
                      ? "border-white/20 bg-white/10 hover:bg-white/20 text-white/90"
                      : "border-black/20 bg-black/10 hover:bg-black/20 text-black/90"
                )}
              >
                {isStreaming ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Streaming...
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4" />
                    Run Test
                  </>
                )}
              </button>
              
              <button
                onClick={() => setTestOutput('')}
                disabled={isStreaming}
                className={cn(
                  "px-4 py-2 rounded-lg font-medium transition-colors border disabled:opacity-50",
                  platform === 'win32'
                    ? "border-white/20 bg-white/5 hover:bg-white/10 text-white/80"
                    : theme === 'dark' 
                      ? "border-white/20 bg-white/5 hover:bg-white/10 text-white/80"
                      : "border-black/20 bg-black/5 hover:bg-black/10 text-black/80"
                )}
              >
                Clear
              </button>
            </div>

            {/* Output */}
            <div className={cn(
              "rounded-lg border p-4 h-96 overflow-y-auto",
              platform === 'win32'
                ? "border-white/10 bg-black/20"
                : theme === 'dark' 
                  ? "border-white/10 bg-black/20"
                  : "border-black/10 bg-white/20"
            )}>
              <pre className={cn(
                "text-sm whitespace-pre-wrap font-mono",
                platform === 'win32'
                  ? "text-white/80"
                  : theme === 'dark' ? "text-white/80" : "text-black/80"
              )}>
                {testOutput || 'Click "Run Test" to start the streaming test...'}
              </pre>
            </div>

            {/* Status */}
            <div className={cn(
              "flex items-center gap-4 p-3 rounded-lg border text-xs",
              platform === 'win32'
                ? "border-white/10 bg-white/5"
                : theme === 'dark' ? "border-white/10 bg-white/5" : "border-black/10 bg-black/5"
            )}>
              <div className="flex items-center gap-2">
                {ollamaIntegration.ollamaAvailable ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )}
                <span className={cn(
                  "font-medium",
                  platform === 'win32'
                    ? "text-white/80"
                    : theme === 'dark' ? "text-white/80" : "text-black/80"
                )}>
                  Ollama: {ollamaIntegration.ollamaAvailable ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className={cn(
                platform === 'win32'
                  ? "text-white/60"
                  : theme === 'dark' ? "text-white/60" : "text-black/60"
              )}>
                Model: {ollamaIntegration.currentModel || 'None selected'}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};