import { useState, useEffect } from 'react';
import { useAccessibilityContext } from './useAccessibilityContext';

interface ContextData {
  clipboard: string;
  selectedText: string;
  lastUpdate: number;
  // Enhanced accessibility data
  hoveredElement?: string;
  focusedElement?: string;
  activeWindow?: string;
  screenContext?: string;
}

export function useContextMonitoring() {
  // Use the new accessibility context hook
  const accessibilityContext = useAccessibilityContext({
    enableTextSelection: true,
    enableHoverDetection: true,
    enableScreenReading: true,
    enableFullScreenCapture: false,
    autoStart: true
  });

  const [contextData, setContextData] = useState<ContextData>({
    clipboard: '',
    selectedText: '',
    lastUpdate: 0
  });
  const [showContext, setShowContext] = useState(true);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [hasNewContext, setHasNewContext] = useState(false);
  const [contextToggleEnabled, setContextToggleEnabled] = useState(true);
  const [includeContextInMessage, setIncludeContextInMessage] = useState(false);
  const [recentlySelected, setRecentlySelected] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(true);

  // Enhanced context monitoring with accessibility integration
  useEffect(() => {
    // Update context data when accessibility context changes
    if (accessibilityContext.context) {
      const newContextData: ContextData = {
        clipboard: contextData.clipboard, // Keep existing clipboard
        selectedText: accessibilityContext.selectedText || '',
        lastUpdate: accessibilityContext.context.timestamp,
        hoveredElement: accessibilityContext.hoveredElement?.text,
        focusedElement: accessibilityContext.focusedElement?.text,
        activeWindow: accessibilityContext.activeWindow ? 
          `${accessibilityContext.activeWindow.application} - ${accessibilityContext.activeWindow.title}` : undefined,
        screenContext: accessibilityContext.getContextSummary()
      };

      setContextData(newContextData);

      // Mark as having new context if there's meaningful content
      if ((newContextData.selectedText || newContextData.hoveredElement || newContextData.focusedElement) && contextToggleEnabled) {
        setHasNewContext(true);
        
        // Mark as recently selected if there's selected text
        if (newContextData.selectedText) {
          setRecentlySelected(true);
          setTimeout(() => setRecentlySelected(false), 30000);
        }
      }
    }

    // Set monitoring status based on accessibility service
    setIsMonitoring(accessibilityContext.isRunning);
  }, [accessibilityContext.context, accessibilityContext.isRunning, contextToggleEnabled]);

  // Legacy clipboard monitoring (fallback)
  useEffect(() => {
    if (!window.pip) return;

    // Listen for clipboard changes (legacy support)
    const cleanupClipboard = window.pip.onClipboardChanged?.((data: any) => {
      setContextData(prev => ({
        ...prev,
        clipboard: data.text,
        lastUpdate: data.timestamp
      }));

      if (data.text.trim() && contextToggleEnabled) {
        setHasNewContext(true);
        setRecentlySelected(false);
      }
    }) || (() => {});

    // Initial clipboard load
    const loadInitialClipboard = async () => {
      try {
        if (window.pip.getClipboard) {
          const clipboard = await window.pip.getClipboard();
          setContextData(prev => ({
            ...prev,
            clipboard,
            lastUpdate: Date.now()
          }));
        }
      } catch (error) {
        console.debug('Could not load initial clipboard:', error);
      }
    };

    loadInitialClipboard();

    return () => {
      cleanupClipboard();
    };
  }, [contextToggleEnabled]);

  const clearNewContextFlag = () => {
    setHasNewContext(false);
    setRecentlySelected(false);
  };

  const shouldIncludeContext = (fromQuickInput: boolean, collapsed: boolean) => {
    return contextToggleEnabled &&
      (includeContextInMessage || recentlySelected || (fromQuickInput && collapsed)) &&
      (contextData.clipboard || contextData.selectedText);
  };

  const buildContextMessage = () => {
    // Use enhanced accessibility context if available
    if (accessibilityContext.includeContextInMessage) {
      const accessibilityContextMessage = accessibilityContext.getChatContext();
      if (accessibilityContextMessage) {
        return `\n\n[${accessibilityContextMessage}]`;
      }
    }

    // Fallback to legacy context building
    const contextParts = [];
    if (contextData.clipboard) {
      contextParts.push(`Clipboard: "${contextData.clipboard}"`);
    }
    if (contextData.selectedText && contextData.selectedText !== contextData.clipboard) {
      contextParts.push(`Selected: "${contextData.selectedText}"`);
    }
    if (contextData.hoveredElement) {
      contextParts.push(`Hovering: "${contextData.hoveredElement}"`);
    }
    if (contextData.focusedElement && contextData.focusedElement !== contextData.selectedText) {
      contextParts.push(`Focused: "${contextData.focusedElement}"`);
    }
    if (contextData.activeWindow) {
      contextParts.push(`Window: ${contextData.activeWindow}`);
    }
    
    return contextParts.length > 0 ? `\n\n[Context: ${contextParts.join(' | ')}]` : '';
  };

  return {
    contextData,
    showContext,
    setShowContext,
    isMonitoring,
    hasNewContext,
    setHasNewContext,
    contextToggleEnabled,
    setContextToggleEnabled,
    includeContextInMessage,
    setIncludeContextInMessage,
    recentlySelected,
    setRecentlySelected,
    contextCollapsed,
    setContextCollapsed,
    clearNewContextFlag,
    shouldIncludeContext,
    buildContextMessage,
    // Enhanced accessibility features
    accessibilityContext,
    hasAdvancedContext: () => !!(contextData.hoveredElement || contextData.focusedElement || contextData.activeWindow),
    getAdvancedContextSummary: () => accessibilityContext.getContextSummary()
  };
}