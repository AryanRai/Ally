/**
 * Tool Execution Status Component
 * Requirements: 9.2, 9.3
 * 
 * Displays real-time tool execution progress and status
 * Shows tool execution history in conversation interface
 * Provides tool status indicators and progress bars
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wrench, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Play,
  Pause
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
}

export interface ToolCallResult {
  id: string;
  name: string;
  result: any;
  error?: string;
  executionTime: number;
  status: 'success' | 'error';
}

export interface ToolExecutionProgress {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'done';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolCallResult[];
  isComplete: boolean;
}

interface ToolExecutionStatusProps {
  isExecuting: boolean;
  currentToolCalls: ToolCall[];
  currentToolResults: ToolCallResult[];
  progress?: ToolExecutionProgress;
  platform: string;
  theme: 'light' | 'dark';
  compact?: boolean;
  showDetails?: boolean;
  onToggleDetails?: () => void;
}

export function ToolExecutionStatus({
  isExecuting,
  currentToolCalls,
  currentToolResults,
  progress,
  platform,
  theme,
  compact = false,
  showDetails = false,
  onToggleDetails
}: ToolExecutionStatusProps) {
  if (!isExecuting && currentToolCalls.length === 0 && currentToolResults.length === 0) {
    return null;
  }

  const getToolStatus = (toolCall: ToolCall): 'pending' | 'running' | 'completed' | 'failed' => {
    if (toolCall.status) return toolCall.status;
    
    const result = currentToolResults.find(r => r.id === toolCall.id);
    if (result) {
      return result.status === 'success' ? 'completed' : 'failed';
    }
    
    return isExecuting ? 'running' : 'pending';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-3 h-3 animate-spin text-blue-400" />;
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-green-400" />;
      case 'failed':
        return <XCircle className="w-3 h-3 text-red-400" />;
      case 'pending':
      default:
        return <Clock className="w-3 h-3 text-yellow-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'border-blue-400/30 bg-blue-500/10';
      case 'completed':
        return 'border-green-400/30 bg-green-500/10';
      case 'failed':
        return 'border-red-400/30 bg-red-500/10';
      case 'pending':
      default:
        return 'border-yellow-400/30 bg-yellow-500/10';
    }
  };

  const formatExecutionTime = (time: number) => {
    if (time < 1000) return `${time}ms`;
    return `${(time / 1000).toFixed(1)}s`;
  };

  const formatParameters = (params: Record<string, any>) => {
    const entries = Object.entries(params);
    if (entries.length === 0) return 'No parameters';
    
    return entries
      .slice(0, 3) // Show max 3 parameters
      .map(([key, value]) => {
        const valueStr = typeof value === 'string' && value.length > 20 
          ? `${value.substring(0, 20)}...`
          : String(value);
        return `${key}: ${valueStr}`;
      })
      .join(', ');
  };

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border",
          ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
          ThemeUtils.getBorderClass(platform, theme),
          isExecuting ? "border-blue-400/30" : "border-green-400/30"
        )}
      >
        <Wrench className="w-4 h-4 text-blue-400" />
        <span className={cn("text-sm", ThemeUtils.getTextClass(platform, theme))}>
          {isExecuting ? (
            <>
              <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
              Executing {currentToolCalls.length} tool{currentToolCalls.length !== 1 ? 's' : ''}...
            </>
          ) : (
            <>
              <CheckCircle className="w-3 h-3 inline text-green-400 mr-1" />
              Completed {currentToolResults.length} tool{currentToolResults.length !== 1 ? 's' : ''}
            </>
          )}
        </span>
        {onToggleDetails && (
          <button
            onClick={onToggleDetails}
            className={cn(
              "p-1 rounded hover:bg-white/10 transition-colors",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}
          >
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "border rounded-lg overflow-hidden",
        ThemeUtils.getBackgroundClass(platform, theme, 'secondary'),
        ThemeUtils.getBorderClass(platform, theme)
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-blue-400" />
          <span className={cn("font-medium", ThemeUtils.getTextClass(platform, theme))}>
            Tool Execution
          </span>
          {isExecuting && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 rounded-full">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="text-xs text-blue-300">Running</span>
            </div>
          )}
        </div>
        
        {onToggleDetails && (
          <button
            onClick={onToggleDetails}
            className={cn(
              "p-1 rounded hover:bg-white/10 transition-colors",
              ThemeUtils.getTextClass(platform, theme, 'secondary')
            )}
          >
            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Progress indicator */}
      {isExecuting && (
        <div className="px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
              <motion.div
                className="h-full bg-blue-400 rounded-full"
                initial={{ width: 0 }}
                animate={{ 
                  width: currentToolResults.length > 0 
                    ? `${(currentToolResults.length / currentToolCalls.length) * 100}%`
                    : '20%'
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
              {currentToolResults.length}/{currentToolCalls.length}
            </span>
          </div>
          
          {progress && (
            <div className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
              {progress.type === 'thinking' && '💭 Planning tool execution...'}
              {progress.type === 'tool_call' && '🔧 Executing tools...'}
              {progress.type === 'tool_result' && '📊 Processing results...'}
              {progress.type === 'response' && '💬 Generating response...'}
            </div>
          )}
        </div>
      )}

      {/* Tool calls list */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 space-y-3 max-h-64 overflow-y-auto">
              {currentToolCalls.map((toolCall) => {
                const status = getToolStatus(toolCall);
                const result = currentToolResults.find(r => r.id === toolCall.id);
                
                return (
                  <motion.div
                    key={toolCall.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "border rounded-lg p-3",
                      getStatusColor(status)
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(status)}
                        <span className={cn("font-medium text-sm", ThemeUtils.getTextClass(platform, theme))}>
                          {toolCall.name}
                        </span>
                      </div>
                      
                      {result && (
                        <span className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                          {formatExecutionTime(result.executionTime)}
                        </span>
                      )}
                    </div>
                    
                    <div className={cn("text-xs mb-2", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                      {formatParameters(toolCall.parameters)}
                    </div>
                    
                    {result && (
                      <div className="mt-2">
                        {result.error ? (
                          <div className="flex items-start gap-2 p-2 bg-red-500/10 rounded border border-red-500/20">
                            <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                            <span className={cn("text-xs text-red-300")}>
                              {result.error}
                            </span>
                          </div>
                        ) : (
                          <div className="p-2 bg-green-500/10 rounded border border-green-500/20">
                            <span className={cn("text-xs", ThemeUtils.getTextClass(platform, theme, 'secondary'))}>
                              {typeof result.result === 'object' 
                                ? JSON.stringify(result.result, null, 2).substring(0, 100) + '...'
                                : String(result.result).substring(0, 100) + (String(result.result).length > 100 ? '...' : '')
                              }
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}