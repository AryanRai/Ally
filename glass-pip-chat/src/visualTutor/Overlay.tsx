import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Eye, GripVertical, Layers, Pencil, Undo2, X } from 'lucide-react';
import type { TutorAction, TutorBoard, TutorPoint, VisualTutorApi } from '../../electron/visualTutor/types';
import Marks from './Marks';
import DiagramFrame from './DiagramFrame';
import { dockCanvas, placeCanvas } from './dock';
import './tutor.css';

declare global { interface Window { tutor: Pick<VisualTutorApi, 'overlay' | 'action' | 'sketch' | 'interactive' | 'onChanged' | 'onPillBounds'> } }

export default function Overlay() {
  const [board, setBoard] = useState<TutorBoard | null>(null);
  const [screenshot, setScreenshot] = useState('');
  const [stroke, setStroke] = useState<TutorPoint[]>([]);
  const [error, setError] = useState('');
  const strokeRef = useRef<TutorPoint[]>([]);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [panelSize, setPanelSize] = useState({ width: 420, height: 180 });
  useEffect(() => { setPosition(null); }, [board?.pillBounds?.x, board?.pillBounds?.y, board?.pillBounds?.width, board?.pillBounds?.height]);
  const requestedPanel = board?.steps[board.selected]?.panel;
  useEffect(() => { setPosition(null); }, [board?.panelAnchor?.sequence]);
  useEffect(() => { setPosition(null); }, [board?.steps[board.selected]?.id, requestedPanel?.x, requestedPanel?.y, requestedPanel?.width]);
  const clampPanel = (left: number, top: number) => {
    const panel = panelRef.current;
    return {
      left: Math.max(10, Math.min(left, window.innerWidth - (panel?.offsetWidth ?? 0) - 10)),
      top: Math.max(10, Math.min(top, window.innerHeight - (panel?.offsetHeight ?? 0) - 10)),
    };
  };
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const keepVisible = () => setPosition(previous => {
      if (!previous) return previous;
      const next = clampPanel(previous.left, previous.top);
      return next.left === previous.left && next.top === previous.top ? previous : next;
    });
    const observer = new ResizeObserver(() => { setPanelSize(previous => { const width = panel.offsetWidth, height = panel.offsetHeight; return width && height && (width !== previous.width || height !== previous.height) ? { width, height } : previous; }); keepVisible(); });
    observer.observe(panel);
    window.addEventListener('resize', keepVisible);
    return () => { observer.disconnect(); window.removeEventListener('resize', keepVisible); };
  }, [board?.id]);
  useEffect(() => {
    return window.tutor.onPillBounds?.(bounds => setBoard(previous => previous ? { ...previous, pillBounds: { ...bounds, x: bounds.x - previous.bounds.x, y: bounds.y - previous.bounds.y } } : previous));
  }, []);
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
      if (event.key === 'Escape') act('chat');
      if (event.key === 'ArrowLeft') act('previous');
      if (event.key === 'ArrowRight') act('next');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [board?.id]);
  if (!board) return error ? <div role="alert" className="tutor-error">{error}</div> : null;
  const step = board.steps[board.selected];
  const preferredRequest = board.panelAnchor ? { ...board.panelAnchor, width: step?.panel?.width ?? panelSize.width / board.bounds.width * 1000 } : step?.panel;
  const preferred = preferredRequest ? placeCanvas({ width: window.innerWidth, height: window.innerHeight }, board.pillBounds, panelSize, preferredRequest) : undefined;
  const panelStyle = {
    ...(preferred ?? (board.pillBounds ? dockCanvas({ width: window.innerWidth, height: window.innerHeight }, board.pillBounds, panelSize) : {})),
    ...(position ? { ...position, bottom: 'auto', transform: 'none' } : {}),
    ...(step?.panel?.transparent ? { background: 'transparent', backdropFilter: 'none', borderColor: 'transparent', boxShadow: 'none' } : {}),
  };
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
    <section ref={panelRef} className="tutor-panel" style={panelStyle} aria-label="Visual tutor controls" onPointerEnter={() => window.tutor.interactive(true)} onPointerLeave={() => { if (!dragRef.current) window.tutor.interactive(false); }}>
      <div className="tutor-heading"><button type="button" className="tutor-move-handle" aria-label="Move explanation panel" title="Drag to move · arrow keys to reposition" onPointerDown={event => {
        if (event.button !== 0 || !panelRef.current) return;
        const rect = panelRef.current.getBoundingClientRect();
        dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
        window.tutor.interactive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }} onPointerMove={event => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        setPosition(clampPanel(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y));
      }} onPointerUp={event => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        const rect = panelRef.current!.getBoundingClientRect();
        window.tutor.interactive(event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
      }} onPointerCancel={event => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        window.tutor.interactive(false);
      }} onLostPointerCapture={() => { if (dragRef.current) { dragRef.current = null; window.tutor.interactive(false); } }} onKeyDown={event => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta || !panelRef.current) return;
        event.preventDefault(); event.stopPropagation();
        const rect = panelRef.current.getBoundingClientRect(), distance = event.shiftKey ? 40 : 10;
        setPosition(clampPanel(rect.left + delta[0] * distance, rect.top + delta[1] * distance));
      }}><GripVertical size={13} className="tutor-grip" /><span className="tutor-brand">Drawing</span><span className="tutor-time">Snapshot {new Date(board.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></button>{action('Minimise drawing', 'chat', <X size={16} />)}</div>
      <div className="tutor-lesson" aria-live="polite"><h1>{step?.title ?? 'Selection attached'}</h1></div>
      {step?.diagram && <DiagramFrame key={step.id} diagram={step.diagram} title={step.title} />}
      {error && <p role="alert" className="tutor-error">{error}<button onClick={() => setError('')}>Dismiss</button></p>}
      <div className="tutor-controls"><div className="tutor-navigation">{action('Previous step', 'previous', <ArrowLeft size={16} />, board.selected === 0)}<span>{board.steps.length ? `${board.selected + 1} / ${board.steps.length}` : 'No steps yet'}</span>{action('Next step', 'next', <ArrowRight size={16} />, board.selected >= board.steps.length - 1)}{!board.following && <button className="tutor-follow" onClick={() => act('latest')}>Latest <ArrowUpRight size={13} /></button>}</div><div className="tutor-tools">{action(board.frozen ? 'Return to live screen' : 'Freeze snapshot for stable drawings', 'freeze', board.frozen ? <Layers size={16} /> : <Eye size={16} />, false, board.frozen)}{action(board.sketching ? 'Finish sketching' : 'Sketch a question', 'sketch', board.sketching ? <Check size={16} /> : <Pencil size={16} />, false, board.sketching)}{action('Undo last sketch', 'undo', <Undo2 size={16} />, !board.sketches.length)}</div></div>
      <div className="tutor-hint">{board.sketching ? 'Sketch in amber · ask in Ally · Esc minimises' : board.frozen ? 'Frozen snapshot · ask in Ally · Esc minimises' : 'Apps remain clickable · ask in Ally · Esc minimises'}</div>
    </section>
  </main>;
}
