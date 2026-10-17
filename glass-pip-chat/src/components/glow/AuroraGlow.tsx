import { useEffect, useRef } from 'react';
import { hexToUnitRgb, type GlowPalette } from './palette';
import { createQuadProgram, easeOutCubic, prefersReducedMotion } from './webgl';

/** Mary's aurora input glow (Orbit aurora-conf.ts; WebGL2 port of Reacticx Aurora). */
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uIntensity;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
uniform float uSpeed;
uniform vec2 uWaveDirection;
out vec4 fragColor;

float hash(float n) { return fract(sin(n) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i.x + hash(i.y)), hash(i.x + 1.0 + hash(i.y)), u.x),
    mix(hash(i.x + hash(i.y + 1.0)), hash(i.x + 1.0 + hash(i.y + 1.0)), u.x),
    u.y
  );
}

vec3 auroraLayer(vec2 uv, float layerSpeed, float layerWeight, vec3 color) {
  float t = iTime * layerSpeed * uSpeed;
  vec2 p = uv * 1.6 + t * uWaveDirection;
  float n = noise(p + noise(color.xy * 0.5 + p * 0.7 + t * 0.3));
  float aurora = smoothstep(-0.15, 0.55, n - uv.y * 0.45);
  return color * aurora * layerWeight * 1.6;
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = vec2(fragCoord.x, iResolution.y - fragCoord.y) / iResolution;
  uv.x *= iResolution.x / max(iResolution.y, 1.0);

  vec3 color = vec3(0.0);
  color += auroraLayer(uv, 0.04, 0.35, uColor1);
  color += auroraLayer(uv, 0.05, 0.35, uColor2);
  color += auroraLayer(uv, 0.06, 0.25, uColor3);
  color += auroraLayer(uv, 0.07, 0.25, uColor1 * 0.5 + uColor3 * 0.2);

  color += uSkyTop * (1.0 - smoothstep(0.4, 1.0, uv.y));
  color += uSkyBottom * (1.0 - smoothstep(0.5, 0.9, uv.y));

  float alpha = clamp(uIntensity, 0.0, 1.0);
  fragColor = vec4(color * alpha, alpha);
}
`;

const FADE_IN_MS = 500;
const FADE_OUT_MS = 520;
const SETTINGS = { speed: 0.22, intensity: 0.85, wave: [6, -6] as const, skyTop: '#020308', skyBottom: '#0D1B2A' };

interface AuroraGlowProps {
  active: boolean;
  colors: GlowPalette;
  className?: string;
}

/** Aurora that rises behind the composer while the agent is responding. */
export default function AuroraGlow({ active, colors, className }: AuroraGlowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fade = useRef({ from: 0, to: active ? 1 : 0, start: 0, value: 0 });

  useEffect(() => {
    fade.current = { from: fade.current.value, to: active ? 1 : 0, start: performance.now(), value: fade.current.value };
  }, [active]);

  const key = colors.join(',');

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const quad = createQuadProgram(canvas, FRAGMENT);
    if (!quad) return;
    const { gl, uniform } = quad;
    const [c1, c2, c3] = key.split(',').map(hexToUnitRgb);
    gl.uniform3f(uniform('uColor1'), ...c1);
    gl.uniform3f(uniform('uColor2'), ...c2);
    gl.uniform3f(uniform('uColor3'), ...c3);
    gl.uniform3f(uniform('uSkyTop'), ...hexToUnitRgb(SETTINGS.skyTop));
    gl.uniform3f(uniform('uSkyBottom'), ...hexToUnitRgb(SETTINGS.skyBottom));
    gl.uniform1f(uniform('uSpeed'), SETTINGS.speed);
    gl.uniform2f(uniform('uWaveDirection'), SETTINGS.wave[0], SETTINGS.wave[1]);

    const reduced = prefersReducedMotion();
    let time = 0;
    let frame = 0;

    const draw = (now: number) => {
      const f = fade.current;
      const t = Math.min(1, (now - f.start) / (f.to ? FADE_IN_MS : FADE_OUT_MS));
      f.value = f.from + (f.to - f.from) * easeOutCubic(t);

      const { width, height } = root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.max(2, Math.round(width * dpr));
      const ph = Math.max(2, Math.round(height * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      gl.viewport(0, 0, pw, ph);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (f.value > 0.01) {
        if (!reduced) time += 1 / 60;
        gl.uniform2f(uniform('iResolution'), pw, ph);
        gl.uniform1f(uniform('iTime'), time);
        gl.uniform1f(uniform('uIntensity'), f.value * SETTINGS.intensity);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      quad.dispose();
    };
  }, [key]);

  return (
    <div ref={rootRef} aria-hidden className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
}
