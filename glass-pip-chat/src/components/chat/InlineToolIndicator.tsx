/**
 * Inline Tool Indicator Component
 * 
 * Shows a small inline indicator when a tool is being executed during streaming.
 * Similar to VS Code Copilot's file edit indicator - minimal and non-intrusive.
 */

import { motion } from 'framer-motion';
import { Loader2, Check, X, Wrench } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ToolExecution {
  id: string;
  name: string;
  status: 'pending' | 'executing' | 'success' | 'error';
  result?: any;
  error?: string;
  startTime: number;
  endTime?: number;
}

interface InlineToolIndicatorProps {
  tool: ToolExecution;
  theme: 'light' | 'dark';
  compact?: boolean;
}

export function InlineToolIndicator({ tool, theme, compact = false }: InlineToolIndicatorProps) {
  const getStatusIcon = () => {
    switch (tool.status) {
      case 'pending':
      case 'executing':
        return <Loader2 className="w-3 h-3 animate-spin" />;
      case 'success':
        return <Check className="w-3 h-3 text-green-400" />;
      case 'error':
        return <X className="w-3 h-3 text-red-400" />;
      default:
        return <Wrench className="w-3 h-3" />;
    }
  };

  const getStatusColor = () => {
    switch (tool.status) {
      case 'pending':
        return 'border-gray-400/30 bg-gray-500/10';
      case 'executing':
        return 'border-blue-400/30 bg-blue-500/10';
      case 'success':
        return 'border-green-400/30 bg-green-500/10';
      case 'error':
        return 'border-red-400/30 bg-red-500/10';
      default:
        return 'border-gray-400/30 bg-gray-500/10';
    }
  };

  const formatToolName = (name: string) => {
    // Convert snake_case or camelCase to readable format
    return name
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase()
      .replace(/^\w/, c => c.toUpperCase());
  };

  if (compact) {
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono border",
          getStatusColor(),
          theme === 'dark' ? 'text-white/70' : 'text-black/70'
        )}
      >
        {getStatusIcon()}
        <span className="max-w-[100px] truncate">{formatToolName(tool.name)}</span>
      </motion.span>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className={cn(
        "inline-flex items-center gap-2 px-2 py-1 rounded-md border my-1",
        getStatusColor(),
        theme === 'dark' ? 'text-white/80' : 'text-black/80'
      )}
    >
      {getStatusIcon()}
      <span className="text-xs font-medium">{formatToolName(tool.name)}</span>
      {tool.status === 'executing' && (
        <span className="text-xs opacity-60">running...</span>
      )}
      {tool.status === 'success' && tool.endTime && tool.startTime && (
        <span className="text-xs opacity-60">
          {((tool.endTime - tool.startTime) / 1000).toFixed(1)}s
        </span>
      )}
      {tool.status === 'error' && tool.error && (
        <span className="text-xs text-red-400 max-w-[150px] truncate" title={tool.error}>
          {tool.error}
        </span>
      )}
    </motion.div>
  );
}

/**
 * Container for multiple tool executions shown inline during streaming
 */
interface InlineToolExecutionsProps {
  tools: ToolExecution[];
  theme: 'light' | 'dark';
}

export function InlineToolExecutions({ tools, theme }: InlineToolExecutionsProps) {
  if (tools.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 my-2">
      {tools.map(tool => (
        <InlineToolIndicator key={tool.id} tool={tool} theme={theme} compact={tools.length > 2} />
      ))}
    </div>
  );
}
