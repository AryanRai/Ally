import { useEffect, useRef, useState } from 'react';
import type { TutorAction, TutorBoard } from '../../electron/visualTutor/types';

type Send = (text: string, source: 'circle', extras: { image: { path: string; thumbnail: string } }) => Promise<{ error?: string } | undefined>;
export function tutorRequest(text: string, board: TutorBoard | null, chatId?: string): string {
  if (!board || board.chatId !== chatId) return text;
  const focus = board.focus ? ` The attached image is only the selected crop. Its full-display bounds in 0–1000 coordinates are ${JSON.stringify(board.focus)}. Map a point (u,v) in the crop (0–1000) to screen (x + u*width/1000, y + v*height/1000) using these bounds. Draw around this selected area.` : '';
  return `${text}\n\n[Ally visual tutor: ${board.id}. Drawing is available for every Circle question and follow-up, regardless of action. When asked for drawings, use visual_tutor_read, then visual_tutor_draw on ally_chats before your final explanation. For complex diagrams, visual_tutor_draw accepts step.diagram={html,height} with self-contained HTML/SVG and local interactive controls in an isolated sandbox. Otherwise drawing is optional when it helps. If a requested drawing cannot be displayed, explain why instead of silently giving only text. The screen snapshot is from ${new Date(board.capturedAt).toISOString()}, not a live feed.${focus} My amber sketches are available in visual_tutor_read.]`;
}

/** The existing conversation owns reasoning, voice, history and the exact agent session. */
export function useVisualTutor(chatId: string | undefined, send: Send) {
  const [board, setBoard] = useState<TutorBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingSelection, setPendingSelection] = useState(false);
  const pending = useRef<{ boardId: string; chatId: string; image: { path: string; thumbnail: string } } | null>(null);
  const current = useRef({ chatId, send }); current.current = { chatId, send };
  const boardRef = useRef(board); boardRef.current = board;
  const starting = useRef(false);
  useEffect(() => {
    const api = window.pip?.tutor;
    if (!api) return;
    let received = false;
    const off = api.onChanged(next => { received = true; boardRef.current = next; setBoard(next); if (pending.current && next?.id !== pending.current.boardId) { pending.current = null; setPendingSelection(false); } });
    void api.state().then(next => { if (!received) setBoard(next); }).catch(error => setError(error.message));
    return off;
  }, []);
  useEffect(() => {
    const active = boardRef.current;
    if (active && active.chatId !== chatId) {
      void window.pip?.tutor?.end(active.id).catch(error => setError(error.message));
      setBoard(null);
      pending.current = null; setPendingSelection(false);
    }
  }, [chatId, board?.id]);
  const start = async (topic: string, displayId?: number, circleCaptureId?: string, originatingChatId?: string, attachOnly = false) => {
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
      boardRef.current = opened;
      setBusy(false);
      if (attachOnly) {
        pending.current = { boardId: opened.id, chatId: target.chatId, image: { path: capture.imagePath, thumbnail: capture.thumbnail } };
        setPendingSelection(true);
        return;
      }
      // Capture ownership is settled before sending; follow-ups can use existing chat/voice.
      const result = await target.send(tutorRequest(topic.trim() || 'Explain what I am looking at, step by step, with drawings.', opened, target.chatId), 'circle', { image: { path: capture.imagePath, thumbnail: capture.thumbnail } });
      if (result?.error) throw new Error(result.error);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      // Keep an explicitly shared board after a send failure: the agent may
      // already have accepted the message. Only explicit end/chat change revokes it.
    } finally { starting.current = false; setBusy(false); }
  };
  const action = (action: TutorAction) => { if (board) void window.pip?.tutor?.action(board.id, action).catch(error => setError(error.message)); };
  return { board: board?.chatId === chatId ? board : null, busy, error, start, pendingSelection,
    attach: (token: string, target: string) => start('', undefined, token, target, true),
    claimAttachment: (blocked = false): { blocked: boolean; image?: { path: string; thumbnail: string } } => {
      const selection = pending.current;
      if (!selection || selection.chatId !== current.current.chatId || selection.boardId !== boardRef.current?.id) return { blocked: false };
      if (blocked) { setError('Selection attached. Send it when the current response finishes.'); return { blocked: true }; }
      pending.current = null; setPendingSelection(false); setError('');
      return { blocked: false, image: selection.image };
    },
    action,
    hide: () => action('chat'),
    decorate: (text: string) => tutorRequest(text, boardRef.current, current.current.chatId),
    show: () => { if (board) void window.pip?.tutor?.show(board.id).catch(error => setError(error.message)); },
    showAt: (point: { x: number; y: number }) => { if (board) void window.pip?.tutor?.show(board.id, point).catch(error => setError(error.message)); },
    end: () => { pending.current = null; setPendingSelection(false); if (board) void window.pip?.tutor?.end(board.id).catch(error => setError(error.message)); },
  };
}
