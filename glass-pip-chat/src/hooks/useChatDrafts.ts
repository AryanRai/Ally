import { useCallback, useEffect, useRef, useState } from 'react';
import { DRAFTS_KEY, readBackupDrafts, readLocalDrafts, saveBackupDraft } from '../lib/draftStorage';

export function useChatDrafts(chatId: string) {
  const [drafts, setDrafts] = useState(readLocalDrafts);
  const current = useRef(drafts);
  const touched = useRef(new Set<string>());
  const writes = useRef(Promise.resolve());
  const warned = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void readBackupDrafts().then(saved => {
      if (cancelled) return;
      const next = { ...current.current };
      for (const [id, text] of Object.entries(saved)) {
        if (!touched.current.has(id)) next[id] = text;
      }
      current.current = next;
      setDrafts(next);
    }).catch(error => console.warn('Draft backup unavailable; keeping local drafts', error));
    return () => { cancelled = true; };
  }, []);

  const setInput = useCallback((value: string | ((previous: string) => string)) => {
    const text = typeof value === 'function' ? value(current.current[chatId] ?? '') : value;
    const next = { ...current.current, [chatId]: text };
    touched.current.add(chatId);
    current.current = next;
    setDrafts(next);
    // Persistence must never throw from a React state updater and unmount Ally.
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(next)); } catch { /* IndexedDB retains the draft. */ }
    // Serialize edits, including clears, so an older async write cannot win.
    writes.current = writes.current.then(() => saveBackupDraft(chatId, text)).catch(error => {
      if (!warned.current) console.error('Draft backup failed; keep Ally open to retain the draft', error);
      warned.current = true;
    });
  }, [chatId]);

  return { input: drafts[chatId] ?? '', setInput };
}
