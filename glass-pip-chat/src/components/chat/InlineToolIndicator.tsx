/**
 * Inline Tool Indicator Component
 * 
 * Shows expandable pills for tool executions and thinking blocks.
 * Click to expand and see full content, easy to copy.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, X, Wrench, Brain, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ToolExecution {
  id: string;
  name: string;
  /** Tool input parameters — stored so the pill can show input on expand */
  parameters?: Record<string, unknown>;
  status: 'pending' | 'executing' | 'success' | 'error';
  result?: any;
  error?: string;
  startTime: number;
  endTime?: number;
  /** When true this tool ran in a parallel batch alongside siblings */
  isParallel?: boolean;
}

/**
 * A streaming segment — either a text chunk or a tool pill.
 * Used to interleave assistant text with tool calls inline (Cursor-style).
 */
export interface Segment {
  type: 'text' | 'tool';
  content?: string;
  toolExecution?: ToolExecution;
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
    // Special display names for common tools
    const displayNames: Record<string, string> = {
      'get_current_time': '🕐 Time',
      'list_directory': '📁 Files',
      'read_file': '📄 Read',
      'read_text_file': '📄 Read',
      'write_file': '✏️ Write',
      'calculate': '🔢 Calc',
      'search_files': '🔍 Search',
      'create_directory': '📁 Create',
      'move_file': '📦 Move',
      'edit_file': '✏️ Edit',
    };
    
    if (displayNames[name]) return displayNames[name];
    
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
    
    // Special formatting for time results
    if (result.time || result.formatted) {
      if (result.formatted && result.timezone) {
        return `${result.formatted} (${result.timezone})`;
      }
      return result.formatted || result.time;
    }
    
    // Special formatting for calculation results
    if (result.expression !== undefined && result.result !== undefined) {
      return `${result.expression} = ${result.result}`;
    }
    
    // Special formatting for directory listings
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: any) => c.type === 'text');
      if (textContent?.text) {
        // Format directory listing more compactly
        const lines = textContent.text.split('\n').filter((l: string) => l.trim());
        if (lines.length > 10) {
          return `${lines.slice(0, 8).join('\n')}\n... and ${lines.length - 8} more items`;
        }
        return textContent.text;
      }
    }
    
    if (result.result !== undefined) return String(result.result);
    
    // Compact JSON for other results
    const jsonStr = JSON.stringify(result, null, 2);
    if (jsonStr.length > 500) {
      return jsonStr.substring(0, 500) + '\n... (truncated)';
    }
    return jsonStr;
  };

  // Get a short preview for the pill
  const getResultPreview = (result: any): string | null => {
    if (!result) return null;
    
    // Time preview
    if (result.formatted) {
      const time = result.formatted.split(',')[1]?.trim() || result.formatted;
      return time.length > 15 ? time.substring(0, 15) + '...' : time;
    }
    
    // Calculation preview
    if (result.result !== undefined && result.expression) {
      return `= ${result.result}`;
    }
    
    // File count preview
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: any) => c.type === 'text');
      if (textContent?.text) {
        const lines = textContent.text.split('\n').filter((l: string) => l.trim());
        return `${lines.length} items`;
      }
    }
    
    return null;
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const content = tool.error || formatResult(tool.result);
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resultContent = tool.error || formatResult(tool.result);
  const resultPreview = getResultPreview(tool.result);

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
        {tool.status === 'success' && resultPreview && (
          <span className="opacity-70 text-[10px] max-w-[100px] truncate">
            {resultPreview}
          </span>
        )}
        {tool.status === 'success' && !resultPreview && tool.endTime && tool.startTime && (
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
        {!expanded && thinking.length > 0 && (
          <span className="text-[10px] opacity-50">· {thinking.length.toLocaleString()} chars</span>
        )}
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

/**
 * Container for multiple tool executions shown inline.
 * Parallel tool calls are grouped under a "Running N in parallel" label.
 */
export function InlineToolExecutions({ tools, theme, thinking }: InlineToolExecutionsProps) {
  if (tools.length === 0 && !thinking) return null;

  // Separate parallel from sequential tools
  const parallelTools = tools.filter((t) => t.isParallel);
  const sequentialTools = tools.filter((t) => !t.isParallel);

  return (
    <div className="flex flex-wrap items-center gap-1 my-2">
      {thinking && <ThinkingPill thinking={thinking} theme={theme} />}
      {sequentialTools.map((tool) => (
        <InlineToolIndicator key={tool.id} tool={tool} theme={theme} />
      ))}
      {parallelTools.length > 0 && (
        <div className="w-full">
          <div className="text-[10px] text-white/30 mb-1 font-mono">
            ⚡ Running {parallelTools.length} in parallel
          </div>
          <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
            {parallelTools.map((tool) => (
              <InlineToolIndicator key={tool.id} tool={tool} theme={theme} />
            ))}
          </div>
        </div>
      )}
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

  // Handle model-echoed format: 🔧 **Executed:** `command`\n✅ **Success**\n**Output:**\n```\n...\n```
  const executedRegex = /🔧 \*\*Executed:\*\*\s*`([^`]+)`\s*\n[✅❌]\s*\*\*(?:Success|Error)[^*]*\*\*\s*(?:\n\*\*Output:\*\*\s*)?\n?```\n?([\s\S]*?)\n?```/g;
  while ((match = executedRegex.exec(content)) !== null) {
    toolResults.push({
      name: `execute_command`,
      result: `$ ${match[1]}\n${match[2].trim()}`
    });
    cleanContent = cleanContent.replace(match[0], '');
  }

  // Handle simpler model-echoed: ✅ **Status:** ... 🔧 **Executed:** `cmd` ✅ **Success** **Output:** ```...```
  const simpleExecutedRegex = /🔧 \*\*Executed:\*\*\s*`([^`]+)`\s*\n?[✅❌]\s*\*\*Success\*\*\s*\n?\*\*Output:\*\*\s*\n?```\n?([\s\S]*?)\n?```/g;
  while ((match = simpleExecutedRegex.exec(content)) !== null) {
    if (!toolResults.find(t => t.result.includes(match![1]))) {
      toolResults.push({
        name: `execute_command`,
        result: `$ ${match[1]}\n${match[2].trim()}`
      });
      cleanContent = cleanContent.replace(match[0], '');
    }
  }

  // Clean up leftover status lines that aren't part of tool blocks
  cleanContent = cleanContent
    .replace(/✅ \*\*Status:\*\*[^\n]*/g, '')
    .replace(/\n{3,}/g, '\n\n');

  return {
    cleanContent: cleanContent.trim(),
    toolResults,
    thinking
  };
}

/**
 * InlineToolPill — Cursor-style pill that shows tool status inline with text.
 * Supports spinner (executing), ✓ (success), ✗ (error), and expands to show
 * input parameters and output result on click.
 */
const TOOL_ICONS: Record<string, string> = {
  list_directory: '📁',
  read_file: '📄',
  read_text_file: '📄',
  write_file: '✏️',
  edit_file: '✏️',
  execute_command: '⚡',
  fetch_url: '🌐',
  web_search: '🌐',
  browser_navigate: '🌐',
  calculate: '🔢',
  get_current_time: '🕐',
  search_files: '🔍',
  create_directory: '📁',
  move_file: '📦',
  sendRobotIntent: '🤖',
  robot_get_sensor_state: '📡',
  ros2_topic: '🔗',
};

export function InlineToolPill({ execution, theme = 'dark' }: { execution: ToolExecution; theme?: 'light' | 'dark' }) {
  const [expanded, setExpanded] = useState(false);

  const icon = TOOL_ICONS[execution.name] ?? '🔧';

  const label = execution.name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const durationMs = execution.endTime && execution.startTime
    ? execution.endTime - execution.startTime
    : undefined;

  const resultPreview = useMemo(() => {
    if (execution.status !== 'success' || !execution.result) return null;
    const out = execution.result;
    if (typeof out === 'string') return out.slice(0, 60);
    if (Array.isArray(out)) return `${out.length} items`;
    if (out && typeof out === 'object') {
      if (out.content && Array.isArray(out.content)) {
        const textContent = out.content.find((c: any) => c.type === 'text');
        if (textContent?.text) {
          const lines = String(textContent.text).split('\n').filter(Boolean);
          return `${lines.length} lines`;
        }
      }
      const keys = Object.keys(out);
      return keys.slice(0, 2).join(', ');
    }
    return null;
  }, [execution.result, execution.status]);

  const isRunning = execution.status === 'executing' || execution.status === 'pending';
  const isError = execution.status === 'error';
  const isSuccess = execution.status === 'success';

  const pillClass = isRunning
    ? 'bg-blue-500/10 border-blue-400/30 text-blue-300'
    : isError
    ? 'bg-red-500/10 border-red-400/30 text-red-300'
    : 'bg-green-500/10 border-green-400/30 text-green-300';

  const formatOutput = (result: any): string => {
    if (!result) return '';
    if (typeof result === 'string') return result;
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: any) => c.type === 'text');
      if (textContent?.text) return String(textContent.text);
    }
    if (result.formatted) return String(result.formatted);
    if (result.result !== undefined) return String(result.result);
    const json = JSON.stringify(result, null, 2);
    return json.length > 800 ? json.slice(0, 800) + '\n…(truncated)' : json;
  };

  return (
    <span className="inline-flex flex-col mx-1 my-0.5 align-middle">
      <motion.button
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          'relative inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-mono overflow-hidden',
          'border transition-all cursor-pointer select-none',
          pillClass
        )}
        animate={isError ? { x: [0, -3, 3, -3, 3, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        {/* Shimmer overlay for running state */}
        {isRunning && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
            }}
            animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          />
        )}
        <span>{icon}</span>
        <span className="text-white/70">{label}</span>
        {isRunning && (
          <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
        )}
        {isSuccess && <Check className="w-3 h-3 text-green-400" />}
        {isError && <X className="w-3 h-3 text-red-400" />}
        {durationMs !== undefined && isSuccess && (
          <span className="text-white/30 text-[10px]">{durationMs}ms</span>
        )}
        {resultPreview && !expanded && (
          <span className="text-white/40 max-w-[120px] truncate text-[10px]">· {resultPreview}</span>
        )}
        {expanded ? <ChevronUp className="w-3 h-3 opacity-50" /> : <ChevronDown className="w-3 h-3 opacity-50" />}
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1 rounded-md border border-white/10 bg-black/30 backdrop-blur-sm text-xs font-mono overflow-hidden"
          >
            {/* Input section */}
            {execution.parameters && Object.keys(execution.parameters).length > 0 && (
              <div className="p-2 border-b border-white/5">
                <div className="text-white/30 text-[10px] mb-1">INPUT</div>
                <pre className="text-white/60 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                  {JSON.stringify(execution.parameters, null, 2)}
                </pre>
              </div>
            )}
            {/* Output / Error section */}
            <div className="p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/30 text-[10px]">
                  {isError ? 'ERROR' : 'OUTPUT'}
                </span>
                {durationMs !== undefined && (
                  <span className="text-white/30 text-[10px] font-mono">{durationMs}ms</span>
                )}
              </div>
              {isRunning ? (
                <span className="text-blue-300/60 italic">running…</span>
              ) : isError ? (
                <pre className="text-red-400/80 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                  {execution.error || 'Unknown error'}
                </pre>
              ) : (
                <pre className="text-white/60 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                  {formatOutput(execution.result)}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
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
