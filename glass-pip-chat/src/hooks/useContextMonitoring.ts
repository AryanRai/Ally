import { useCallback, useEffect, useState } from 'react';

export interface ContextData {
  clipboard: string;
  selectedText: string;
  lastUpdate: number;
}

/**
 * Watches the system clipboard so the overlay can offer "Explain this" /
 * attach-as-context on whatever the user just copied.
 */
export function useContextMonitoring() {
  const [contextData, setContextData] = useState<ContextData>({ clipboard: '', selectedText: '', lastUpdate: 0 });
  const [showContext, setShowContext] = useState(true);
  const [hasNewContext, setHasNewContext] = useState(false);
  const [contextToggleEnabled, setContextToggleEnabled] = useState(true);
  const [includeContextInMessage, setIncludeContextInMessage] = useState(false);

  useEffect(() => {
    const pip = window.pip;
    if (!pip || !contextToggleEnabled) return;

    pip.startContextMonitoring();
    const unsubscribe = pip.onClipboardChanged(({ text, timestamp }) => {
      setContextData(prev => ({ ...prev, clipboard: text, lastUpdate: timestamp }));
      if (text.trim()) setHasNewContext(true);
    });
    pip.getClipboard()
      .then(clipboard => setContextData(prev => ({ ...prev, clipboard, lastUpdate: Date.now() })))
      .catch(() => {});

    return () => {
      unsubscribe();
      pip.stopContextMonitoring();
    };
  }, [contextToggleEnabled]);

  const clearNewContextFlag = useCallback(() => setHasNewContext(false), []);

  /** Clipboard rides along with a quick-input message sent while collapsed, or when opted in. */
  const shouldIncludeContext = (fromQuickInput: boolean, collapsed: boolean) =>
    contextToggleEnabled && hasNewContext && !!contextData.clipboard &&
    (includeContextInMessage || (fromQuickInput && collapsed));

  return {
    contextData,
    showContext,
    setShowContext,
    hasNewContext,
    setHasNewContext,
    contextToggleEnabled,
    setContextToggleEnabled,
    includeContextInMessage,
    setIncludeContextInMessage,
    clearNewContextFlag,
    shouldIncludeContext,
  };
}
