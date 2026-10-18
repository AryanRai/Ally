import { useEffect, useState } from 'react';
/** Read only: browsing a chat picker must never clear its unread dot. */
export function useUnreadChats() {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const states = await window.pip?.agent?.readStates?.();
        if (alive && states) setKeys(new Set(states.filter(s => s.unread).map(s => s.key)));
      } catch { /* Retain last known badges while reconnecting. */ }
      if (alive) timer = setTimeout(refresh, 2500);
    };
    void refresh();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return keys;
}
