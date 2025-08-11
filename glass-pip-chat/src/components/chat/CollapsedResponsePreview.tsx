import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Square } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';
import MarkdownRenderer from '../MarkdownRenderer';

interface CollapsedResponsePreviewProps {
  platform: string;
  theme: 'light' | 'dark';
  response: string;
  isTyping: boolean;
  onStop?: () => void;
}

export default function CollapsedResponsePreview({
  platform,
  theme,
  response,
  isTyping,
  onStop
}: CollapsedResponsePreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when response updates (reader mode)
  useEffect(() => {
    if (scrollRef.current && response) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [response]);

  if (!response && !isTyping) {
    return null;
  }

  return (
    <AnimatePresence>
      {(response || isTyping) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className={cn(
            "border-t overflow-hidden",
            ThemeUtils.getBorderClass(platform, theme)
          )}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Response Header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-green-500/10">
            <div className="flex items-center gap-2">
              <Bot className="w-3 h-3 opacity-60" />
              <span className="text-xs font-medium opacity-80">
                {isTyping ? 'Thinking...' : 'Response'}
              </span>
              {isTyping && (
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              )}
            </div>
            {isTyping && onStop && (
              <button
                onClick={onStop}
                className="p-1 rounded hover:bg-red-500/20 transition-colors"
                title="Stop generation"
              >
                <Square className="w-3 h-3 text-red-400" />
              </button>
            )}
          </div>

          {/* Response Content - Auto-scrolling reader */}
          <div
            ref={scrollRef}
            className={cn(
              "max-h-40 overflow-y-auto px-3 pb-2 pt-1.5",
              "transition-all duration-200",
              ThemeUtils.getScrollbarClass(platform, theme)
            )}
          >
            {isTyping && !response ? (
              // Typing indicator
              <div className="flex items-center gap-1 py-2">
                <div className={cn(
                  "w-1 h-1 rounded-full animate-bounce bg-green-400"
                )} style={{ animationDelay: '0ms' }} />
                <div className={cn(
                  "w-1 h-1 rounded-full animate-bounce bg-green-400"
                )} style={{ animationDelay: '150ms' }} />
                <div className={cn(
                  "w-1 h-1 rounded-full animate-bounce bg-green-400"
                )} style={{ animationDelay: '300ms' }} />
                <span className="text-xs opacity-70 ml-2">Thinking...</span>
              </div>
            ) : (
              // Actual response with markdown
              <div className="text-sm">
                <MarkdownRenderer 
                  content={response} 
                  platform={platform}
                  theme={theme}
                  compact={false}
                />
                {isTyping && (
                  <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1 align-text-bottom" />
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}