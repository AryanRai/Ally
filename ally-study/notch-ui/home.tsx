import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NotchHomePreview from '@/components/chat/NotchHomePreview';
import { notchHomePreview, type HomeHistory, type HomeTurn } from '@/lib/notchHomePreview';
import { isSurfaceVisible } from './surfaceVisibility';
import {PendingDecisions} from './decisions';
import HandoffHalo from '@/components/chat/HandoffHalo';

export default function NotchHome({ api }: { api: (route: string, body?:unknown) => Promise<any> }) {
  const [history, setHistory] = useState<HomeHistory | null>(null);
  const [turn, setTurn] = useState<HomeTurn | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true, selected = '', loadedAt = 0, lastTurn = '', running = false, busy = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async (force = false) => {
      clearTimeout(timer);
      if (busy || !alive) return;
      if (!isSurfaceVisible() && !force) return;
      busy = true;
      try {
        const state = await api('selection');
        if (!alive) return;
        const id = state.selected?.chatId || '';
        if (id !== selected) { selected = id; loadedAt = 0; lastTurn = ''; running = false; setHistory(null); setTurn(null); setLoading(!!id); }
        if (!id) { setLoading(false); setError(''); return; }
        const active = state.activeTurn?.chatId === id ? state.activeTurn : null;
        const turnId = active?.id || '';
        if (force || !loadedAt || turnId !== lastTurn || Date.now() - loadedAt > (running ? 3000 : 15000)) {
          const next: HomeHistory = await api(`chats/${encodeURIComponent(id)}`);
          if (!alive) return;
          setHistory(old => old && old.chat.id === next.chat.id && old.chat.title === next.chat.title && old.running === next.running
            && old.messages.length === next.messages.length && old.messages.every((m, i) => m.role === next.messages[i].role && m.text === next.messages[i].text && m.timestamp === next.messages[i].timestamp) ? old : next);
          loadedAt = Date.now(); running = next.running; setLoading(false);
        }
        lastTurn = turnId;
        if (active) {
          const next: HomeTurn = await api(`turns/${encodeURIComponent(turnId)}`);
          if (!alive) return;
          setTurn(old => old && old.id === next.id && old.chatId === next.chatId && old.status === next.status && old.liveText === next.liveText
            && old.transcript === next.transcript && old.reply?.text === next.reply?.text ? old : next);
          running = next.status === 'thinking';
        } else setTurn(null);
        setError('');
      } catch { if (alive) { setError('Preview unavailable. Open the Chat tab or retry.'); setLoading(false); } }
      finally { busy = false; if (alive) timer = setTimeout(poll, running ? 500 : 2000); }
    };
    const wake = () => { if (isSurfaceVisible()) void poll(true); else clearTimeout(timer); };
    refresh.current = () => void poll(true);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('ally-surface-visibility', wake);
    void poll();
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', wake); window.removeEventListener('ally-surface-visibility', wake); };
  }, [api]);
  const openChat = useCallback(() => {
    const host = (window as unknown as { chrome?: { webview?: { postMessage: (value: string) => void } } }).chrome?.webview;
    if (host) host.postMessage('ally:chat');
    else setError('Use the native Chat tab to continue.');
  }, []);
  const update = useCallback(() => refresh.current(), []);
  const preview = useMemo(() => notchHomePreview(history, turn), [history, turn]);
  return <div style={{height:'100vh',display:'flex',flexDirection:'column',position:'relative'}}><HandoffHalo/><PendingDecisions api={api} compact onOpen={openChat}/><div style={{flex:1,minHeight:0}}><NotchHomePreview {...preview} loading={loading} error={error} onRefresh={update} onOpenChat={openChat}/></div></div>;
}
