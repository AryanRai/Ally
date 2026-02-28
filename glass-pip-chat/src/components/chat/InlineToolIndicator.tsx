/**
 * Inline Tool Indicator Component
 * 
 * Shows a small inline pill when a tool is being executed during streaming.
 * Similar to VS Code Copilot's file edit indicator - minimal and expandable.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, X, Wrench, ChevronDown, ChevronUp } from 'lucide-react';
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

export function InlineToolIndicator({ tool, theme }: InlineToolIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

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
        return 'border-gray-400/30 bg-gray-500/10 hover:bg-gray-500/20';
      case 'executing':
        return 'border-blue-400/40 bg-blue-500/15 hover:bg-blue-500/25';
      case 'success':
        return 'border-green-400/40 bg-green-500/15 hover:bg-green-500/25';
      case 'error':
        return 'border-red-400/40 bg-red-500/15 hover:bg-red-500/25';
      default:
        return 'border-gray-400/30 bg-gray-500/10 hover:bg-gray-500/20';
    }
  };

  const formatToolName = (name: string) => {
    return name
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase()
      .replace(/^\w/, c => c.toUpperCase());
  };

  const formatResult = (result: any) => {
    if (!result) return null;
    if (typeof result === 'string') return result;
    if (result.formatted) return result.formatted;
    if (result.result !== undefined) return String(result.result);
    return JSON.stringify(result, null, 2);
  };

  // Compact pill style (like VS Code Copilot)
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="inline-block"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-all cursor-pointer",
          getStatusColor(),
          theme === 'dark' ? 'text-white/80' : 'text-black/80'
        )}
      >
        {getStatusIcon()}
        <span className="font-medium">{formatToolName(tool.name)}</span>
        {tool.status === 'executing' && (
          <span className="opacity-60 text-[10px]">...</span>
        )}
        {tool.status === 'success' && tool.endTime && tool.startTime && (
          <span className="opacity-50 text-[10px]">
            {((tool.endTime - tool.startTime) / 1000).toFixed(1)}s
          </span>
        )}
        {(tool.result || tool.error) && (
          expanded ? <ChevronUp className="w-3 h-3 opacity-50" /> : <ChevronDown className="w-3 h-3 opacity-50" />
        )}
      </button>
      
      {/* Expandable result section */}
      <AnimatePresence>
        {expanded && (tool.result || tool.error) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              "mt-1 p-2 rounded-lg text-xs font-mono overflow-x-auto",
              theme === 'dark' ? 'bg-black/30 text-white/70' : 'bg-gray-100 text-gray-700'
            )}
          >
            {tool.error ? (
              <span className="text-red-400">{tool.error}</span>
            ) : (
              <pre className="whitespace-pre-wrap break-words">{formatResult(tool.result)}</pre>
            )}
          </motion.div>
        )}
      </AnimatePresence>
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
    <div className="flex flex-wrap gap-1.5 my-2">
      {tools.map(tool => (
        <InlineToolIndicator key={tool.id} tool={tool} theme={theme} />
      ))}
    </div>
  );
}
