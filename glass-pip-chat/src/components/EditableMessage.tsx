import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Edit3, 
  Check, 
  X, 
  Copy, 
  Trash2, 
  GitBranch,
  MoreHorizontal,
  ChevronDown,
  Clipboard,
  Terminal,
  RefreshCw,
  Wrench,
  Brain,
  Code2,
  ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Message } from '../types/chat';
import { UISettings } from '../types/settings';
import MessageMetadata from './chat/MessageMetadata';
import { MessagePills, parseMessageForPills } from './chat/InlineToolIndicator';

interface EditableMessageProps {
  message: Message;
  isLast: boolean;
  onEdit: (messageId: string, newContent: string) => void;
  onFork: (messageId: string, newContent: string) => void;
  onDelete: (messageId: string) => void;
  onCopy: (content: string) => void;
  onCopyCode?: (text: string, codeId: string) => void;
  onRunCode?: (command: string, codeId: string) => void;
  onRecompute?: (messageId: string) => void;
  theme: 'light' | 'dark';
  platform: string;
  uiSettings: UISettings;
  isCollapsed?: boolean;
}

// ─── Collapsible block types ────────────────────────────────────────────────

interface CollapsibleSection {
  type: 'tool_use' | 'tool_result' | 'thinking' | 'script' | 'context';
  label: string;
  content: string;
  icon: 'wrench' | 'brain' | 'code' | 'clipboard';
  color: 'purple' | 'amber' | 'cyan' | 'blue' | 'green';
}

/** Parse all collapsible sections out of a message, return clean text + sections */
function parseCollapsibleSections(content: string): {
  cleanText: string;
  sections: CollapsibleSection[];
} {
  let text = content;
  const sections: CollapsibleSection[] = [];

  // 1. <thinking>...</thinking>
  text = text.replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (_, inner) => {
    sections.push({ type: 'thinking', label: 'Thinking', content: inner.trim(), icon: 'brain', color: 'purple' });
    return '';
  });

  // 2. <think>...</think> (alternate)
  text = text.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner) => {
    sections.push({ type: 'thinking', label: 'Thinking', content: inner.trim(), icon: 'brain', color: 'purple' });
    return '';
  });

  // 2b. 💭 **Thought Process:**\n\n...\n\n---\n\n**Answer:**\n\n (from handleSendRegular)
  text = text.replace(/💭 \*\*Thought Process:\*\*\s*\n\n([\s\S]*?)\n\n---\n\n\*\*Answer:\*\*\s*\n\n/g, (_, thinking) => {
    sections.push({ type: 'thinking', label: 'Thought Process', content: thinking.trim(), icon: 'brain', color: 'purple' });
    return '';
  });

  // 3. <tool_use>...</tool_use> (Claude XML format)
  text = text.replace(/<tool_use>([\s\S]*?)<\/tool_use>/gi, (_, inner) => {
    const nameMatch = inner.match(/<tool_name>([\s\S]*?)<\/tool_name>/i);
    const toolName = nameMatch ? nameMatch[1].trim() : 'tool';
    // Extract parameters
    const params: Record<string, string> = {};
    const paramRegex = /<tool_parameter name="([^"]+)">([\s\S]*?)<\/tool_parameter>/gi;
    let pm;
    while ((pm = paramRegex.exec(inner)) !== null) {
      params[pm[1]] = pm[2].trim();
    }
    const paramsStr = Object.keys(params).length > 0
      ? JSON.stringify(params, null, 2)
      : inner.replace(/<tool_name>[\s\S]*?<\/tool_name>/gi, '').trim();
    sections.push({
      type: 'tool_use',
      label: `Tool: ${toolName}`,
      content: paramsStr,
      icon: 'wrench',
      color: 'amber',
    });
    return '';
  });

  // 4. JSON tool calls: {"name": "...", "parameters": {...}}
  text = text.replace(/\{"name"\s*:\s*"([^"]+)"[\s\S]*?"parameters"\s*:\s*(\{[\s\S]*?\})\s*\}/g, (match, name, _params) => {
    try {
      const parsed = JSON.parse(match);
      sections.push({
        type: 'tool_use',
        label: `Tool: ${name}`,
        content: JSON.stringify(parsed.parameters || {}, null, 2),
        icon: 'wrench',
        color: 'amber',
      });
      return '';
    } catch {
      return match; // leave it if it doesn't parse cleanly
    }
  });

  // 5. Tool result blocks: 🔧 **tool_name**\n```\nresult\n```
  text = text.replace(/🔧 \*\*([^*\n]+)\*\*\s*\n```[^\n]*\n([\s\S]*?)\n?```/g, (_, name, result) => {
    sections.push({ type: 'tool_result', label: `Result: ${name.trim()}`, content: result.trim(), icon: 'wrench', color: 'green' });
    return '';
  });

  // 6. PTC scripts: ```javascript\n...\n``` that contain await calls
  text = text.replace(/```(?:javascript|js)\s*\n([\s\S]*?)```/g, (match, code) => {
    if (code.includes('await ') || code.includes('print(')) {
      sections.push({ type: 'script', label: 'PTC Script', content: code.trim(), icon: 'code', color: 'cyan' });
      return '';
    }
    return match; // keep regular code blocks
  });

  // 7. Context blocks: [Context: ...]
  text = text.replace(/\[Context: ([^\]]+)\]/g, (_, ctx) => {
    sections.push({ type: 'context', label: 'Context', content: ctx.trim(), icon: 'clipboard', color: 'blue' });
    return '';
  });

  // Clean up excess blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return { cleanText: text, sections };
}

// ─── CollapsibleBlock component ─────────────────────────────────────────────

interface CollapsibleBlockProps {
  section: CollapsibleSection;
  theme: 'light' | 'dark';
  platform: string;
}

function CollapsibleBlock({ section, theme, platform }: CollapsibleBlockProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const colorMap = {
    purple: { pill: 'border-purple-400/40 bg-purple-500/10 text-purple-300', expand: 'bg-purple-900/20 border-purple-500/20' },
    amber:  { pill: 'border-amber-400/40 bg-amber-500/10 text-amber-300',   expand: 'bg-amber-900/20 border-amber-500/20' },
    cyan:   { pill: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-300',       expand: 'bg-cyan-900/20 border-cyan-500/20' },
    blue:   { pill: 'border-blue-400/40 bg-blue-500/10 text-blue-300',       expand: 'bg-blue-900/20 border-blue-500/20' },
    green:  { pill: 'border-green-400/40 bg-green-500/10 text-green-300',    expand: 'bg-green-900/20 border-green-500/20' },
  };

  const iconEl = {
    wrench:    <Wrench className="w-3 h-3" />,
    brain:     <Brain className="w-3 h-3" />,
    code:      <Code2 className="w-3 h-3" />,
    clipboard: <Clipboard className="w-3 h-3" />,
  }[section.icon];

  const colors = colorMap[section.color];

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(section.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-1">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border transition-all cursor-pointer',
          colors.pill
        )}
      >
        {iconEl}
        <span className="font-medium">{section.label}</span>
        {open
          ? <ChevronDown className="w-3 h-3 opacity-50" />
          : <ChevronRight className="w-3 h-3 opacity-50" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              'mt-1 p-2 rounded-lg text-xs font-mono overflow-x-auto relative max-h-64 overflow-y-auto border',
              colors.expand,
              platform === 'win32' ? 'text-white/70' : theme === 'dark' ? 'text-white/70' : 'text-gray-700'
            )}
          >
            <button
              onClick={handleCopy}
              className={cn('absolute top-1 right-1 p-1 rounded transition-colors', copied ? 'text-green-400' : 'text-white/40 hover:text-white/70')}
              title="Copy"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
            <pre className="whitespace-pre-wrap break-words pr-6">{section.content}</pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function EditableMessage({
  message,
  isLast,
  onEdit,
  onFork,
  onDelete,
  onCopy,
  onCopyCode,
  onRunCode,
  onRecompute,
  theme,
  platform,
  uiSettings,
  isCollapsed = false
}: EditableMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [copiedCode, setCopiedCode] = useState<Set<string>>(new Set());
  const [runningCommands, setRunningCommands] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get CSS classes based on settings
  const getFontSizeClass = () => {
    const sizeMap = {
      xs: 'text-xs',
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl'
    };
    return sizeMap[uiSettings.fontSize];
  };

  const getPaddingClass = () => {
    const paddingMap = {
      tight: 'p-2',
      normal: 'p-4',
      spacious: 'p-6'
    };
    const basePadding = paddingMap[uiSettings.messagePadding];
    
    // Reduce padding in collapsed mode for better space efficiency
    if (isCollapsed) {
      return basePadding.replace('p-2', 'p-1.5').replace('p-4', 'p-2').replace('p-6', 'p-3');
    }
    
    return basePadding;
  };

  const getTextareaPaddingClass = () => {
    const paddingMap = {
      tight: 'p-2',
      normal: 'p-3',
      spacious: 'p-4'
    };
    return paddingMap[uiSettings.messagePadding];
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
      // Auto-resize textarea
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditContent(message.content);
    setIsEditing(true);
    setShowMenu(false);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleForkEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onFork(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value);
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  // Handle code copy
  const handleCopyCode = async (text: string, codeId: string) => {
    if (onCopyCode) {
      onCopyCode(text, codeId);
    } else {
      // Fallback to direct clipboard copy
      try {
        await navigator.clipboard.writeText(text);
      } catch (error) {
        console.error('Failed to copy code:', error);
      }
    }
    
    setCopiedCode(prev => new Set([...prev, codeId]));
    setTimeout(() => {
      setCopiedCode(prev => {
        const newSet = new Set(prev);
        newSet.delete(codeId);
        return newSet;
      });
    }, 2000);
  };

  // Handle code run
  const handleRunCode = (command: string, codeId: string) => {
    if (onRunCode) {
      setRunningCommands(prev => new Set([...prev, codeId]));
      onRunCode(command, codeId);
      
      setTimeout(() => {
        setRunningCommands(prev => {
          const newSet = new Set(prev);
          newSet.delete(codeId);
          return newSet;
        });
      }, 1000);
    }
  };

  // Enhanced code component with copy and run buttons
  const CodeBlock = ({ inline, className, children, ...props }: any) => {
    const codeSize = uiSettings.fontSize === 'xs' ? 'text-xs' :
                     uiSettings.fontSize === 'sm' ? 'text-xs' :
                     uiSettings.fontSize === 'base' ? 'text-sm' :
                     uiSettings.fontSize === 'lg' ? 'text-base' : 'text-lg';
    
    if (inline) {
      return (
        <code className={cn("px-1 py-0.5 bg-white/10 rounded", codeSize)} {...props}>
          {children}
        </code>
      );
    }

    const codeText = String(children);
    const codeId = `${message.id}-${Math.random().toString(36).substr(2, 9)}`;
    const isCopied = copiedCode.has(codeId);
    const isRunning = runningCommands.has(codeId);

    return (
      <div className="relative group my-2">
        <pre className={cn("bg-black/20 rounded-lg overflow-x-auto pr-20", getTextareaPaddingClass())}>
          <code className={cn(codeSize, className)} {...props}>
            {children}
          </code>
        </pre>
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            onClick={() => handleRunCode(codeText, codeId)}
            className={cn(
              "p-1.5 rounded-md transition-all duration-200",
              "opacity-0 group-hover:opacity-100 focus:opacity-100",
              isRunning
                ? "bg-blue-500/20 text-blue-300"
                : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
            )}
            title={isRunning ? "Running..." : "Run in terminal"}
            disabled={isRunning}
          >
            <Terminal className="w-3 h-3" />
          </button>
          <button
            onClick={() => handleCopyCode(codeText, codeId)}
            className={cn(
              "p-1.5 rounded-md transition-all duration-200",
              "opacity-0 group-hover:opacity-100 focus:opacity-100",
              isCopied
                ? "bg-green-500/20 text-green-300"
                : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
            )}
            title={isCopied ? "Copied!" : "Copy code"}
          >
            {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>
    );
  };

  const renderMessageContent = (content: string) => {
    // For user messages, just render as-is (extract context if present)
    if (message.role === 'user') {
      const contextMatch = content.match(/\[Context: ([^\]]+)\]/);
      const cleanUser = contextMatch ? content.replace(contextMatch[0], '').trim() : content;
      return (
        <div className="space-y-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>, code: CodeBlock }}>
            {cleanUser}
          </ReactMarkdown>
          {contextMatch && (
            <CollapsibleBlock
              section={{ type: 'context', label: 'Context', content: contextMatch[1].trim(), icon: 'clipboard', color: 'blue' }}
              theme={theme}
              platform={platform}
            />
          )}
        </div>
      );
    }

    // For assistant messages: parse all collapsible sections
    const { cleanText, sections } = parseCollapsibleSections(content);

    // Also run the existing pill parser for legacy tool result formats
    const { toolResults, thinking: legacyThinking } = parseMessageForPills(cleanText);
    // Deduplicate: only show legacy pills if not already captured as sections
    const hasThinkingSection = sections.some(s => s.type === 'thinking');
    const hasToolSections = sections.some(s => s.type === 'tool_use' || s.type === 'tool_result');

    return (
      <div className="space-y-1">
        {/* Collapsible sections (thinking, tool calls, scripts, etc.) */}
        {sections.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {sections.map((section, i) => (
              <CollapsibleBlock key={i} section={section} theme={theme} platform={platform} />
            ))}
          </div>
        )}

        {/* Legacy pill format (for older messages) */}
        {((!hasThinkingSection && legacyThinking) || (!hasToolSections && toolResults.length > 0)) && (
          <MessagePills content={content} theme={theme} />
        )}

        {/* Main clean text */}
        {cleanText && (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>, code: CodeBlock }}
          >
            {cleanText}
          </ReactMarkdown>
        )}
      </div>
    );
  };

  return (
    <motion.div
      className={cn(
        "group relative",
        isCollapsed 
          ? message.role === 'user' ? "ml-2" : "mr-2"
          : message.role === 'user' ? "ml-8" : "mr-8"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={cn(
        "relative transition-all duration-200",
        isCollapsed ? "rounded-lg" : "rounded-2xl",
        getPaddingClass(),
        getFontSizeClass(),
        message.role === 'user'
          ? platform === 'win32'
            ? "bg-blue-500/20 ml-auto"
            : theme === 'dark'
              ? "bg-blue-500/20 ml-auto"
              : "bg-blue-500/20 ml-auto"
          : platform === 'win32'
            ? "bg-white/5"
            : theme === 'dark'
              ? "bg-white/5"
              : "bg-black/5",
        // Use more horizontal space in collapsed mode
        isCollapsed 
          ? message.role === 'user' ? "max-w-[95%]" : "max-w-[98%]"
          : message.role === 'user' ? "max-w-[85%]" : "max-w-[90%]",
        isHovered && "ring-1 ring-white/20"
      )}>
        {/* Message Content */}
        <AnimatePresence mode="wait">
          {isEditing ? (
            <motion.div
              key="editing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                className={cn(
                  "w-full bg-transparent border rounded-lg resize-none min-h-[80px]",
                  "focus:outline-none focus:ring-2",
                  getTextareaPaddingClass(),
                  getFontSizeClass(),
                  platform === 'win32'
                    ? "border-white/20 focus:ring-white/30"
                    : theme === 'dark'
                      ? "border-white/20 focus:ring-white/30"
                      : "border-black/20 focus:ring-black/30"
                )}
                placeholder="Edit your message..."
              />
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveEdit}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors",
                      "bg-green-500/20 hover:bg-green-500/30 text-green-300"
                    )}
                    title="Save changes (Ctrl+Enter)"
                  >
                    <Check className="w-3 h-3" />
                    Save
                  </button>
                  
                  <button
                    onClick={handleForkEdit}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors",
                      "bg-blue-500/20 hover:bg-blue-500/30 text-blue-300"
                    )}
                    title="Save as new conversation branch"
                  >
                    <GitBranch className="w-3 h-3" />
                    Fork
                  </button>
                </div>
                
                <button
                  onClick={handleCancelEdit}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors",
                    "bg-red-500/20 hover:bg-red-500/30 text-red-300"
                  )}
                  title="Cancel editing (Escape)"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </div>
              
              <p className="text-xs opacity-60">
                💡 <strong>Save</strong> updates this message, <strong>Fork</strong> creates a new conversation branch
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="viewing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                "prose max-w-none prose-invert",
                uiSettings.fontSize === 'xs' ? 'prose-xs' :
                uiSettings.fontSize === 'sm' ? 'prose-sm' :
                uiSettings.fontSize === 'base' ? 'prose-base' :
                uiSettings.fontSize === 'lg' ? 'prose-lg' : 'prose-xl'
              )}
            >
              {renderMessageContent(message.content)}
              
              {/* Message Metadata (Tool Calls and Context) */}
              <MessageMetadata
                platform={platform}
                theme={theme}
                context={message.metadata?.context}
                toolCalls={message.metadata?.toolCalls}
                toolResults={message.metadata?.toolResults}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons */}
        <AnimatePresence>
          {(isHovered || showMenu) && !isEditing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute -top-2 right-2 flex items-center gap-1"
            >
              <button
                onClick={() => onCopy(message.content)}
                className={cn(
                  "p-1.5 rounded-lg transition-colors backdrop-blur-sm",
                  platform === 'win32'
                    ? "bg-black/50 hover:bg-black/70"
                    : theme === 'dark'
                      ? "bg-black/50 hover:bg-black/70"
                      : "bg-white/50 hover:bg-white/70"
                )}
                title="Copy message"
              >
                <Copy className="w-3 h-3" />
              </button>
              
              <button
                onClick={handleStartEdit}
                className={cn(
                  "p-1.5 rounded-lg transition-colors backdrop-blur-sm",
                  platform === 'win32'
                    ? "bg-black/50 hover:bg-black/70"
                    : theme === 'dark'
                      ? "bg-black/50 hover:bg-black/70"
                      : "bg-white/50 hover:bg-white/70"
                )}
                title="Edit message"
              >
                <Edit3 className="w-3 h-3" />
              </button>
              
              {/* Recompute button - only show for assistant messages */}
              {message.role === 'assistant' && onRecompute && (
                <button
                  onClick={() => onRecompute(message.id)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors backdrop-blur-sm",
                    platform === 'win32'
                      ? "bg-black/50 hover:bg-black/70"
                      : theme === 'dark'
                        ? "bg-black/50 hover:bg-black/70"
                        : "bg-white/50 hover:bg-white/70"
                  )}
                  title="Recompute response"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              )}
              
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors backdrop-blur-sm",
                    platform === 'win32'
                      ? "bg-black/50 hover:bg-black/70"
                      : theme === 'dark'
                        ? "bg-black/50 hover:bg-black/70"
                        : "bg-white/50 hover:bg-white/70",
                    showMenu && "bg-blue-500/30"
                  )}
                  title="More options"
                >
                  <MoreHorizontal className="w-3 h-3" />
                </button>
                
                {/* Dropdown Menu */}
                <AnimatePresence>
                  {showMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -10 }}
                      className={cn(
                        "absolute right-0 top-full mt-2 min-w-[140px] rounded-lg border shadow-lg z-50",
                        platform === 'win32'
                          ? "bg-black/90 border-white/20"
                          : theme === 'dark'
                            ? "bg-gray-900/95 border-white/20"
                            : "bg-white/95 border-black/20"
                      )}
                      style={{
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)'
                      }}
                    >
                      <button
                        onClick={() => {
                          onDelete(message.id);
                          setShowMenu(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
                          "hover:bg-red-500/20 text-red-400"
                        )}
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Timestamp */}
        <div className={cn(
          "text-xs opacity-50 mt-2",
          message.role === 'user' ? "text-right" : "text-left"
        )}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>

      {/* Click outside to close menu */}
      {showMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMenu(false)}
        />
      )}
    </motion.div>
  );
}