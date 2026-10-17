import { useEffect, useRef } from 'react';
import { boostPalette, hexToUnitRgb, type GlowPalette } from './palette';
import { createQuadProgram, prefersReducedMotion } from './webgl';

/** Mary's energy-orb shader (Orbit live-mode orb; WebGL2 port of Reacticx). */
const FRAGMENT = `#version 300 es
precision highp float;
uniform float iTime;
uniform vec2 iResolution;
uniform float uSpeed;
uniform float uIntensity;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uGlowRadius;
uniform float uFloor;
out vec4 fragColor;

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float r = length(uv);

  // uFloor (Ally addition) keeps the orb from fully blinking out between pulses
  float wave = mix(uFloor, 1.0, sin(r * 2.0 - iTime * uSpeed) * 0.5 + 0.5);
  float glow = smoothstep(uGlowRadius, 0.2, r) * wave * uIntensity;

  float t1 = sin(iTime * 0.8 + r * 6.0) * 0.5 + 0.5;
  float t2 = sin(iTime * 0.5 + r * 3.0) * 0.5 + 0.5;

  vec3 color = mix(mix(uColor0, uColor1, t1), uColor2, t2) * glow;
  color += 0.26 * smoothstep(0.55, 0.3, r) * mix(uColor0, uColor2, 0.5);

  float alpha = smoothstep(0.6, 0.2, r) * glow;
  fragColor = vec4(color * alpha, alpha);
}
`;

/** Small canvases lose the wave detail, so render at least this many px. */
const MIN_RENDER_PX = 160;
const EASE = 0.06;

export type OrbMood = 'idle' | 'busy' | 'listening';

const MOOD: Record<OrbMood, { speed: number; intensity: number; glow: number; floor: number }> = {
  // Idle stays clearly visible (the wave dips to zero, so it needs headroom)
  idle: { speed: 0.8, intensity: 2.0, glow: 0.5, floor: 0.55 },
  busy: { speed: 1.6, intensity: 2.2, glow: 0.47, floor: 0.2 },
  listening: { speed: 1.1, intensity: 2.4, glow: 0.5, floor: 0.3 },
};

interface EnergyOrbProps {
  size: number;
  colors: GlowPalette;
  mood?: OrbMood;
  /** 0–1 voice level; swells the orb while you talk */
  amplitude?: number;
  className?: string;
}

/** The glowing orb from Orbit's Mary input dock; calmer when idle, livelier while the agent works. */
export default function EnergyOrb({ size, colors, mood = 'idle', amplitude = 0, className }: EnergyOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const target = useRef(MOOD[mood]);
  const amp = useRef(amplitude);
  target.current = MOOD[mood];
  amp.current = amplitude;

  const active = mood !== 'idle';
  const key = boostPalette(colors, active).join(',');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderSize = Math.max(Math.round(size * 4), MIN_RENDER_PX);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(renderSize * dpr);
    canvas.height = Math.round(renderSize * dpr);

    const quad = createQuadProgram(canvas, FRAGMENT);
    if (!quad) return;
    const { gl, uniform } = quad;
    const [c0, c1, c2] = key.split(',').map(hexToUnitRgb);
    gl.uniform3f(uniform('uColor0'), ...c0);
    gl.uniform3f(uniform('uColor1'), ...c1);
    gl.uniform3f(uniform('uColor2'), ...c2);

    const reduced = prefersReducedMotion();
    const live = { ...target.current };
    let time = 0;
    let last = 0;
    let frame = 0;

    const draw = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      live.speed += (target.current.speed - live.speed) * EASE;
      live.intensity += (target.current.intensity - live.intensity) * EASE;
      live.glow += (target.current.glow - live.glow) * EASE;
      live.floor += (target.current.floor - live.floor) * EASE;
      if (!reduced) time += dt * live.speed;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uniform('iTime'), time);
      gl.uniform2f(uniform('iResolution'), canvas.width, canvas.height);
      gl.uniform1f(uniform('uSpeed'), live.speed);
      gl.uniform1f(uniform('uIntensity'), live.intensity * (1 + amp.current * 0.35));
      gl.uniform1f(uniform('uGlowRadius'), live.glow - amp.current * 0.06);
      gl.uniform1f(uniform('uFloor'), live.floor);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      quad.dispose();
    };
  }, [size, key]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden
      style={{ width: size, height: size, display: 'block', pointerEvents: 'none' }}
    />
  );
}
