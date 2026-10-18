import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Eye, Layers, MessageCircle, Pencil, Undo2, X } from 'lucide-react';
import type { TutorAction, TutorBoard, TutorPoint, VisualTutorApi } from '../../electron/visualTutor/types';
import Marks from './Marks';
import './tutor.css';

declare global { interface Window { tutor: Pick<VisualTutorApi, 'overlay' | 'action' | 'sketch' | 'interactive' | 'onChanged'> } }

export default function Overlay() {
  const [board, setBoard] = useState<TutorBoard | null>(null);
  const [screenshot, setScreenshot] = useState('');
  const [stroke, setStroke] = useState<TutorPoint[]>([]);
  const [error, setError] = useState('');
  const strokeRef = useRef<TutorPoint[]>([]);
  useEffect(() => {
    const off = window.tutor.onChanged(setBoard);
    void window.tutor.overlay().then(state => { setBoard(previous => previous && state.board && previous.revision > state.board.revision ? previous : state.board); setScreenshot(state.screenshot); }).catch(error => setError(String(error)));
    return off;
  }, []);
  const act = (action: TutorAction) => {
    if (board) void window.tutor.action(board.id, action).catch(error => setError(error.message));
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') act('close');
      if (event.key === 'ArrowLeft') act('previous');
      if (event.key === 'ArrowRight') act('next');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [board?.id]);
  if (!board) return error ? <div role="alert" className="tutor-error">{error}</div> : null;
  const step = board.steps[board.selected];
  const action = (label: string, name: TutorAction, icon: React.ReactNode, disabled = false, pressed?: boolean) => <button type="button" title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={() => act(name)}>{icon}</button>;
  // Windows can round the native window up by 1–2 DIP on mixed-DPI monitors.
  // Map the capture and pen to the display's coordinates, never the rounded viewport.
  const displaySize = { width: board.bounds.width, height: board.bounds.height };
  const point = (event: React.PointerEvent) => ({ x: Math.max(0, Math.min(1000, event.clientX / board.bounds.width * 1000)), y: Math.max(0, Math.min(1000, event.clientY / board.bounds.height * 1000)) });
  const endStroke = (event: React.PointerEvent) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const points = strokeRef.current;
    strokeRef.current = []; setStroke([]);
    if (points.length >= 2) void window.tutor.sketch(board.id, points).catch(error => setError(error.message));
  };
  return <main className={`tutor-overlay ${board.sketching ? 'is-sketching' : ''}`}>
    {board.frozen && <img className="tutor-frozen" style={displaySize} src={screenshot} alt="Screen snapshot shared with Ally" draggable={false} />}
    <div className="tutor-drawings" style={displaySize} aria-hidden="true"><Marks marks={[...(step?.marks ?? []), ...board.sketches]} width={board.bounds.width} height={board.bounds.height} />{stroke.length > 1 && <Marks marks={[{ id: 'draft', kind: 'polyline', color: 'amber', points: stroke }]} width={board.bounds.width} height={board.bounds.height} prefix="draft" />}</div>
    {board.sketching && <div className="tutor-sketch-surface" aria-label="Sketch on screen" onPointerDown={event => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      strokeRef.current = [point(event)]; setStroke(strokeRef.current);
    }} onPointerMove={event => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const next = point(event), previous = strokeRef.current.at(-1)!;
      if (Math.hypot(next.x - previous.x, next.y - previous.y) < 1.5) return;
      if (strokeRef.current.length < 256) strokeRef.current = [...strokeRef.current, next];
      else strokeRef.current = [...strokeRef.current.slice(0, -1), next];
      setStroke(strokeRef.current);
    }} onPointerUp={endStroke} onPointerCancel={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); strokeRef.current = []; setStroke([]); }} />}
    <section className="tutor-panel" aria-label="Visual tutor controls" onPointerEnter={() => window.tutor.interactive(true)} onPointerLeave={() => window.tutor.interactive(false)}>
      <div className="tutor-heading"><span className="tutor-brand"><span />Ally <span className="tutor-quiet">/ Visual tutor</span></span><span className="tutor-time">Snapshot {new Date(board.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>{action('End visual tutor', 'close', <X size={16} />)}</div>
      <div className="tutor-lesson" aria-live="polite"><h1>{step?.title ?? 'Ready to explain'}</h1><p>{step?.explanation || (board.steps.length ? 'Ask Ally a follow-up in your chat.' : 'Ally can add drawings here while answering in your chat.')}</p></div>
      {error && <p role="alert" className="tutor-error">{error}<button onClick={() => setError('')}>Dismiss</button></p>}
      <div className="tutor-controls"><div className="tutor-navigation">{action('Previous step', 'previous', <ArrowLeft size={16} />, board.selected === 0)}<span>{board.steps.length ? `${board.selected + 1} / ${board.steps.length}` : 'No steps yet'}</span>{action('Next step', 'next', <ArrowRight size={16} />, board.selected >= board.steps.length - 1)}{!board.following && <button className="tutor-follow" onClick={() => act('latest')}>Latest <ArrowUpRight size={13} /></button>}</div><div className="tutor-tools">{action(board.frozen ? 'Return to live screen' : 'Freeze snapshot for stable drawings', 'freeze', board.frozen ? <Layers size={16} /> : <Eye size={16} />, false, board.frozen)}{action(board.sketching ? 'Finish sketching' : 'Sketch a question', 'sketch', board.sketching ? <Check size={16} /> : <Pencil size={16} />, false, board.sketching)}{action('Undo last sketch', 'undo', <Undo2 size={16} />, !board.sketches.length)}<button className="tutor-chat" onClick={() => act('chat')}><MessageCircle size={14} />Ask Ally</button></div></div>
      <div className="tutor-hint">{board.sketching ? 'Sketch in amber, then ask Ally about it. Esc ends this session.' : board.frozen ? 'Frozen snapshot · return to live screen to interact with your apps.' : 'Apps remain clickable · refresh from Ally if the page moves.'}</div>
    </section>
  </main>;
}
