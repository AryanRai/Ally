import { useEffect, useRef, useState } from 'react';
import type { TutorBoard } from '../../electron/visualTutor/types';

type Send = (text: string, source: 'circle', extras: { image: { path: string; thumbnail: string } }) => Promise<{ error?: string } | undefined>;
export function tutorRequest(text: string, board: TutorBoard | null, chatId?: string): string {
  if (!board || board.chatId !== chatId) return text;
  const focus = board.focus ? ` The attached image is only the selected crop. Its full-display bounds in 0–1000 coordinates are ${JSON.stringify(board.focus)}. Map a point (u,v) in the crop (0–1000) to screen (x + u*width/1000, y + v*height/1000) using these bounds. Draw around this selected area.` : '';
  return `${text}\n\n[Ally visual tutor: ${board.id}. When a drawing would help explain this, use visual_tutor_read, then visual_tutor_draw on ally_chats. Drawing is optional; answer normally when it adds no value. The screen snapshot is from ${new Date(board.capturedAt).toISOString()}, not a live feed.${focus} My amber sketches are available in visual_tutor_read.]`;
}

/** The existing conversation owns reasoning, voice, history and the exact agent session. */
export function useVisualTutor(chatId: string | undefined, send: Send) {
  const [board, setBoard] = useState<TutorBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = useRef({ chatId, send }); current.current = { chatId, send };
  const boardRef = useRef(board); boardRef.current = board;
  const starting = useRef(false);
  useEffect(() => {
    const api = window.pip?.tutor;
    if (!api) return;
    let received = false;
    const off = api.onChanged(next => { received = true; setBoard(next); });
    void api.state().then(next => { if (!received) setBoard(next); }).catch(error => setError(error.message));
    return off;
  }, []);
  useEffect(() => {
    const active = boardRef.current;
    if (active && active.chatId !== chatId) {
      void window.pip?.tutor?.end(active.id).catch(error => setError(error.message));
      setBoard(null);
    }
  }, [chatId, board?.id]);
  const start = async (topic: string, displayId?: number, circleCaptureId?: string, originatingChatId?: string) => {
    const api = window.pip?.tutor;
    if (!api) { setError('Visual tutor needs the updated desktop app.'); return; }
    const target = current.current;
    if (originatingChatId && target.chatId !== originatingChatId) { setError('The selected chat changed. Circle the area again in this chat.'); return; }
    if (!target.chatId || starting.current) return;
    starting.current = true; setBusy(true); setError('');
    let opened: TutorBoard | null = null;
    try {
      const capture = circleCaptureId ? await api.start(target.chatId, displayId, circleCaptureId) : await api.start(target.chatId, displayId);
      opened = capture.board;
      if (current.current.chatId !== target.chatId) { await api.end(opened.id); return; }
      setBoard(opened);
      setBusy(false);
      // Capture ownership is settled before sending; follow-ups can use existing chat/voice.
      const result = await target.send(tutorRequest(topic.trim() || 'Explain what I am looking at, step by step, with drawings.', opened, target.chatId), 'circle', { image: { path: capture.imagePath, thumbnail: capture.thumbnail } });
      if (result?.error) throw new Error(result.error);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      if (opened) { await api.end(opened.id).catch(() => {}); setBoard(null); }
    } finally { starting.current = false; setBusy(false); }
  };
  return { board: board?.chatId === chatId ? board : null, busy, error, start,
    decorate: (text: string) => tutorRequest(text, boardRef.current, current.current.chatId),
    show: () => { if (board) void window.pip?.tutor?.show(board.id).catch(error => setError(error.message)); },
    end: () => { if (board) void window.pip?.tutor?.end(board.id).catch(error => setError(error.message)); },
  };
}
