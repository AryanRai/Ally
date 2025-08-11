import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, User, Bot } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';
import { Message } from '../../types/chat';
import EditableMessage from '../EditableMessage';

interface CollapsedChatPreviewProps {
  platform: string;
  theme: 'light' | 'dark';
  messages: Message[];
  isTyping: boolean;
  onCopyMessage: (content: string) => void;
  onPreviewToggle?: (isExpanded: boolean) => void;
  onMessageEdit?: (messageId: string, newContent: string) => void;
  onMessageFork?: (messageId: string, newContent: string) => void;
  onMessageDelete?: (messageId: string) => void;
  onCopyCode?: (text: string, codeId: string) => void;
  onRunCode?: (command: string, codeId: string) => void;
  uiSettings?: any;
}

export default function CollapsedChatPreview({
  platform,
  theme,
  messages,
  isTyping,
  onCopyMessage,
  onPreviewToggle,
  onMessageEdit,
  onMessageFork,
  onMessageDelete,
  onCopyCode,
  onRunCode,
  uiSettings
}: CollapsedChatPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Get the last few messages for preview
  const recentMessages = messages.slice(-10); // Show last 10 messages max
  const hasMessages = messages.length > 0;

  if (!hasMessages) {
    return (
      <div className={cn(
        "text-center py-4",
        ThemeUtils.getTextClass(platform, theme, 'muted')
      )}>
        <Bot className="w-6 h-6 mx-auto mb-2 opacity-50" />
        <p className="text-xs">Start a conversation...</p>
      </div>
    );
  }


  return (
    <div 
      className={cn(
        "border-t transition-all duration-200",
        ThemeUtils.getBorderClass(platform, theme)
      )}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* Toggle Button */}
      <button
        onClick={() => {
          const newExpanded = !isExpanded;
          setIsExpanded(newExpanded);
          onPreviewToggle?.(newExpanded);
        }}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2",
          "hover:bg-white/5 transition-colors"
        )}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            isTyping ? "bg-blue-400 animate-pulse" : "bg-green-400"
          )} />
          <span className="text-xs font-medium opacity-80">
            {isTyping ? 'Thinking...' : `${messages.length} message${messages.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 opacity-60" />
        ) : (
          <ChevronUp className="w-3 h-3 opacity-60" />
        )}
      </button>

      {/* Expandable Messages Preview */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              ref={scrollRef}
              className={cn(
                "max-h-48 overflow-y-auto px-3 pb-3 space-y-2",
                ThemeUtils.getScrollbarClass(platform, theme)
              )}
            >
              {recentMessages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="mb-2 last:mb-0"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                  <div className="scale-90 origin-top-left transform">
                    <EditableMessage
                      message={message}
                      isLast={index === messages.length - 1}
                      onEdit={onMessageEdit || (() => {})}
                      onFork={onMessageFork || (() => {})}
                      onDelete={onMessageDelete || (() => {})}
                      onCopy={onCopyMessage}
                      onCopyCode={onCopyCode}
                      onRunCode={onRunCode}
                      theme={theme}
                      platform={platform}
                      uiSettings={uiSettings || { 
                        fontSize: 'xs', 
                        messageSpacing: 'compact', 
                        messagePadding: 'tight' 
                      }}
                    />
                  </div>
                </motion.div>
              ))}
              
              {/* Typing Indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-start gap-2 p-2 rounded-lg mr-4 bg-white/5"
                >
                  <Bot className="w-3 h-3 opacity-60 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium opacity-80">Assistant</span>
                      <span className="text-xs opacity-50">now</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className={cn(
                        "w-1 h-1 rounded-full animate-bounce bg-blue-400"
                      )} style={{ animationDelay: '0ms' }} />
                      <div className={cn(
                        "w-1 h-1 rounded-full animate-bounce bg-blue-400"
                      )} style={{ animationDelay: '150ms' }} />
                      <div className={cn(
                        "w-1 h-1 rounded-full animate-bounce bg-blue-400"
                      )} style={{ animationDelay: '300ms' }} />
                      <span className="text-xs opacity-70 ml-2">Thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}