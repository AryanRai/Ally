import { motion, AnimatePresence } from 'framer-motion';
import { 
  Grip, 
  Maximize2, 
  Square, 
  CornerDownLeft,
  X,
  Clipboard,
  ChevronDown,
  Volume2,
  VolumeX,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';
import { Message } from '../../types/chat';
import AnimatedOrb from '../AnimatedOrb';
import CollapsedChatPreview from './CollapsedChatPreview';
import CollapsedResponsePreview from './CollapsedResponsePreview';
import { UnifiedModelSelector } from '../UnifiedModelSelector';

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
  onRecompute?: (messageId: string) => void;
  isResizing: boolean;
  size: string;
  hasNewContext: boolean;
  contextData: any;
  contextToggleEnabled: boolean;
  showContext?: boolean;
  onContextToggle?: () => void;
  onContextToggleChange?: (enabled: boolean) => void;
  uiSettings?: any;
  currentResponse?: string;
  currentModel: string;
  showModelSelector: boolean;
  onModelSelectorToggle: () => void;
  onModelSelect: (model: string) => void;
  voiceModeEnabled?: boolean;
  onVoiceModeToggle?: () => void;
  onSpeechSettingsOpen?: () => void;
  speechServiceConnected?: boolean;
  isContextExpanded?: boolean;
  onContextExpandedChange?: (expanded: boolean) => void;
  isSpeaking?: boolean;
  isListening?: boolean;
  placeholder?: string;
  orbState?: 'idle' | 'listening' | 'thinking' | 'speaking' | 'processing' | 'ggwave';
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
  onRecompute,
  isResizing,
  size,
  hasNewContext,
  contextData,
  contextToggleEnabled,
  showContext,
  onContextToggle,
  onContextToggleChange,
  uiSettings,
  currentResponse,
  currentModel,
  showModelSelector,
  onModelSelectorToggle,
  onModelSelect,
  voiceModeEnabled,
  onVoiceModeToggle,
  onSpeechSettingsOpen,
  speechServiceConnected,
  isContextExpanded,
  onContextExpandedChange,
  isSpeaking,
  isListening,
  placeholder = 'Balalalala',
  orbState
}: CollapsedHeaderProps) {
  const contextExpanded = isContextExpanded ?? false;

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
          <AnimatedOrb 
            isActive={isTyping || voiceModeEnabled || isSpeaking || isListening} 
            size="sm" 
            state={
              orbState ?? (
                isTyping ? 'thinking' : 
                isSpeaking ? 'speaking' :
                isListening ? 'listening' :
                voiceModeEnabled && speechServiceConnected ? 'listening' : 
                'idle'
              )
            }
          />

          {/* Optimized context indicator - removed separate indicator, will be combined with eye icon */}
        </div>

        {/* Control buttons - no-drag region */}
        <div 
          className="flex items-center gap-1 flex-shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Voice Mode Toggle with Dropdown */}
          {onVoiceModeToggle && (
            <div className="relative">
              <button
                onClick={onVoiceModeToggle}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onSpeechSettingsOpen?.();
                }}
                disabled={!speechServiceConnected}
                className={cn(
                  "p-1.5 rounded-lg transition-colors relative group",
                  voiceModeEnabled && speechServiceConnected
                    ? "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
                    : "bg-gray-500/20 text-gray-400 hover:bg-gray-500/30",
                  !speechServiceConnected && "opacity-50 cursor-not-allowed"
                )}
                title={
                  !speechServiceConnected 
                    ? "Connect to speech service first" 
                    : `Voice mode: ${voiceModeEnabled ? 'ON' : 'OFF'} - Click to toggle, right-click for settings`
                }
              >
                {voiceModeEnabled ? (
                  <Volume2 className="w-3.5 h-3.5" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
                {/* Status indicator */}
                <div className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full",
                  voiceModeEnabled && speechServiceConnected ? "bg-purple-400" : "bg-gray-400"
                )} />
                {/* Settings indicator */}
                <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          )}

          {/* Model selector (same picker as the expanded header) */}
          <UnifiedModelSelector
            platform={platform}
            theme={theme}
            currentModel={currentModel}
            onModelSelect={onModelSelect}
            showSelector={showModelSelector}
            onToggleSelector={onModelSelectorToggle}
            compact={true}
            windowSize="S"
          />

          {/* Combined Context Control - Eye + Clipboard with smart indicators */}
          {onContextToggle && (
            <button
              onClick={onContextToggle}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextToggleChange?.(!contextToggleEnabled);
              }}
              className={cn(
                "p-1.5 rounded-lg hover:bg-white/10 transition-colors relative",
                showContext && hasNewContext && (contextData.clipboard || contextData.selectedText) && "bg-blue-500/20",
                contextToggleEnabled && "ring-1 ring-green-400/30"
              )}
              title={`Context: ${showContext ? 'Visible' : 'Hidden'} | Monitoring: ${contextToggleEnabled ? 'ON' : 'OFF'} | Click: toggle view, Right-click: toggle monitoring`}
            >
              {/* Main icon - Eye for visibility, Clipboard overlay for monitoring */}
              <div className="relative">
                {showContext ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {/* Clipboard overlay indicator */}
                <Clipboard className={cn(
                  "w-2 h-2 absolute -bottom-0.5 -right-0.5",
                  contextToggleEnabled ? "text-green-400" : "text-red-400 opacity-60"
                )} />
              </div>
              
              {/* New context notification */}
              {hasNewContext && (contextData.clipboard || contextData.selectedText) && (
                <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse">
                  <span className="absolute inset-0 text-[8px] font-bold text-white flex items-center justify-center">N</span>
                </div>
              )}
            </button>
          )}

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
            placeholder={placeholder}
            className={cn(
              "flex-1 px-3 py-2 text-sm rounded-xl",
              platform !== 'win32' && "backdrop-blur-md",
              ThemeUtils.getInputClass(platform, theme)
            )}
          />



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
        onExpand={onCollapseToggle}
      />

      {/* Unified Context Element */}
      {hasNewContext && (contextData.clipboard || contextData.selectedText) && (
        <div 
          className="px-3 pb-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className={cn(
            "border rounded-lg overflow-hidden",
            ThemeUtils.getBorderClass(platform, theme)
          )}>
            {/* Context Header - Collapsible */}
            <button
              onClick={() => onContextExpandedChange?.(!contextExpanded)}
              className={cn(
                "w-full flex items-center justify-between p-2 text-left transition-colors",
                "hover:bg-white/5 rounded-lg"
              )}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <div className="flex items-center gap-2">
                <Clipboard className="w-3 h-3 opacity-60" />
                <span className="text-xs font-medium opacity-80">
                  Context
                </span>
                {contextToggleEnabled && (
                  <span className="text-xs opacity-50">(auto-attach)</span>
                )}
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              </div>
              <ChevronDown className={cn(
                "w-3 h-3 opacity-60 transition-transform duration-200",
                contextExpanded && "rotate-180"
              )} />
            </button>

            {/* Context Content - Expandable */}
            <AnimatePresence>
              {contextExpanded && (
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
        currentResponse={currentResponse}
        onCopyMessage={onCopyMessage}
        onPreviewToggle={onPreviewToggle}
        onMessageEdit={onMessageEdit}
        onMessageFork={onMessageFork}
        onMessageDelete={onMessageDelete}
        onCopyCode={onCopyCode}
        onRunCode={onRunCode}
        onRecompute={onRecompute}
        uiSettings={uiSettings}
      />
    </div>
  );
}