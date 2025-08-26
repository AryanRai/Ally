import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Grip, 
  Maximize2, 
  Minus,
  X,
  Settings,
  Eye,
  EyeOff,
  Clipboard,
  ChevronDown,
  ChevronUp,
  Check,
  Mic,
  MicOff
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';

interface ExpandedHeaderProps {
  platform: string;
  theme: 'light' | 'dark';
  isResizing: boolean;
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
  activeChat: any;
  headerTitleEdit: any;
  ollamaAvailable: boolean;
  serverStatus: any;
  hasNewContext: boolean;
  contextData: any;
  showContext: boolean;
  onContextToggle: () => void;
  contextToggleEnabled: boolean;
  onContextToggleChange: (enabled: boolean) => void;
  availableModels: any[];
  currentModel: string;
  showModelSelector: boolean;
  onModelSelectorToggle: () => void;
  onModelSelect: (model: string) => void;
  onSizeChange: () => void;
  onSettings: () => void;
  onCollapseToggle: () => void;
  onHide: () => void;
  size: string;
  showSpeechControls: boolean;
  onSpeechToggle: () => void;
}

export default function ExpandedHeader({
  platform,
  theme,
  isResizing,
  sidebarCollapsed,
  onSidebarToggle,
  activeChat,
  headerTitleEdit,
  ollamaAvailable,
  serverStatus,
  hasNewContext,
  contextData,
  showContext,
  onContextToggle,
  contextToggleEnabled,
  onContextToggleChange,
  availableModels,
  currentModel,
  showModelSelector,
  onModelSelectorToggle,
  onModelSelect,
  onSizeChange,
  onSettings,
  onCollapseToggle,
  onHide,
  size,
  showSpeechControls,
  onSpeechToggle
}: ExpandedHeaderProps) {
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0, maxHeight: 256 });

  // Update dropdown position and calculate available height when it opens
  useEffect(() => {
    if (showModelSelector && modelButtonRef.current) {
      const rect = modelButtonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 8; // 8px margin
      const spaceAbove = rect.top - 8; // 8px margin
      
      // Calculate optimal height - prefer showing below, but use above if more space
      const maxHeight = Math.max(120, Math.min(256, Math.max(spaceBelow, spaceAbove) - 20)); // Min 120px, max 256px, with 20px buffer
      
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
        maxHeight
      });
    }
  }, [showModelSelector]);

  return (
    <>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Grip className="w-3 h-3 opacity-50 flex-shrink-0" />
        <button
          onClick={onSidebarToggle}
          className={cn(
            "flex items-center justify-center p-1 rounded transition-colors",
            ThemeUtils.getBackgroundClass(platform, theme, 'hover')
          )}
          title={sidebarCollapsed ? "Show chats" : "Hide chats"}
        >
          <img
            src="/allay.png"
            alt="Allay"
            className="w-4 h-4 flex-shrink-0"
          />
        </button>

        {/* Editable chat title */}
        {headerTitleEdit.isEditing ? (
          <div
            className="flex items-center gap-1 flex-1 min-w-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <input
              ref={headerTitleEdit.inputRef as React.RefObject<HTMLInputElement>}
              value={headerTitleEdit.editValue}
              onChange={(e) => headerTitleEdit.setEditValue(e.target.value)}
              onKeyDown={headerTitleEdit.handleKeyDown}
              onBlur={headerTitleEdit.saveEdit}
              className={cn(
                "flex-1 text-sm font-medium min-w-0",
                ThemeUtils.getInputClass(platform, theme)
              )}
              placeholder="Chat title..."
            />
            <button
              onClick={headerTitleEdit.saveEdit}
              className={cn(ThemeUtils.getButtonClass(platform, theme), "hover:bg-green-500/20")}
              title="Save title"
            >
              <Check className="w-3 h-3 text-green-400" />
            </button>
            <button
              onClick={headerTitleEdit.cancelEdit}
              className={cn(ThemeUtils.getButtonClass(platform, theme), "hover:bg-red-500/20")}
              title="Cancel editing"
            >
              <X className="w-3 h-3 text-red-400" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => headerTitleEdit.startEdit(activeChat?.title)}
            className={cn(
              "flex-1 text-sm font-medium truncate text-left px-2 py-1.5 rounded transition-colors min-w-0",
              ThemeUtils.getTextClass(platform, theme),
              ThemeUtils.getBackgroundClass(platform, theme, 'hover')
            )}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            title="Click to rename chat"
          >
            {activeChat?.title || 'Chat'}
          </button>
        )}

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

        {hasNewContext && (contextData.clipboard || contextData.selectedText) && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 rounded-full flex-shrink-0">
            <Clipboard className="w-2.5 h-2.5" />
            <span className="text-xs">New</span>
            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
          </div>
        )}
      </div>

      {isResizing && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="px-2 py-0.5 bg-green-500/20 rounded-full text-xs flex-shrink-0"
        >
          Resizing to {size}
        </motion.div>
      )}

      <div
        className="flex items-center gap-1 flex-shrink-0"
        style={{
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'none',
          userSelect: 'none'
        } as React.CSSProperties}
      >
        {/* Model Selector */}
        {ollamaAvailable && availableModels.length > 0 && (
          <>
            <button
              ref={modelButtonRef}
              onClick={onModelSelectorToggle}
              className={cn(
                "p-1.5 rounded-lg hover:bg-white/10 transition-colors",
                showModelSelector && "bg-blue-500/20"
              )}
              title={`Current model: ${currentModel}`}
            >
              {showModelSelector ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Model dropdown - Rendered via Portal */}
            {showModelSelector && createPortal(
              <>
                {/* Backdrop to close dropdown */}
                <div
                  className="fixed inset-0 z-[999998]"
                  onClick={onModelSelectorToggle}
                  style={{ pointerEvents: 'auto' }}
                />
                <AnimatePresence>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -10 }}
                    className={cn(
                      "fixed w-48",
                      ThemeUtils.getModalClass(platform, theme)
                    )}
                    style={{ 
                      top: dropdownPosition.top,
                      right: dropdownPosition.right,
                      zIndex: 999999,
                      pointerEvents: 'auto'
                    } as React.CSSProperties}
                  >
                  <div className="p-2">
                    <div className={cn(
                      "text-xs font-medium mb-2 px-2",
                      ThemeUtils.getTextClass(platform, theme, 'secondary')
                    )}>
                      Select Model
                    </div>
                    <div className={cn(
                      "overflow-y-auto scrollbar-youtube",
                      "scroll-smooth"
                    )}
                    style={{
                      maxHeight: `${dropdownPosition.maxHeight}px`,
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgba(255, 255, 255, 0.4) rgba(255, 255, 255, 0.1)'
                    }}
                    >
                      {availableModels.map((model) => (
                        <button
                          key={model.name}
                          onClick={() => {
                            console.log('Model selected:', model.name);
                            onModelSelect(model.name);
                          }}
                          className={cn(
                            "w-full text-left px-2 py-1.5 text-xs rounded transition-colors cursor-pointer select-none",
                            currentModel === model.name
                              ? "bg-blue-500/20 text-blue-300"
                              : cn(
                                  ThemeUtils.getBackgroundClass(platform, theme, 'hover'),
                                  ThemeUtils.getTextClass(platform, theme, 'secondary')
                                )
                          )}
                        >
                          <div className="font-medium">{model.name}</div>
                          <div className={cn("text-xs opacity-60")}>
                            {(model.size / (1024 * 1024 * 1024)).toFixed(1)}GB
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  </motion.div>
                </AnimatePresence>
              </>,
              document.body
            )}
          </>
        )}

        <button
          onClick={onContextToggle}
          className={cn(
            "p-1.5 rounded-lg hover:bg-white/10 transition-colors relative",
            showContext && hasNewContext && (contextData.clipboard || contextData.selectedText) && "bg-blue-500/20"
          )}
          title={showContext ? "Hide context" : "Show context"}
        >
          {showContext ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {/* Notification dot for new context */}
          {!showContext && hasNewContext && (contextData.clipboard || contextData.selectedText) && (
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          )}
        </button>

        <button
          onClick={() => onContextToggleChange(!contextToggleEnabled)}
          className={cn(
            "p-1.5 rounded-lg transition-colors relative",
            contextToggleEnabled
              ? "bg-green-500/20 hover:bg-green-500/30 text-green-300"
              : "bg-red-500/20 hover:bg-red-500/30 text-red-300"
          )}
          title={`Context monitoring: ${contextToggleEnabled ? 'ON' : 'OFF'} (Ctrl+Shift+T)`}
        >
          <Clipboard className="w-3.5 h-3.5" />
          <div className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full",
            contextToggleEnabled ? "bg-green-400" : "bg-red-400"
          )} />
        </button>

        <button
          onClick={onSpeechToggle}
          className={cn(
            "p-1.5 rounded-lg transition-colors relative",
            showSpeechControls
              ? "bg-blue-500/20 hover:bg-blue-500/30 text-blue-300"
              : "hover:bg-white/10"
          )}
          title={`Speech controls: ${showSpeechControls ? 'ON' : 'OFF'} (Ctrl+Shift+V)`}
        >
          {showSpeechControls ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          {showSpeechControls && (
            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-blue-400 rounded-full" />
          )}
        </button>

        <button
          onClick={onSizeChange}
          className={cn(
            "p-1.5 rounded-lg hover:bg-white/10 transition-all duration-200",
            isResizing && "bg-blue-500/20 scale-110"
          )}
          title={`Change size (${size} → ${size === 'S' ? 'M' : size === 'M' ? 'L' : 'S'}) - Ctrl+Shift+S`}
          disabled={isResizing}
        >
          <Maximize2 className={cn(
            "w-3.5 h-3.5 transition-all duration-200",
            isResizing && "animate-pulse"
          )} />
        </button>

        <button
          onClick={onSettings}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            ThemeUtils.getBackgroundClass(platform, theme, 'hover')
          )}
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onCollapseToggle}
          className={cn(
            "p-1.5 rounded-lg hover:bg-white/10 transition-all duration-200",
            isResizing && "opacity-50"
          )}
          title="Collapse - Ctrl+Shift+M"
          disabled={isResizing}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onHide}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </>
  );
}