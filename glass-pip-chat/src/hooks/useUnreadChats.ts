import { useEffect, useRef, useState } from 'react';
/** Read only: browsing a chat picker must never clear its unread dot. */
export function useDiscoveryReadStates(savedKeys: string[] = []) {
  const saved = useRef(savedKeys); saved.current = savedKeys;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [keys, setKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const states = await window.pip?.agent?.readStates?.(saved.current);
        if (alive && states) { setKeys(new Set(states.filter(s => s.unread && !s.hidden).map(s => s.key))); setHidden(new Set(states.filter(s => s.hidden).map(s => s.key))); }
      } catch { /* Retain last known badges while reconnecting. */ }
      if (alive) timer = setTimeout(refresh, 2500);
    };
    void refresh();
    const unsubscribe = window.pip?.agent?.onInteractionsChanged?.(() => void refresh());
    return () => { alive = false; clearTimeout(timer); unsubscribe?.(); };
  }, []);
  return { keys, hidden };
}

export function useUnreadChats() { return useDiscoveryReadStates().keys; }
