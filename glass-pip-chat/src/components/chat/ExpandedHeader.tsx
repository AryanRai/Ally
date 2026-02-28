import { motion } from 'framer-motion';
import {
  Grip,
  Maximize2,
  Minus,
  X,
  Settings,
  Eye,
  EyeOff,
  Clipboard,
  Check,
  Mic,
  MicOff,
  Wrench
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';

import { UnifiedModelSelector } from '../UnifiedModelSelector';

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
  currentModel: string;
  showModelSelector: boolean;
  onModelSelectorToggle: () => void;
  onModelSelect: (model: string) => void;
  onSizeChange: () => void;
  onSettings: () => void;
  onCollapseToggle: () => void;
  onProviderSettings?: () => void;
  onHide: () => void;
  size: string;
  showSpeechControls: boolean;
  onSpeechToggle: () => void;
  // Simple tool toggle
  toolsEnabled?: boolean;
  onToolsToggle?: () => void;
  mcpServerCount?: number;
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
  currentModel,
  showModelSelector,
  onModelSelectorToggle,
  onModelSelect,
  onSizeChange,
  onSettings,
  onCollapseToggle,
  onProviderSettings,
  onHide,
  size,
  showSpeechControls,
  onSpeechToggle,
  toolsEnabled,
  onToolsToggle,
  mcpServerCount = 0
}: ExpandedHeaderProps) {

  return (
    <>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <Grip className="w-3 h-3 opacity-50 flex-shrink-0" />
        <button
          onClick={onSidebarToggle}
          className={cn(
            "flex items-center justify-center p-1 rounded transition-colors relative",
            ThemeUtils.getBackgroundClass(platform, theme, 'hover')
          )}
          title={sidebarCollapsed ? "Show chats" : "Hide chats"}
        >
          <img
            src="/allay.png"
            alt="Allay"
            className="w-4 h-4 flex-shrink-0"
          />
          {/* Indicator for auto-collapsed sidebar at large sizes */}
          {sidebarCollapsed && size === 'L' && (
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange-400 rounded-full"
              title="Sidebar auto-collapsed to prevent overflow" />
          )}
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
          <div
            className={cn(
              "flex-1 text-xs font-medium text-left px-1.5 py-1 rounded transition-colors min-w-0 cursor-pointer truncate",
              ThemeUtils.getTextClass(platform, theme),
              ThemeUtils.getBackgroundClass(platform, theme, 'hover')
            )}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            title={`Chat: ${activeChat?.title || 'Untitled'} - Click to rename`}
            onClick={() => headerTitleEdit.startEdit(activeChat?.title)}
          >
            {activeChat?.title || 'Untitled Chat'}
          </div>
        )}

        {/* Status indicators */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Ollama status */}
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              ollamaAvailable ? "bg-green-400" : "bg-red-400"
            )}
            title={ollamaAvailable ? "Ollama connected" : "Ollama offline"}
          />

          {/* Server status */}
          {serverStatus && (
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                serverStatus.status === 'online' ? "bg-green-400" :
                  serverStatus.status === 'offline' ? "bg-red-400" : "bg-yellow-400"
              )}
              title={`Server ${serverStatus.status}: ${serverStatus.domain || serverStatus.ip}`}
            />
          )}
        </div>
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
        className="flex items-center gap-0.5 flex-shrink-0"
        style={{
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'none',
          userSelect: 'none'
        } as React.CSSProperties}
      >
        {/* Unified Model Selector */}
        <UnifiedModelSelector
          platform={platform}
          theme={theme}
          currentModel={currentModel}
          onModelSelect={onModelSelect}
          showSelector={showModelSelector}
          onToggleSelector={onModelSelectorToggle}
          showProviderSettings={onProviderSettings}
          compact={true}
        />

        {/* Combined Context Control - Eye + Clipboard with smart indicators */}
        <button
          onClick={onContextToggle}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextToggleChange(!contextToggleEnabled);
          }}
          className={cn(
            "p-1 rounded-lg hover:bg-white/10 transition-colors relative",
            showContext && hasNewContext && (contextData.clipboard || contextData.selectedText) && "bg-blue-500/20",
            contextToggleEnabled && "ring-1 ring-green-400/30"
          )}
          title={`Context: ${showContext ? 'Visible' : 'Hidden'} | Monitoring: ${contextToggleEnabled ? 'ON' : 'OFF'}`}
        >
          <div className="relative">
            {showContext ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <Clipboard className={cn(
              "w-1.5 h-1.5 absolute -bottom-0.5 -right-0.5",
              contextToggleEnabled ? "text-green-400" : "text-red-400 opacity-60"
            )} />
          </div>
          {hasNewContext && (contextData.clipboard || contextData.selectedText) && (
            <div className="absolute -top-0.5 -left-0.5 w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          )}
        </button>

        {/* Simple Tool Toggle */}
        {onToolsToggle && (
          <button
            onClick={onToolsToggle}
            className={cn(
              "p-1 rounded-lg transition-colors relative",
              toolsEnabled
                ? "bg-purple-500/20 hover:bg-purple-500/30 text-purple-300"
                : "hover:bg-white/10 opacity-60"
            )}
            title={toolsEnabled 
              ? `Tools ON (${mcpServerCount} MCP)` 
              : "Tools OFF"
            }
          >
            <Wrench className="w-3 h-3" />
            {toolsEnabled && mcpServerCount > 0 && (
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-[7px] font-bold text-white">{mcpServerCount}</span>
              </div>
            )}
          </button>
        )}

        <button
          onClick={onSpeechToggle}
          className={cn(
            "p-1 rounded-lg transition-colors relative",
            showSpeechControls
              ? "bg-blue-500/20 hover:bg-blue-500/30 text-blue-300"
              : "hover:bg-white/10"
          )}
          title={`Speech: ${showSpeechControls ? 'ON' : 'OFF'}`}
        >
          {showSpeechControls ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
        </button>

        <button
          onClick={onSettings}
          className={cn(
            "p-1 rounded-lg transition-colors",
            ThemeUtils.getBackgroundClass(platform, theme, 'hover')
          )}
          title="Settings"
        >
          <Settings className="w-3 h-3" />
        </button>

        <button
          onClick={onSizeChange}
          className={cn(
            "p-1 rounded-lg hover:bg-white/10 transition-all duration-200",
            isResizing && "bg-blue-500/20 scale-110"
          )}
          title={`Size: ${size}`}
          disabled={isResizing}
        >
          <Maximize2 className="w-3 h-3" />
        </button>

        <button
          onClick={onCollapseToggle}
          className={cn(
            "p-1 rounded-lg hover:bg-white/10 transition-all duration-200",
            isResizing && "opacity-50"
          )}
          title="Collapse"
          disabled={isResizing}
        >
          <Minus className="w-3 h-3" />
        </button>

        <button
          onClick={onHide}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          title="Close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </>
  );
}