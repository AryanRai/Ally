import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Eye, GripVertical, Layers, Maximize2, Minimize2, Pencil, Undo2, X } from 'lucide-react';
import type { TutorAction, TutorBoard, TutorPoint, VisualTutorApi } from '../../electron/visualTutor/types';
import Marks from './Marks';
import DiagramFrame from './DiagramFrame';
import StudyClip from './StudyClip';
import ReviewStrip from './ReviewStrip';
import { dockCanvas, placeCanvas } from './dock';
import { resizeEdges, resizePanel, type PanelRect, type ResizeEdge } from './resizePanel';
import './tutor.css';

declare global { interface Window { tutor: Pick<VisualTutorApi, 'overlay' | 'action' | 'sketch' | 'interactive' | 'onChanged' | 'onPillBounds' | 'cancelRender' | 'loadClip' | 'playbackAck' | 'mediaState' | 'review' | 'controlPlayback' | 'loadNarration'> } }

export default function Overlay() {
  const [board, setBoard] = useState<TutorBoard | null>(null);
  const [screenshot, setScreenshot] = useState('');
  const [stroke, setStroke] = useState<TutorPoint[]>([]);
  const [error, setError] = useState('');
  const strokeRef = useRef<TutorPoint[]>([]);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const resizeRef = useRef<{ pointerId: number; x: number; y: number; rect: PanelRect; edge: ResizeEdge } | null>(null);
  const [resizing, setResizing] = useState(false);
  const [userSize, setUserSize] = useState<{ width: number; height: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setUserSize(null); setPosition(null); setExpanded(false); }, [board?.id]);
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
    return window.tutor.onPillBounds?.(bounds => setBoard(previous => previous ? { ...previous, pillBounds: { ...bounds, x: bounds.x - (previous.presentationBounds??previous.bounds).x, y: bounds.y - (previous.presentationBounds??previous.bounds).y } } : previous));
  }, []);
  useEffect(() => {
    // Context-bridge callbacks can finish out of order: an older acknowledgement
    // must not erase a newer playback command, cue or narration track.
    const receive=(next:TutorBoard|null)=>setBoard(previous=>previous&&next&&previous.id===next.id&&previous.revision>next.revision?previous:next);
    const off = window.tutor.onChanged(receive);
    void window.tutor.overlay().then(state => { receive(state.board); setScreenshot(state.screenshot); }).catch(error => setError(String(error)));
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
  // Width is an input, not feedback from ResizeObserver. The native display
  // and Chromium viewport can differ by a DIP; converting measured width via
  // those different coordinate systems repeatedly grows the card each frame.
  const intendedWidth = userSize?.width ?? Math.min(step?.diagram || step?.clip ? 760 : 420, window.innerWidth - 24);
  const preferredRequest = board.panelAnchor ? { ...board.panelAnchor, width: step?.panel?.width ?? intendedWidth / window.innerWidth * 1000 } : step?.panel;
  const preferred = preferredRequest ? placeCanvas({ width: window.innerWidth, height: window.innerHeight }, board.pillBounds, panelSize, preferredRequest) : undefined;
  const panelStyle = {
    ...(preferred ?? (board.pillBounds ? dockCanvas({ width: window.innerWidth, height: window.innerHeight }, board.pillBounds, panelSize) : {})),
    ...(position ? { ...position, bottom: 'auto', transform: 'none' } : {}),
    ...(userSize ?? {}),
    ...(expanded ? { left: 12, top: 12, bottom: 'auto', transform: 'none', width: Math.max(0, innerWidth - 24), height: Math.max(0, innerHeight - 24) } : {}),
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
  const applyResize = (rect: PanelRect) => {
    setExpanded(false);
    setPosition({ left: rect.left, top: rect.top });
    setUserSize({ width: rect.width, height: rect.height });
  };
  const endResize = (event: React.PointerEvent<HTMLElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const rect = panelRef.current!.getBoundingClientRect();
    window.tutor.interactive(event.type !== 'pointercancel' && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
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
    <section ref={panelRef} className={`tutor-panel${userSize || expanded ? ' is-user-sized' : ''}${board.presentation === 'study' && (step?.diagram || step?.clip) ? ' is-rich-study' : ''}${resizing ? ' is-resizing' : ''}`} style={panelStyle} aria-label="Visual tutor controls" onPointerEnter={() => window.tutor.interactive(true)} onPointerLeave={() => { if (!dragRef.current && !resizeRef.current) window.tutor.interactive(false); }}>
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
      }}><GripVertical size={13} className="tutor-grip" /><span className="tutor-brand">Drawing</span><span className="tutor-time">Snapshot {new Date(board.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></button>{(step?.diagram || step?.clip) && <button type="button" aria-label={expanded ? 'Restore card size' : 'Expand card'} title={expanded ? 'Restore card size' : 'Expand card'} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}{action('Minimise drawing', 'chat', <X size={16} />)}</div>
      <div className="tutor-lesson" aria-live="polite"><h1>{step?.title ?? 'Selection attached'}</h1></div>
      {step?.clip && <StudyClip key={step.id} clip={step.clip} lesson={step.lesson} bookmark={board.bookmarks?.[step.id]} review={!board.following} loadNarration={key=>window.tutor.loadNarration?window.tutor.loadNarration(board.id,key):Promise.reject(Error('Narration loader unavailable'))} layoutKey={JSON.stringify(panelStyle)} mediaIdentity={board.mediaToken?{boardId:board.id,stepId:step.id,token:board.mediaToken}:undefined} onMedia={state=>window.tutor.mediaState?.(state)} command={board.playback?.stepId===step.id?board.playback:undefined} onPlayback={(command,state)=>{void window.tutor.playbackAck?.(command,state).catch(error=>setError(error.message));}} active={board.visible!==false} loadClip={src => window.tutor.loadClip ? window.tutor.loadClip(board.id,src) : Promise.reject(Error('Study clip loader is unavailable'))} onCancel={() => { void window.tutor.cancelRender?.(board.id, step.clip!.jobId).catch(error => setError(error.message)); }} />}
      {step?.diagram && <DiagramFrame key={step.id} diagram={step.diagram} title={step.title} fill={!!userSize || expanded || board.presentation === 'study'} />}
      {error && <p role="alert" className="tutor-error">{error}<button onClick={() => setError('')}>Dismiss</button></p>}
      {board.presentation==='study'&&board.steps.length>0&&<ReviewStrip board={board} select={id=>{void window.tutor.review?.(board.id,id).catch(error=>setError(error.message));}} control={(action,rate)=>{if(step)void window.tutor.controlPlayback?.({boardId:board.id,stepId:step.id,requestId:crypto.randomUUID(),action,...(rate?{rate}:{})}).catch(error=>setError(error.message));}}/>}
      <div className="tutor-controls"><div className="tutor-navigation">{action('Previous step', 'previous', <ArrowLeft size={16} />, board.selected === 0)}<span>{board.steps.length ? `${board.selected + 1} / ${board.steps.length}` : 'No steps yet'}</span>{action('Next step', 'next', <ArrowRight size={16} />, board.selected >= board.steps.length - 1)}{!board.following && <button className="tutor-follow" onClick={() => act('latest')}>Latest <ArrowUpRight size={13} /></button>}</div><div className="tutor-tools">{action(board.frozen ? 'Return to live screen' : 'Freeze snapshot for stable drawings', 'freeze', board.frozen ? <Layers size={16} /> : <Eye size={16} />, false, board.frozen)}{action(board.sketching ? 'Finish sketching' : 'Sketch a question', 'sketch', board.sketching ? <Check size={16} /> : <Pencil size={16} />, false, board.sketching)}{action('Undo last sketch', 'undo', <Undo2 size={16} />, !board.sketches.length)}</div></div>
      <div className="tutor-hint">{board.sketching ? 'Sketch in amber · ask in Ally · Esc minimises' : board.frozen ? 'Frozen snapshot · drag edges to resize · Esc minimises' : 'Apps remain clickable · drag edges to resize · Esc minimises'}</div>
      {(Object.keys(resizeEdges) as ResizeEdge[]).map(edge => <button key={edge} type="button" className={`tutor-resize-handle tutor-resize-${edge}`} aria-label={`Resize drawing ${resizeEdges[edge]}`} title="Drag to resize · arrow keys resize" onPointerDown={event => {
        if (event.button !== 0 || !panelRef.current) return;
        const rect = panelRef.current.getBoundingClientRect();
        resizeRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, edge };
        setResizing(true);
        window.tutor.interactive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault(); event.stopPropagation();
      }} onPointerMove={event => {
        const resize = resizeRef.current;
        if (!resize || resize.pointerId !== event.pointerId) return;
        applyResize(resizePanel(resize.rect, resize.edge, event.clientX - resize.x, event.clientY - resize.y, { width: innerWidth, height: innerHeight }));
      }} onPointerUp={endResize} onPointerCancel={endResize} onLostPointerCapture={() => {
        if (!resizeRef.current) return;
        resizeRef.current = null; setResizing(false); window.tutor.interactive(false);
      }} onKeyDown={event => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta || !panelRef.current) return;
        event.preventDefault(); event.stopPropagation();
        const rect = panelRef.current.getBoundingClientRect(), distance = event.shiftKey ? 40 : 10;
        applyResize(resizePanel({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, edge, delta[0] * distance, delta[1] * distance, { width: innerWidth, height: innerHeight }));
      }} />)}
    </section>
  </main>;
}
