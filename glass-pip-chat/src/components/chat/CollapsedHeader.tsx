import { motion } from 'framer-motion';
import { 
  Grip, 
  Maximize2, 
  Square, 
  CornerDownLeft,
  X,
  Clipboard
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';
import AnimatedOrb from '../AnimatedOrb';

interface CollapsedHeaderProps {
  platform: string;
  theme: 'light' | 'dark';
  isTyping: boolean;
  lastAssistantMessage: string;
  quickInput: string;
  setQuickInput: (value: string) => void;
  onSend: (message?: string, fromQuickInput?: boolean) => void;
  onStop: () => void;
  onCollapseToggle: () => void;
  onSizeChange: () => void;
  onHide: () => void;
  isResizing: boolean;
  size: string;
  ollamaAvailable: boolean;
  serverStatus: any;
  hasNewContext: boolean;
  contextData: any;
  contextToggleEnabled: boolean;
}

export default function CollapsedHeader({
  platform,
  theme,
  isTyping,
  lastAssistantMessage,
  quickInput,
  setQuickInput,
  onSend,
  onStop,
  onCollapseToggle,
  onSizeChange,
  onHide,
  isResizing,
  size,
  ollamaAvailable,
  serverStatus,
  hasNewContext,
  contextData,
  contextToggleEnabled
}: CollapsedHeaderProps) {
  return (
    <>
      {/* Top row - Orb, thinking indicator, and response preview */}
      <div
        className="flex items-center gap-2"
        style={{
          WebkitAppRegion: 'drag',
          WebkitUserSelect: 'none',
          userSelect: 'none'
        } as React.CSSProperties}
      >
        <Grip className="w-3 h-3 opacity-50 flex-shrink-0" />
        <AnimatedOrb isActive={isTyping} size="md" />

        {/* Response preview or thinking indicator */}
        <div
          className="flex-1 min-w-0 cursor-pointer hover:bg-white/5 rounded-lg p-1 transition-colors"
          onClick={onCollapseToggle}
          title="Click to expand chat"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {isTyping ? (
            <div className="flex items-center gap-1">
              <span className="text-xs opacity-70">Thinking</span>
              <motion.span
                className="text-xs opacity-70"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                ...
              </motion.span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="text-xs opacity-70 truncate flex-1">
                {lastAssistantMessage
                  ? lastAssistantMessage.slice(0, 50) + (lastAssistantMessage.length > 50 ? '...' : '')
                  : 'Ready to chat'}
              </div>
              <Maximize2 className="w-3 h-3 opacity-40" />
            </div>
          )}
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Ollama status */}
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              ollamaAvailable ? "bg-green-400" : "bg-red-400"
            )}
            title={ollamaAvailable ? "Ollama connected" : "Ollama offline"}
          />

          {/* Server status */}
          {serverStatus && (
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                serverStatus.status === 'online' ? "bg-green-400" :
                  serverStatus.status === 'offline' ? "bg-red-400" : "bg-yellow-400"
              )}
              title={`Server ${serverStatus.status}: ${serverStatus.domain || serverStatus.ip}`}
            />
          )}
        </div>

        {/* Context indicator */}
        {hasNewContext && (contextData.clipboard || contextData.selectedText) && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 rounded-full flex-shrink-0">
            <Clipboard className="w-2.5 h-2.5" />
            <span className="text-xs">New</span>
            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
          </div>
        )}
      </div>

      {/* Bottom row - Input and controls */}
      <div className="flex items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend(quickInput, true);
          }}
          className="flex items-center gap-2 flex-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="Type your message..."
            className={cn(
              "flex-1 px-3 py-1.5 text-sm",
              platform !== 'win32' && "backdrop-blur-md",
              ThemeUtils.getInputClass(platform, theme)
            )}
          />

          {/* Context indicator */}
          {(contextData.clipboard || contextData.selectedText) && contextToggleEnabled && (
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-xs flex-shrink-0",
                "bg-blue-500/20 border border-blue-500/30 text-blue-300"
              )}
              title="Context will be auto-attached"
            >
              <Clipboard className="w-3 h-3" />
              <span>Context</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!quickInput.trim() && !isTyping}
            onClick={(e) => {
              if (isTyping) {
                e.preventDefault();
                onStop();
              }
            }}
            className={cn(
              "p-1.5 rounded-lg transition-all flex-shrink-0",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              platform !== 'win32' && "backdrop-blur-md",
              isTyping
                ? "bg-red-500/20 hover:bg-red-500/30 text-red-300"
                : ThemeUtils.getBackgroundClass(platform, theme, 'hover')
            )}
            title={isTyping ? "Stop" : "Send"}
          >
            {isTyping ? <Square className="w-3.5 h-3.5" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
          </button>
        </form>

        {/* Control buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onSizeChange}
            className={cn(
              "p-1.5 rounded-lg hover:bg-white/10 transition-all duration-200",
              isResizing && "bg-blue-500/20 scale-110"
            )}
            title={`Resize (${size} → ${size === 'S' ? 'M' : size === 'M' ? 'L' : 'S'})`}
            disabled={isResizing}
          >
            <div className="relative">
              <div className="w-3.5 h-3.5 border border-current rounded-sm" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 border border-current rounded-sm bg-current/20" />
            </div>
          </button>
          <button
            onClick={onCollapseToggle}
            className={cn(
              "p-2 rounded-lg transition-all duration-200 border border-white/20",
              "hover:bg-blue-500/20 hover:border-blue-500/40 hover:scale-105",
              "bg-white/5 backdrop-blur-sm",
              isResizing && "opacity-50"
            )}
            title="Expand Chat"
            disabled={isResizing}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={onHide}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}