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
  Terminal
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Message } from '../types/chat';
import { UISettings } from '../types/settings';

interface EditableMessageProps {
  message: Message;
  isLast: boolean;
  onEdit: (messageId: string, newContent: string) => void;
  onFork: (messageId: string, newContent: string) => void;
  onDelete: (messageId: string) => void;
  onCopy: (content: string) => void;
  onCopyCode?: (text: string, codeId: string) => void;
  onRunCode?: (command: string, codeId: string) => void;
  theme: 'light' | 'dark';
  platform: string;
  uiSettings: UISettings;
  isCollapsed?: boolean;
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
  theme,
  platform,
  uiSettings,
  isCollapsed = false
}: EditableMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
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

  // Parse message content to extract context
  const parseMessageContent = (content: string) => {
    const contextRegex = /\[Context: ([^\]]+)\]/;
    const contextMatch = content.match(contextRegex);
    
    if (contextMatch) {
      const beforeContext = content.substring(0, contextMatch.index);
      const afterContext = content.substring(contextMatch.index! + contextMatch[0].length);
      const contextText = contextMatch[1];
      
      return {
        hasContext: true,
        beforeContext: beforeContext.trim(),
        afterContext: afterContext.trim(),
        contextText
      };
    }
    
    return {
      hasContext: false,
      beforeContext: content,
      afterContext: '',
      contextText: ''
    };
  };

  const renderMessageContent = (content: string) => {
    const parsed = parseMessageContent(content);
    
    if (!parsed.hasContext) {
      return (
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            code: CodeBlock
          }}
        >
          {content}
        </ReactMarkdown>
      );
    }

    return (
      <div className="space-y-3">
        {/* Main message content */}
        {parsed.beforeContext && (
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              code: CodeBlock
            }}
          >
            {parsed.beforeContext}
          </ReactMarkdown>
        )}

        {/* Expandable context section */}
        <div className={cn(
          "border rounded-lg transition-all duration-200",
          platform === 'win32'
            ? "border-white/10 bg-white/5"
            : theme === 'dark'
              ? "border-white/10 bg-white/5"
              : "border-black/10 bg-black/5"
        )}>
          <button
            onClick={() => setContextExpanded(!contextExpanded)}
            className={cn(
              "w-full flex items-center justify-between p-3 text-left transition-colors",
              "hover:bg-white/5 rounded-lg"
            )}
          >
            <div className="flex items-center gap-2">
              <Clipboard className="w-3 h-3 opacity-60" />
              <span className="text-xs font-medium opacity-80">
                Context attached
              </span>
            </div>
            <ChevronDown className={cn(
              "w-3 h-3 opacity-60 transition-transform duration-200",
              contextExpanded && "rotate-180"
            )} />
          </button>
          
          <AnimatePresence>
            {contextExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t border-white/10"
              >
                <div className="p-3 space-y-2">
                  <div className="text-xs opacity-70 font-medium">Context Details:</div>
                  <div className={cn(
                    "text-xs p-2 rounded bg-black/20 max-h-32 overflow-y-auto scrollbar-thin",
                    platform === 'win32'
                      ? "scrollbar-thumb-white/10"
                      : theme === 'dark' ? "scrollbar-thumb-white/10" : "scrollbar-thumb-black/10"
                  )}>
                    {parsed.contextText}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* After context content */}
        {parsed.afterContext && (
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              code: ({ inline, className, children, ...props }: any) => {
                const codeSize = uiSettings.fontSize === 'xs' ? 'text-xs' :
                               uiSettings.fontSize === 'sm' ? 'text-xs' :
                               uiSettings.fontSize === 'base' ? 'text-sm' :
                               uiSettings.fontSize === 'lg' ? 'text-base' : 'text-lg';
                
                return inline ? (
                  <code className={cn("px-1 py-0.5 bg-white/10 rounded", codeSize)} {...props}>
                    {children}
                  </code>
                ) : (
                  <pre className={cn("bg-black/20 rounded-lg overflow-x-auto my-2", getTextareaPaddingClass())}>
                    <code className={cn(codeSize, className)} {...props}>
                      {children}
                    </code>
                  </pre>
                );
              }
            }}
          >
            {parsed.afterContext}
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