import { useCallback, useEffect, useRef, useState } from 'react';
import type { InteractionHistory } from '../../electron/devices/interactions';
import type { ApprovalAnswer } from '../../electron/watch/approvals';

export function useChatInteractions(chatId?: string) {
  const [data, setData] = useState<{ chatId?: string; rows: InteractionHistory[] }>({ rows: [] });
  const selected = useRef(chatId); selected.current = chatId;
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const api = window.pip?.agent;
    if (!chatId || !api?.interactionHistory) return;
    let disposed = false, loading = false, dirty = false;
    const refresh = async () => {
      if (disposed) return;
      if (loading) { dirty = true; return; }
      loading = true;
      try {
        const rows = await api.interactionHistory(chatId);
        if (!disposed) setData(previous => previous.chatId === chatId && JSON.stringify(previous.rows) === JSON.stringify(rows) ? previous : { chatId, rows });
      } catch { /* Retain the last confirmed state during reconnects. */ }
      finally { loading = false; if (dirty && !disposed) { dirty = false; void refresh(); } }
    };
    refreshRef.current = refresh;
    const unsubscribe = api.onInteractionsChanged(() => void refresh());
    const timer = setInterval(refresh, 2000);
    void refresh();
    return () => { disposed = true; clearInterval(timer); unsubscribe(); };
  }, [chatId]);
  const answer = useCallback(async (id: string, value: ApprovalAnswer) => {
    if (!chatId || selected.current !== chatId) throw Error('Select the original chat before answering.');
    const result = await window.pip.agent!.answerInteraction(chatId, id, value);
    await refreshRef.current();
    return result;
  }, [chatId]);
  return { rows: data.chatId === chatId ? data.rows : [], answer };
}
