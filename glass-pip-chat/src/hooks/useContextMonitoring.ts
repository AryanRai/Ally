import { useState, useEffect } from 'react';

interface ContextData {
  clipboard: string;
  selectedText: string;
  lastUpdate: number;
}

export function useContextMonitoring() {
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

  // Context monitoring setup
  useEffect(() => {
    if (!window.pip) return;

    // Start monitoring when component mounts
    window.pip.startContextMonitoring();
    setIsMonitoring(true);

    // Listen for clipboard changes
    const cleanupClipboard = window.pip.onClipboardChanged((data: any) => {
      setContextData(prev => ({
        ...prev,
        clipboard: data.text,
        lastUpdate: data.timestamp
      }));

      // Mark as having new context only if app is visible/focused and content changed
      if (data.text.trim() && contextToggleEnabled) {
        setHasNewContext(true);
        // Reset recently selected flag since this is just clipboard change
        setRecentlySelected(false);
      }
    });

    // Listen for selected text changes
    const cleanupSelection = window.pip.onSelectionChanged?.((data: any) => {
      setContextData(prev => ({
        ...prev,
        selectedText: data.text,
        lastUpdate: data.timestamp
      }));

      // Mark as recently selected when text is actively selected
      if (data.text.trim()) {
        setRecentlySelected(true);
        setHasNewContext(true);

        // Clear recently selected flag after 30 seconds
        setTimeout(() => {
          setRecentlySelected(false);
        }, 30000);
      }
    }) || (() => { });

    // Initial context load
    const loadInitialContext = async () => {
      try {
        const [clipboard, selectedText] = await Promise.all([
          window.pip.getClipboard(),
          window.pip.getSelectedText()
        ]);

        setContextData({
          clipboard,
          selectedText,
          lastUpdate: Date.now()
        });
      } catch (error) {
        console.error('Failed to load initial context:', error);
      }
    };

    loadInitialContext();

    // Cleanup
    return () => {
      cleanupClipboard();
      cleanupSelection();
      window.pip.stopContextMonitoring();
      setIsMonitoring(false);
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
    const contextParts = [];
    if (contextData.clipboard) {
      contextParts.push(`Clipboard: "${contextData.clipboard}"`);
    }
    if (contextData.selectedText && contextData.selectedText !== contextData.clipboard) {
      contextParts.push(`Selected: "${contextData.selectedText}"`);
    }
    return contextParts.length > 0 ? `\n\n[Context: ${contextParts.join(', ')}]` : '';
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
    buildContextMessage
  };
}