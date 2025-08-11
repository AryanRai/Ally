import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clipboard, 
  MousePointer, 
  ChevronDown, 
  X 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ThemeUtils } from '../../utils/themeUtils';

interface ContextDisplayProps {
  platform: string;
  theme: 'light' | 'dark';
  showContext: boolean;
  contextToggleEnabled: boolean;
  hasNewContext: boolean;
  contextData: any;
  recentlySelected: boolean;
  contextCollapsed: boolean;
  setContextCollapsed: (collapsed: boolean) => void;
  includeContextInMessage: boolean;
  setIncludeContextInMessage: (include: boolean) => void;
  isMonitoring: boolean;
  onDismiss: () => void;
}

export default function ContextDisplay({
  platform,
  theme,
  showContext,
  contextToggleEnabled,
  hasNewContext,
  contextData,
  recentlySelected,
  contextCollapsed,
  setContextCollapsed,
  includeContextInMessage,
  setIncludeContextInMessage,
  isMonitoring,
  onDismiss
}: ContextDisplayProps) {
  if (!showContext || !contextToggleEnabled || !hasNewContext || (!contextData.clipboard && !contextData.selectedText)) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        "border-b space-y-2",
        platform === 'win32'
          ? "bg-blue-500/5 border-white/10"
          : "bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-sm",
        platform !== 'win32' && ThemeUtils.getBorderClass(platform, theme)
      )}
    >
      {/* Header with collapse button */}
      <div className="flex items-center justify-between p-3 pb-2">
        <button
          onClick={() => setContextCollapsed(!contextCollapsed)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Clipboard className="w-3 h-3 opacity-60" />
          <span className="text-xs font-medium opacity-80">
            {recentlySelected ? 'Recently Selected' : 'Context Available'}
          </span>
          <ChevronDown className={cn(
            "w-3 h-3 opacity-60 transition-transform",
            !contextCollapsed && "rotate-180"
          )} />
          {isMonitoring && (
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          )}
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={onDismiss}
            className={cn(
              "p-1 rounded transition-colors",
              ThemeUtils.getBackgroundClass(platform, theme, 'hover')
            )}
            title="Dismiss context"
          >
            <X className="w-3 h-3 opacity-60" />
          </button>
        </div>
      </div>

      {/* Collapsible content */}
      <AnimatePresence>
        {!contextCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 pb-3 space-y-2"
          >
            {contextData.clipboard && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Clipboard className="w-3 h-3 opacity-50" />
                  <span className="text-xs opacity-70">Clipboard:</span>
                </div>
                <div className={cn(
                  "text-xs p-2 rounded-lg max-h-16 overflow-y-auto",
                  "border",
                  ThemeUtils.getScrollbarClass(platform, theme),
                  platform === 'win32'
                    ? "bg-white/5 border-white/10"
                    : theme === 'dark'
                      ? "bg-white/5 border-white/10"
                      : "bg-black/5 border-black/10"
                )}>
                  {contextData.clipboard.length > 200
                    ? `${contextData.clipboard.substring(0, 200)}...`
                    : contextData.clipboard}
                </div>
              </div>
            )}

            {contextData.selectedText && contextData.selectedText !== contextData.clipboard && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <MousePointer className="w-3 h-3 opacity-50" />
                  <span className="text-xs opacity-70">Selected:</span>
                </div>
                <div className={cn(
                  "text-xs p-2 rounded-lg max-h-16 overflow-y-auto",
                  "border",
                  ThemeUtils.getScrollbarClass(platform, theme),
                  platform === 'win32'
                    ? "bg-white/5 border-white/10"
                    : theme === 'dark'
                      ? "bg-white/5 border-white/10"
                      : "bg-black/5 border-black/10"
                )}>
                  {contextData.selectedText.length > 200
                    ? `${contextData.selectedText.substring(0, 200)}...`
                    : contextData.selectedText}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context inclusion toggle */}
      <div className="px-3 pb-3 pt-1 border-t border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeContextInMessage}
                onChange={(e) => setIncludeContextInMessage(e.target.checked)}
                className="w-3 h-3 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-1"
              />
              <span className="text-xs opacity-80">Include in messages</span>
            </label>
            {recentlySelected && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                Auto-include
              </span>
            )}
          </div>
          {(includeContextInMessage || recentlySelected) && (
            <span className="text-xs opacity-60">📋 Will attach</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}