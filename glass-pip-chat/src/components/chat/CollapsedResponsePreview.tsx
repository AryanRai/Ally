import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Square, Maximize2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';
import MarkdownRenderer from '../MarkdownRenderer';

interface CollapsedResponsePreviewProps {
  platform: string;
  theme: 'light' | 'dark';
  response: string;
  isTyping: boolean;
  onStop?: () => void;
  onExpand?: () => void;
}

export default function CollapsedResponsePreview({
  platform,
  theme,
  response,
  isTyping,
  onStop,
  onExpand
}: CollapsedResponsePreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showFinalResponse, setShowFinalResponse] = useState(false);
  const [autoHideTimer, setAutoHideTimer] = useState<NodeJS.Timeout | null>(null);
  
  // Auto-scroll to bottom when response updates (reader mode)
  useEffect(() => {
    if (scrollRef.current && response) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [response]);

  // Handle final response display and auto-hide
  useEffect(() => {
    if (!isTyping && response) {
      // Response just finished - show final response
      setShowFinalResponse(true);
      
      // Clear any existing timer
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }
      
      // Set timer to hide after 5 seconds
      const timer = setTimeout(() => {
        setShowFinalResponse(false);
      }, 5000);
      
      setAutoHideTimer(timer);
    } else if (isTyping) {
      // Currently typing - clear any hide timer and show response
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
        setAutoHideTimer(null);
      }
      setShowFinalResponse(false);
    }
    
    return () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }
    };
  }, [isTyping, response]);

  // Show if typing, has response, or showing final response
  if (!response && !isTyping && !showFinalResponse) {
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
                {isTyping ? 'Thinking...' : showFinalResponse ? 'Final Response' : 'Response'}
              </span>
              {isTyping && (
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              )}
              {showFinalResponse && (
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-1">
              {onExpand && (
                <button
                  onClick={onExpand}
                  className="p-1 rounded hover:bg-blue-500/20 transition-colors"
                  title="Expand to full chat"
                >
                  <Maximize2 className="w-3 h-3 text-blue-400" />
                </button>
              )}
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