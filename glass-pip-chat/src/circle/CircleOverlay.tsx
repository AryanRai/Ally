import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { CIRCLE_ACTIONS, CircleAction, buildCirclePrompt } from './actions';

interface Point { x: number; y: number }
interface Rect { x: number; y: number; width: number; height: number }

const MIN_SELECTION_PX = 16;
const SELECTION_PADDING = 10;

function boundingRect(points: Point[]): Rect {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const x = Math.max(0, Math.min(...xs) - SELECTION_PADDING);
  const y = Math.max(0, Math.min(...ys) - SELECTION_PADDING);
  return {
    x,
    y,
    width: Math.min(window.innerWidth, Math.max(...xs) + SELECTION_PADDING) - x,
    height: Math.min(window.innerHeight, Math.max(...ys) + SELECTION_PADDING) - y,
  };
}

/** Full-screen "Circle to Ask" overlay: draw around anything, then ask the agent about it. */
export default function CircleOverlay() {
  const [shot, setShot] = useState<string | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [typed, setTyped] = useState('');
  const [sending, setSending] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const points = useRef<Point[]>([]);
  const drawing = useRef(false);

  useEffect(() => {
    window.pip.circle.getShot().then(setShot);
  }, []);

  const submit = async (action: CircleAction | null, wholeScreen = false) => {
    if (sending) return;
    setSending(true);
    await window.pip.circle.submit({ rect: wholeScreen ? undefined : selection ?? undefined, prompt: buildCirclePrompt(action, typed) });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.pip.circle.cancel();
      // Enter with nothing circled sends the whole screen
      else if (e.key === 'Enter' && !selection) submit(null, true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const paint = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pts = points.current;
    if (pts.length < 2) return;
    // prxptn: a clean white stroke with a soft halo (no colour)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drawing.current = true;
    points.current = [{ x: e.clientX, y: e.clientY }];
    setSelection(null);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    points.current.push({ x: e.clientX, y: e.clientY });
    paint();
  };

  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const rect = boundingRect(points.current);
    if (rect.width < MIN_SELECTION_PX || rect.height < MIN_SELECTION_PX) {
      points.current = [];
      paint();
      return;
    }
    setSelection(rect);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }, [shot]);

  // Panel sits under the selection, or above it near the bottom of the screen
  const panelTop = selection
    ? selection.y + selection.height + 140 < window.innerHeight
      ? selection.y + selection.height + 12
      : Math.max(12, selection.y - 140)
    : 0;
  const panelLeft = selection ? Math.min(Math.max(12, selection.x), window.innerWidth - 492) : 0;

  return (
    <div className="fixed inset-0 select-none cursor-crosshair overflow-hidden text-white">
      {shot && <img src={shot} alt="" className="absolute inset-0 w-full h-full pointer-events-none" draggable={false} />}

      {/* Dim everything except the selection */}
      <div
        className="absolute inset-0 pointer-events-none transition-[clip-path] duration-200"
        style={{
          background: 'rgba(0,0,0,0.45)',
          clipPath: selection
            ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${selection.x}px ${selection.y}px, ${selection.x + selection.width}px ${selection.y}px, ${selection.x + selection.width}px ${selection.y + selection.height}px, ${selection.x}px ${selection.y + selection.height}px, ${selection.x}px ${selection.y}px)`
            : undefined,
        }}
      />

      {/* Breathing white edge glow (the Pixel overlay, in prxptn monochrome) */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.35, 0.7, 0.35] }}
        transition={{ duration: 2.4, repeat: Infinity }}
        style={{ boxShadow: 'inset 0 0 70px 4px rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.35)' }}
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      <AnimatePresence>
        {!selection && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 border border-white/15 bg-black/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.26em] text-white/60 backdrop-blur-xl"
          >
            Circle anything <span className="text-white/25">·</span> <span className="text-white">enter</span> whole screen{' '}
            <span className="text-white/25">·</span> <span className="text-white">esc</span> cancel
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selection && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute w-[480px] cursor-default border border-white/15 bg-black/80 p-3 shadow-[0_12px_50px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
            style={{ top: panelTop, left: panelLeft }}
            onPointerDown={e => e.stopPropagation()}
          >
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.28em] text-white/40">Ask Ally about this</p>
            <form
              className="flex items-center gap-2 mb-2"
              onSubmit={e => {
                e.preventDefault();
                submit(null);
              }}
            >
              <input
                ref={inputRef}
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder="Ask about this…"
                className="flex-1 border border-white/15 bg-transparent px-3 py-2 text-[13px] font-light outline-hidden placeholder:text-white/25 focus:border-white/40"
              />
              <button
                type="submit"
                disabled={sending}
                className="bg-white p-2 text-black transition-opacity hover:opacity-85 disabled:opacity-50"
                title="Ask (Enter)"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {CIRCLE_ACTIONS.map(action => (
                <button
                  key={action.id}
                  disabled={sending}
                  onClick={() => submit(action)}
                  className="border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/60 transition-colors hover:border-white/40 hover:text-white disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
