/**
 * Inline Tool Indicator Component
 * 
 * Shows expandable pills for tool executions and thinking blocks.
 * Click to expand and see full content, easy to copy.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, X, Wrench, Brain, Copy, ChevronDown, ChevronUp } from 'lucide-react';
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
}

export function InlineToolIndicator({ tool, theme }: InlineToolIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const formatResult = (result: any): string => {
    if (!result) return '';
    if (typeof result === 'string') return result;
    if (result.formatted) return result.formatted;
    if (result.result !== undefined) return String(result.result);
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: any) => c.type === 'text');
      if (textContent?.text) return textContent.text;
    }
    return JSON.stringify(result, null, 2);
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const content = tool.error || formatResult(tool.result);
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resultContent = tool.error || formatResult(tool.result);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-block align-middle mr-1 mb-1"
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
        {resultContent && (
          expanded ? <ChevronUp className="w-3 h-3 opacity-50" /> : <ChevronDown className="w-3 h-3 opacity-50" />
        )}
      </button>
      
      <AnimatePresence>
        {expanded && resultContent && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              "mt-1 p-2 rounded-lg text-xs font-mono overflow-x-auto relative",
              theme === 'dark' ? 'bg-black/30 text-white/70' : 'bg-gray-100 text-gray-700'
            )}
          >
            <button
              onClick={handleCopy}
              className={cn(
                "absolute top-1 right-1 p-1 rounded transition-colors",
                copied ? 'text-green-400' : 'text-white/40 hover:text-white/70'
              )}
              title="Copy"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
            {tool.error ? (
              <span className="text-red-400">{tool.error}</span>
            ) : (
              <pre className="whitespace-pre-wrap break-words pr-6">{resultContent}</pre>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Thinking Pill - shows model's thinking process
 */
interface ThinkingPillProps {
  thinking: string;
  theme: 'light' | 'dark';
}

export function ThinkingPill({ thinking, theme }: ThinkingPillProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(thinking);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!thinking || thinking.trim().length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-block align-middle mr-1 mb-1"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-all cursor-pointer",
          "border-purple-400/40 bg-purple-500/15 hover:bg-purple-500/25",
          theme === 'dark' ? 'text-white/80' : 'text-black/80'
        )}
      >
        <Brain className="w-3 h-3 text-purple-400" />
        <span className="font-medium">Thinking</span>
        {expanded ? <ChevronUp className="w-3 h-3 opacity-50" /> : <ChevronDown className="w-3 h-3 opacity-50" />}
      </button>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              "mt-1 p-2 rounded-lg text-xs overflow-x-auto relative max-h-48 overflow-y-auto",
              theme === 'dark' ? 'bg-purple-900/20 text-white/70 border border-purple-500/20' : 'bg-purple-50 text-gray-700 border border-purple-200'
            )}
          >
            <button
              onClick={handleCopy}
              className={cn(
                "absolute top-1 right-1 p-1 rounded transition-colors",
                copied ? 'text-green-400' : 'text-white/40 hover:text-white/70'
              )}
              title="Copy"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
            <pre className="whitespace-pre-wrap break-words pr-6">{thinking}</pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Container for multiple tool executions shown inline
 */
interface InlineToolExecutionsProps {
  tools: ToolExecution[];
  theme: 'light' | 'dark';
  thinking?: string;
}

export function InlineToolExecutions({ tools, theme, thinking }: InlineToolExecutionsProps) {
  if (tools.length === 0 && !thinking) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 my-2">
      {thinking && <ThinkingPill thinking={thinking} theme={theme} />}
      {tools.map(tool => (
        <InlineToolIndicator key={tool.id} tool={tool} theme={theme} />
      ))}
    </div>
  );
}

/**
 * Parse a message content to extract tool results and thinking for display as pills
 */
export function parseMessageForPills(content: string): {
  cleanContent: string;
  toolResults: Array<{ name: string; result: string }>;
  thinking: string | null;
} {
  let cleanContent = content;
  const toolResults: Array<{ name: string; result: string }> = [];
  let thinking: string | null = null;

  // Extract thinking blocks
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch) {
    thinking = thinkMatch[1].trim();
    cleanContent = cleanContent.replace(thinkMatch[0], '');
  }

  // Extract tool result blocks (🔧 **tool_name**\n```\nresult\n```)
  const toolResultRegex = /🔧 \*\*([^*]+)\*\*\s*\n```\n?([\s\S]*?)\n?```/g;
  let match;
  while ((match = toolResultRegex.exec(content)) !== null) {
    toolResults.push({
      name: match[1].trim(),
      result: match[2].trim()
    });
    cleanContent = cleanContent.replace(match[0], '');
  }

  // Also handle inline format: 🔧 **tool_name** → `result`
  const inlineToolRegex = /🔧 \*\*([^*]+)\*\* → `([^`]+)`/g;
  while ((match = inlineToolRegex.exec(content)) !== null) {
    toolResults.push({
      name: match[1].trim(),
      result: match[2].trim()
    });
    cleanContent = cleanContent.replace(match[0], '');
  }

  return {
    cleanContent: cleanContent.trim(),
    toolResults,
    thinking
  };
}

/**
 * Message Pills - renders tool results and thinking as pills for a saved message
 */
interface MessagePillsProps {
  content: string;
  theme: 'light' | 'dark';
}

export function MessagePills({ content, theme }: MessagePillsProps) {
  const { toolResults, thinking } = parseMessageForPills(content);
  
  if (toolResults.length === 0 && !thinking) return null;

  const tools: ToolExecution[] = toolResults.map((tr, i) => ({
    id: `saved-${i}`,
    name: tr.name,
    status: 'success' as const,
    result: tr.result,
    startTime: 0,
    endTime: 0
  }));

  return <InlineToolExecutions tools={tools} theme={theme} thinking={thinking || undefined} />;
}
