/**
 * Unified Accessibility Context Monitor
 * 
 * Displays real-time accessibility context including:
 * - Clipboard content
 * - Selected text from any application
 * - Hovered elements with details
 * - Focused elements and their properties
 * - Active window information
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Eye, 
  EyeOff, 
  MousePointer, 
  Focus, 
  Monitor, 
  Type, 
  ChevronDown, 
  ChevronUp,
  Settings,
  Play,
  Square,
  AlertCircle,
  Clipboard,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAccessibilityContext } from '../hooks/useAccessibilityContext';

interface AccessibilityContextMonitorProps {
  platform: string;
  theme: 'light' | 'dark';
  className?: string;
  // Clipboard props (from legacy ContextDisplay)
  clipboardText?: string;
  onDismiss?: () => void;
}

export const AccessibilityContextMonitor: React.FC<AccessibilityContextMonitorProps> = ({
  platform,
  theme,
  className = '',
  clipboardText: externalClipboard,
  onDismiss
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [clipboardText, setClipboardText] = useState('');

  const {
    selectedText,
    hoveredElement,
    focusedElement,
    activeWindow,
    isRunning,
    start,
    stop,
    hasRecentContext,
    includeContextInMessage,
    setIncludeContextInMessage,
    error
  } = useAccessibilityContext({
    enableTextSelection: true,
    enableHoverDetection: true,
    enableScreenReading: true,
    enableFullScreenCapture: false,
    autoStart: true
  });

  // Load clipboard on mount and listen for changes
  useEffect(() => {
    if (!window.pip) return;

    const loadClipboard = async () => {
      try {
        if (window.pip.getClipboard) {
          const clipboard = await window.pip.getClipboard();
          setClipboardText(clipboard || '');
        }
      } catch (e) {
        console.debug('Could not load clipboard:', e);
      }
    };

    loadClipboard();

    // Listen for clipboard changes
    const cleanup = window.pip.onClipboardChanged?.((data: any) => {
      setClipboardText(data.text || '');
    }) || (() => {});

    return cleanup;
  }, []);

  // Use external clipboard if provided
  const displayClipboard = externalClipboard || clipboardText;

  const handleToggleService = async () => {
    if (isRunning) {
      stop();
    } else {
      await start();
    }
  };

  const getStatusColor = () => {
    if (error) return 'text-red-400';
    if (!isRunning) return 'text-gray-400';
    if (hasRecentContext() || displayClipboard) return 'text-green-400';
    return 'text-blue-400';
  };

  const getStatusIcon = () => {
    if (error) return <AlertCircle className="w-3 h-3" />;
    if (!isRunning) return <Square className="w-3 h-3" />;
    return <Eye className="w-3 h-3" />;
  };

  const hasAnyContext = hasRecentContext() || !!displayClipboard;

  return (
    <div className={cn(
      "border rounded-lg overflow-hidden",
      platform === 'win32'
        ? "bg-black/20 border-white/10"
        : theme === 'dark' 
          ? "bg-white/5 border-white/10"
          : "bg-black/5 border-black/10",
      className
    )}>
      {/* Header */}
      <div 
        className={cn(
          "flex items-center justify-between p-2 cursor-pointer",
          platform === 'win32'
            ? "hover:bg-white/5"
            : theme === 'dark' 
              ? "hover:bg-white/5"
              : "hover:bg-black/5"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1", getStatusColor())}>
            {getStatusIcon()}
            <span className="text-xs font-medium">Context</span>
          </div>
          
          {hasAnyContext && (
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleService();
            }}
            className={cn(
              "p-1 rounded text-xs transition-colors",
              isRunning
                ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                : "bg-gray-500/20 text-gray-400 hover:bg-gray-500/30"
            )}
            title={isRunning ? "Stop monitoring" : "Start monitoring"}
          >
            {isRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSettings(!showSettings);
            }}
            className={cn(
              "p-1 rounded text-xs transition-colors",
              "hover:bg-white/10"
            )}
            title="Settings"
          >
            <Settings className="w-3 h-3" />
          </button>

          {onDismiss && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className={cn(
                "p-1 rounded text-xs transition-colors",
                "hover:bg-white/10"
              )}
              title="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </div>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={cn(
              "border-t px-3 py-2",
              platform === 'win32'
                ? "border-white/10 bg-black/10"
                : theme === 'dark' 
                  ? "border-white/10 bg-white/5"
                  : "border-black/10 bg-black/5"
            )}
          >
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={includeContextInMessage}
                  onChange={(e) => setIncludeContextInMessage(e.target.checked)}
                  className="w-3 h-3"
                />
                <span>Include context in messages</span>
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={cn(
              "border-t",
              platform === 'win32'
                ? "border-white/10"
                : theme === 'dark' 
                  ? "border-white/10"
                  : "border-black/10"
            )}
          >
            {error && (
              <div className="p-3 bg-red-500/10 border-b border-red-500/20">
                <div className="flex items-center gap-2 text-red-400 text-xs">
                  <AlertCircle className="w-3 h-3" />
                  <span>Error: {error}</span>
                </div>
              </div>
            )}

            <div className="p-3 space-y-3">
              {/* Clipboard */}
              {displayClipboard && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs font-medium">
                    <Clipboard className="w-3 h-3" />
                    <span>Clipboard</span>
                  </div>
                  <div className={cn(
                    "text-xs pl-4 p-2 rounded max-h-16 overflow-y-auto",
                    platform === 'win32'
                      ? "bg-white/5"
                      : theme === 'dark' ? "bg-white/5" : "bg-black/5"
                  )}>
                    {displayClipboard.length > 200 
                      ? displayClipboard.substring(0, 200) + '...' 
                      : displayClipboard}
                  </div>
                </div>
              )}

              {/* Active Window */}
              {activeWindow && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs font-medium">
                    <Monitor className="w-3 h-3" />
                    <span>Active Window</span>
                  </div>
                  <div className="text-xs text-gray-400 pl-4">
                    <div>{activeWindow.application} - {activeWindow.title}</div>
                    {activeWindow.url && (
                      <div className="truncate">{activeWindow.url}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Selected Text */}
              {selectedText && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs font-medium">
                    <Type className="w-3 h-3" />
                    <span>Selected Text</span>
                  </div>
                  <div className="text-xs text-gray-400 pl-4 bg-blue-500/10 p-2 rounded">
                    "{selectedText.length > 100 ? selectedText.substring(0, 100) + '...' : selectedText}"
                  </div>
                </div>
              )}

              {/* Hovered Element */}
              {hoveredElement?.text && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs font-medium">
                    <MousePointer className="w-3 h-3" />
                    <span>Hovered Element</span>
                  </div>
                  <div className="text-xs text-gray-400 pl-4">
                    <div className="font-mono text-purple-400">{hoveredElement.role}</div>
                    <div>"{hoveredElement.text.substring(0, 80)}{hoveredElement.text.length > 80 ? '...' : ''}"</div>
                    {hoveredElement.description && (
                      <div className="text-gray-500">{hoveredElement.description}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Focused Element */}
              {focusedElement?.text && focusedElement.text !== selectedText && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-xs font-medium">
                    <Focus className="w-3 h-3" />
                    <span>Focused Element</span>
                  </div>
                  <div className="text-xs text-gray-400 pl-4">
                    <div className="font-mono text-green-400">{focusedElement.role}</div>
                    <div>"{focusedElement.text.substring(0, 80)}{focusedElement.text.length > 80 ? '...' : ''}"</div>
                  </div>
                </div>
              )}

              {/* No Context */}
              {!displayClipboard && !selectedText && !hoveredElement?.text && !focusedElement?.text && !activeWindow && (
                <div className="text-center py-4">
                  <EyeOff className="w-6 h-6 mx-auto text-gray-400 mb-2" />
                  <p className="text-xs text-gray-400">No context detected</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Copy text, select content, or hover over elements
                  </p>
                </div>
              )}

              {/* Context Summary */}
              {(displayClipboard || selectedText || hoveredElement?.text || focusedElement?.text) && (
                <div className="pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeContextInMessage}
                        onChange={(e) => setIncludeContextInMessage(e.target.checked)}
                        className="w-3 h-3"
                      />
                      <span className="opacity-80">Include in messages</span>
                    </label>
                    {includeContextInMessage && (
                      <span className="text-xs opacity-60">📋 Will attach</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};