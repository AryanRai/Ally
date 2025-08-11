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
  MoreHorizontal
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Message } from '../types/chat';

interface EditableMessageProps {
  message: Message;
  isLast: boolean;
  onEdit: (messageId: string, newContent: string) => void;
  onFork: (messageId: string, newContent: string) => void;
  onDelete: (messageId: string) => void;
  onCopy: (content: string) => void;
  theme: 'light' | 'dark';
  platform: string;
}

export default function EditableMessage({
  message,
  isLast,
  onEdit,
  onFork,
  onDelete,
  onCopy,
  theme,
  platform
}: EditableMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <motion.div
      className={cn(
        "group relative",
        message.role === 'user' ? "ml-8" : "mr-8"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={cn(
        "relative rounded-2xl p-4 transition-all duration-200",
        message.role === 'user'
          ? platform === 'win32'
            ? "bg-blue-500/20 ml-auto max-w-[85%]"
            : theme === 'dark'
              ? "bg-blue-500/20 ml-auto max-w-[85%]"
              : "bg-blue-500/20 ml-auto max-w-[85%]"
          : platform === 'win32'
            ? "bg-white/5 max-w-[90%]"
            : theme === 'dark'
              ? "bg-white/5 max-w-[90%]"
              : "bg-black/5 max-w-[90%]",
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
                  "w-full bg-transparent border rounded-lg p-3 text-sm resize-none min-h-[80px]",
                  "focus:outline-none focus:ring-2",
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
              className="prose prose-sm max-w-none prose-invert"
            >
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  code: ({ inline, className, children, ...props }) => {
                    return inline ? (
                      <code className="px-1 py-0.5 bg-white/10 rounded text-xs" {...props}>
                        {children}
                      </code>
                    ) : (
                      <pre className="bg-black/20 rounded-lg p-3 overflow-x-auto my-2">
                        <code className={cn("text-xs", className)} {...props}>
                          {children}
                        </code>
                      </pre>
                    );
                  }
                }}
              >
                {message.content}
              </ReactMarkdown>
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