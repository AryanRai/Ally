/**
 * LiveThinkingPanel — real-time streaming thinking display.
 *
 * Shows the model's thinking tokens as they arrive, before the response
 * text starts appearing.  Auto-scrolls to the bottom.  Collapses to a
 * header-only pill when toggled.
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LiveThinkingPanelProps {
  text: string;           // streaming thinking text
  isStreaming: boolean;   // still receiving tokens?
  isExpanded: boolean;
  onToggle: () => void;
  theme?: 'light' | 'dark';
}

// Three animated dots shown while streaming
function AnimatedDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block w-1 h-1 rounded-full bg-purple-400"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.25,
            ease: 'easeInOut',
          }}
        />
      ))}
    </span>
  );
}

export default function LiveThinkingPanel({
  text,
  isStreaming,
  isExpanded,
  onToggle,
  theme = 'dark',
}: LiveThinkingPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as tokens arrive
  useEffect(() => {
    if (isExpanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [text, isExpanded]);

  if (!text && !isStreaming) return null;

  const charCount = text.length.toLocaleString();

  return (
    <div
      className={cn(
        'mb-3 rounded-xl border transition-colors',
        'bg-purple-500/5 border-purple-400/20',
        theme === 'light' && 'bg-purple-500/3 border-purple-400/15',
      )}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
      >
        <Brain className="w-3 h-3 text-purple-400 flex-shrink-0" />
        <span className="text-[11px] text-purple-300 flex-1">
          {isStreaming ? (
            <>
              Thinking
              <AnimatedDots />
            </>
          ) : (
            <>Thought process · {charCount} chars</>
          )}
        </span>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3 text-purple-400/60" />
        ) : (
          <ChevronDown className="w-3 h-3 text-purple-400/60" />
        )}
      </button>

      {/* Body */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              ref={bodyRef}
              className="px-3 pb-3 max-h-48 overflow-y-auto"
            >
              <p
                className={cn(
                  'text-xs font-mono whitespace-pre-wrap break-words leading-relaxed',
                  theme === 'dark' ? 'text-white/60' : 'text-black/60',
                )}
              >
                {text}
                {isStreaming && (
                  <span className="inline-block w-2 h-3 bg-purple-400/60 animate-pulse ml-0.5 align-text-bottom" />
                )}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
