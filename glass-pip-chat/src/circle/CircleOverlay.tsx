import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { CIRCLE_ACTIONS, CircleAction, buildCirclePrompt } from './actions';

interface Point { x: number; y: number }
interface Rect { x: number; y: number; width: number; height: number }

const MIN_SELECTION_PX = 16;
const SELECTION_PADDING = 10;
const GRADIENT = ['#4285F4', '#9B72CB', '#D96570', '#F2A60C'];

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
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    GRADIENT.forEach((c, i) => gradient.addColorStop(i / (GRADIENT.length - 1), c));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = gradient;
    ctx.shadowColor = 'rgba(155, 114, 203, 0.9)';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 6;
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

      {/* Shimmering edge glow, like the Pixel overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.55, 0.9, 0.55] }}
        transition={{ duration: 2.4, repeat: Infinity }}
        style={{ boxShadow: `inset 0 0 60px 6px ${GRADIENT[1]}88, inset 0 0 18px 2px ${GRADIENT[0]}aa` }}
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
            className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm bg-black/60 backdrop-blur-xl border border-white/20 pointer-events-none"
          >
            ✨ Circle anything to ask Ally · <b>Enter</b> for the whole screen · <b>Esc</b> to cancel
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
            className="absolute w-[480px] p-3 rounded-2xl bg-black/70 backdrop-blur-2xl border border-white/20 shadow-[0_12px_50px_rgba(0,0,0,0.6)] cursor-default"
            style={{ top: panelTop, left: panelLeft }}
            onPointerDown={e => e.stopPropagation()}
          >
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
                className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-sm outline-none focus:border-purple-400/60"
              />
              <button
                type="submit"
                disabled={sending}
                className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 disabled:opacity-50"
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
                  className="px-2.5 py-1 text-xs rounded-full bg-white/10 hover:bg-white/20 border border-white/15 transition-colors disabled:opacity-50"
                >
                  {action.emoji} {action.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
