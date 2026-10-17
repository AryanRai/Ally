import { useEffect, useRef } from 'react';

export type FlowFieldState = 'idle' | 'thinking' | 'streaming' | 'tool_executing' | 'speaking';

/** How busy the field looks: animation speed and stroke brightness per agent state. */
const MOTION: Record<FlowFieldState, { speed: number; glow: number }> = {
  idle: { speed: 0.003, glow: 0 },
  thinking: { speed: 0.012, glow: 0.12 },
  streaming: { speed: 0.008, glow: 0.07 },
  tool_executing: { speed: 0.016, glow: 0.16 },
  speaking: { speed: 0.009, glow: 0.08 },
};

const SPACING = 22;
const EASE = 0.04; // how quickly speed/brightness follow a state change

/**
 * prxptn.com's background: a drifting field of short white strokes, kept faint
 * behind the chat. It speeds up and brightens while the agent is working.
 */
export default function FlowField({ state }: { state: FlowFieldState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef(MOTION[state]);
  target.current = MOTION[state];

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let frame = 0;
    let t = 0;
    let speed = target.current.speed;
    let glow = target.current.glow;

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * devicePixelRatio);
      canvas.height = Math.round(height * devicePixelRatio);
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = () => {
      const w = canvas.width / devicePixelRatio;
      const h = canvas.height / devicePixelRatio;
      speed += (target.current.speed - speed) * EASE;
      glow += (target.current.glow - glow) * EASE;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (let x = 0; x <= w + SPACING; x += SPACING) {
        for (let y = 0; y <= h + SPACING; y += SPACING) {
          const nx = x / w;
          const ny = y / h;
          const angle =
            Math.sin(nx * 3.5 + t * 0.5) * Math.cos(ny * 2.8 - t * 0.35) * Math.PI +
            Math.sin(nx * 1.8 - ny * 2.2 + t * 0.25) * Math.PI * 0.6;
          const strength = (Math.sin(nx * 4.5 + ny * 3.2 + t * 0.45) + 1) / 2;
          const len = 4 + strength * 9;
          const dx = (Math.cos(angle) * len) / 2;
          const dy = (Math.sin(angle) * len) / 2;
          ctx.strokeStyle = `rgba(255,255,255,${(0.04 + strength * 0.1 + glow * strength).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(x - dx, y - dy);
          ctx.lineTo(x + dx, y + dy);
          ctx.stroke();
        }
      }
      t += speed;
      frame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden />;
}
