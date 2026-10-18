import { useEffect, useRef, useState } from 'react';
import { selectionBounds, type Point, type SelectionTool } from './selection';
import type { CircleContext, CircleRect } from '../../electron/capture/types';

/** Ally's pill becomes the selection toolbar; the same frozen area reaches the chat. */
export default function CircleOverlay() {
  const [shot, setShot] = useState<string | null>(null);
  const [context, setContext] = useState<CircleContext | null>(null);
  const [selection, setSelection] = useState<CircleRect | null>(null);
  const [tool, setTool] = useState<SelectionTool>('freehand');
  const [sending, setSending] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const points = useRef<Point[]>([]);
  const drawing = useRef(false);
  const [view, setView] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    void Promise.all([window.pip.circle.getShot(), window.pip.circle.context()]).then(([image, details]) => { setShot(image); setContext(details); if (details?.display) setView(details.display); }).catch(e => setError(String(e)));
    const resize = () => setView({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const cancel = () => void window.pip.circle.cancel();
  const submit = async (rect?: CircleRect) => {
    if (submitting.current || !shot || !context?.hasChat) return;
    submitting.current = true; setSending(true); setError('');
    try { await window.pip.circle.submit({ rect, prompt: '', attachOnly: true }); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); submitting.current = false; setSending(false); }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      else if (e.key === 'Enter' && !drawing.current && e.target === document.body) { e.preventDefault(); void submit(selection ?? undefined); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const paint = () => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pts = points.current;
    if (pts.length < 2) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.shadowColor = 'rgba(255,255,255,.5)'; ctx.shadowBlur = 10; ctx.lineWidth = 2;
    ctx.beginPath();
    if (tool === 'rectangle') ctx.rect(pts[0].x, pts[0].y, pts.at(-1)!.x - pts[0].x, pts.at(-1)!.y - pts[0].y);
    else { ctx.moveTo(pts[0].x, pts[0].y); for (const point of pts.slice(1)) ctx.lineTo(point.x, point.y); }
    ctx.stroke();
  };
  const reset = () => { drawing.current = false; points.current = []; setSelection(null); paint(); };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (sending || !shot || e.button !== 0) return;
    drawing.current = true; points.current = [{ x: e.clientX, y: e.clientY }]; setSelection(null); paint(); e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    // Keep long freehand gestures bounded without dropping their extrema.
    if (points.current.length < 8000) points.current.push({ x: e.clientX, y: e.clientY });
    paint();
  };
  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    points.current.push({ x: e.clientX, y: e.clientY }); drawing.current = false;
    const rect = selectionBounds(points.current, tool, view.width, view.height);
    if (!rect) { reset(); return; }
    setSelection(rect); paint(); void submit(rect);
  };
  useEffect(() => { const canvas = canvasRef.current; if (canvas) { canvas.width = view.width; canvas.height = view.height; } }, [view, shot]);

  useEffect(() => {
    void window.pip.circle.updateSelection({ active: true, tool, ready: !!shot && !!context?.hasChat, sending, error });
  }, [tool, shot, context, sending, error]);
  useEffect(() => window.pip.circle.onSelectionAction(action => {
    if (action === 'cancel') cancel();
    else if (action === 'whole') void submit();
    else if (!sending) { reset(); setTool(action); }
  }));
  return <div className="fixed inset-0 cursor-crosshair select-none overflow-hidden text-white" style={{ fontFamily: 'Geist Variable, sans-serif' }}>
    {shot && <img src={shot} alt="Frozen screen selection" className="pointer-events-none absolute left-0 top-0" style={view} draggable={false} />}
    <div className="pointer-events-none absolute inset-0" style={{ background: 'rgba(0,0,0,.4)', clipPath: selection ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${selection.x}px ${selection.y}px, ${selection.x + selection.width}px ${selection.y}px, ${selection.x + selection.width}px ${selection.y + selection.height}px, ${selection.x}px ${selection.y + selection.height}px, ${selection.x}px ${selection.y}px)` : undefined }} />
    <canvas ref={canvasRef} className="absolute inset-0 touch-none" aria-label="Select an area on screen" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={reset} />

  </div>;
}
