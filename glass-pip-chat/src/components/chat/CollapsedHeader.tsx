import { motion, AnimatePresence } from 'framer-motion';
import { 
  Grip, 
  Maximize2, 
  Square, 
  CornerDownLeft,
  X,
  Clipboard,
  ChevronDown,
  ChevronUp,
  FileText
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';
import { Message } from '../../types/chat';
import AnimatedOrb from '../AnimatedOrb';
import CollapsedChatPreview from './CollapsedChatPreview';
import CollapsedResponsePreview from './CollapsedResponsePreview';
import { useState } from 'react';

interface CollapsedHeaderProps {
  platform: string;
  theme: 'light' | 'dark';
  isTyping: boolean;
  messages: Message[];
  quickInput: string;
  setQuickInput: (value: string) => void;
  onSend: (message?: string, fromQuickInput?: boolean) => void;
  onStop: () => void;
  onCollapseToggle: () => void;
  onSizeChange: () => void;
  onHide: () => void;
  onCopyMessage: (content: string) => void;
  onPreviewToggle?: (isExpanded: boolean) => void;
  onMessageEdit?: (messageId: string, newContent: string) => void;
  onMessageFork?: (messageId: string, newContent: string) => void;
  onMessageDelete?: (messageId: string) => void;
  onCopyCode?: (text: string, codeId: string) => void;
  onRunCode?: (command: string, codeId: string) => void;
  isResizing: boolean;
  size: string;
  ollamaAvailable: boolean;
  serverStatus: any;
  hasNewContext: boolean;
  contextData: any;
  contextToggleEnabled: boolean;
  uiSettings?: any;
  currentResponse?: string;
}

export default function CollapsedHeader({
  platform,
  theme,
  isTyping,
  messages,
  quickInput,
  setQuickInput,
  onSend,
  onStop,
  onCollapseToggle,
  onSizeChange,
  onHide,
  onCopyMessage,
  onPreviewToggle,
  onMessageEdit,
  onMessageFork,
  onMessageDelete,
  onCopyCode,
  onRunCode,
  isResizing,
  size,
  ollamaAvailable,
  serverStatus,
  hasNewContext,
  contextData,
  contextToggleEnabled,
  uiSettings,
  currentResponse
}: CollapsedHeaderProps) {
  const [isContextExpanded, setIsContextExpanded] = useState(false);

  return (
    <div className="flex flex-col">
      {/* Header with controls */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Draggable area */}
        <div 
          className="flex items-center gap-2 flex-1"
          style={{
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
            userSelect: 'none'
          } as React.CSSProperties}
        >
          <Grip className="w-3 h-3 opacity-50 flex-shrink-0" />
          <AnimatedOrb isActive={isTyping} size="sm" />

          {/* Status indicators */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                ollamaAvailable ? "bg-green-400" : "bg-red-400"
              )}
              title={ollamaAvailable ? "Ollama connected" : "Ollama offline"}
            />
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

        {/* Control buttons - no-drag region */}
        <div 
          className="flex items-center gap-1 flex-shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
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

      {/* Input section */}
      <div 
        className="px-3 pb-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend(quickInput, true);
          }}
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <input
            id="quick-input"
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="Type your message..."
            className={cn(
              "flex-1 px-3 py-2 text-sm rounded-xl",
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
              "p-2 rounded-xl transition-all flex-shrink-0",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              platform !== 'win32' && "backdrop-blur-md",
              isTyping
                ? "bg-red-500/20 hover:bg-red-500/30 text-red-300"
                : ThemeUtils.getBackgroundClass(platform, theme, 'hover')
            )}
            title={isTyping ? "Stop" : "Send"}
          >
            {isTyping ? <Square className="w-4 h-4" /> : <CornerDownLeft className="w-4 h-4" />}
          </button>
        </form>
      </div>

      {/* Current Response Preview - Auto-reader */}
      <CollapsedResponsePreview
        platform={platform}
        theme={theme}
        response={currentResponse || ''}
        isTyping={isTyping}
        onStop={onStop}
      />

      {/* Context Dropdown */}
      {hasNewContext && (contextData.clipboard || contextData.selectedText) && (
        <div 
          className="px-3 pb-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className={cn(
            "border rounded-lg overflow-hidden",
            ThemeUtils.getBorderClass(platform, theme)
          )}>
            {/* Context Header - Collapsible (like EditableMessage) */}
            <button
              onClick={() => setIsContextExpanded(!isContextExpanded)}
              className={cn(
                "w-full flex items-center justify-between p-3 text-left transition-colors",
                "hover:bg-white/5 rounded-lg"
              )}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <div className="flex items-center gap-2">
                <Clipboard className="w-3 h-3 opacity-60" />
                <span className="text-xs font-medium opacity-80">
                  Context attached
                </span>
              </div>
              <ChevronDown className={cn(
                "w-3 h-3 opacity-60 transition-transform duration-200",
                isContextExpanded && "rotate-180"
              )} />
            </button>

            {/* Context Content - Expandable (like EditableMessage) */}
            <AnimatePresence>
              {isContextExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className={cn(
                    "px-3 pb-3 border-t",
                    ThemeUtils.getBorderClass(platform, theme)
                  )}>
                    <div className="text-xs opacity-70 font-medium mb-2">Context Details:</div>
                    <div className={cn(
                      "p-2 rounded max-h-32 overflow-y-auto",
                      "bg-black/20 text-xs font-mono",
                      ThemeUtils.getScrollbarClass(platform, theme)
                    )}>
                      <pre className="whitespace-pre-wrap">
                        {contextData.clipboard || contextData.selectedText || ''}
                      </pre>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Chat Preview */}
      <CollapsedChatPreview
        platform={platform}
        theme={theme}
        messages={messages}
        isTyping={isTyping}
        onCopyMessage={onCopyMessage}
        onPreviewToggle={onPreviewToggle}
        onMessageEdit={onMessageEdit}
        onMessageFork={onMessageFork}
        onMessageDelete={onMessageDelete}
        onCopyCode={onCopyCode}
        onRunCode={onRunCode}
        uiSettings={uiSettings}
      />
    </div>
  );
}