import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Lasso, RectangleHorizontal, X } from 'lucide-react';
import { selectionBounds, selectionPanel, type Point, type SelectionTool } from './selection';
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

  const anchor = context?.anchor;
  const dock = selectionPanel(view, anchor && { ...anchor, x: anchor.x > 420 ? anchor.x - 412 : anchor.x + anchor.width + 12 });
  const button = 'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-white/65 hover:bg-white/10 hover:text-white disabled:opacity-40';
  return <div className="fixed inset-0 cursor-crosshair select-none overflow-hidden text-white" style={{ fontFamily: 'Geist Variable, sans-serif' }}>
    {shot && <img src={shot} alt="Frozen screen selection" className="pointer-events-none absolute left-0 top-0" style={view} draggable={false} />}
    <div className="pointer-events-none absolute inset-0" style={{ background: 'rgba(0,0,0,.4)', clipPath: selection ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${selection.x}px ${selection.y}px, ${selection.x + selection.width}px ${selection.y}px, ${selection.x + selection.width}px ${selection.y + selection.height}px, ${selection.x}px ${selection.y + selection.height}px, ${selection.x}px ${selection.y}px)` : undefined }} />
    <canvas ref={canvasRef} className="absolute inset-0 touch-none" aria-label="Select an area on screen" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={reset} />
    <motion.section aria-label="Ally screen selection" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} className="absolute cursor-default rounded-[18px] border border-white/10 bg-black/60 p-2 shadow-2xl backdrop-blur-2xl" style={dock}>
      <div className="flex min-w-0 items-center gap-2 px-1">
        <span className="text-[11px] text-white/65">Select area</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-white/45" title={context?.title}>{context?.title || 'Screen selection'}</span>
        <button type="button" className={button} aria-label="Cancel selection" title="Return to chat (Esc)" onClick={cancel}><X className="size-3.5" /></button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <button type="button" disabled={sending} aria-pressed={tool === 'freehand'} className={`${button} ${tool === 'freehand' ? 'bg-white/10' : ''}`} onClick={() => { reset(); setTool('freehand'); }}><Lasso className="size-3.5" />Freehand</button>
        <button type="button" disabled={sending} aria-pressed={tool === 'rectangle'} className={`${button} ${tool === 'rectangle' ? 'bg-white/10' : ''}`} onClick={() => { reset(); setTool('rectangle'); }}><RectangleHorizontal className="size-3.5" />Rectangle</button>
        <button type="button" disabled={sending || !shot || !context?.hasChat} className={`${button} ml-auto`} onClick={() => void submit()}>Whole screen</button>
      </div>
      <p className="px-1 pt-1 text-[10px] text-white/40">{!shot ? 'Preparing screen…' : !context?.hasChat ? 'Choose a chat in Ally first.' : sending ? 'Attaching to your pill…' : 'Release to attach · ask in Ally · Esc cancels'}</p>
      {error && <p role="alert" className="px-1 pt-1 text-xs text-amber-200">{error}</p>}
    </motion.section>
  </div>;
}
