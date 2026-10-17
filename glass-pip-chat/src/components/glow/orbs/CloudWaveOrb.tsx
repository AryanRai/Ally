
import * as React from "react"

export type CloudWaveOrbColors = {
  main: [number, number, number]
  low:  [number, number, number]
  mid:  [number, number, number]
  high: [number, number, number]
}

export const CLOUD_WAVE_ORB_DEFAULT_COLORS: CloudWaveOrbColors = {
  main: [0.7, 0.85, 1.0],
  low:  [0.4, 0.6, 0.9],
  mid:  [0.5, 0.7, 1.0],
  high: [0.9, 0.95, 1.0],
}

/** WebGL port inspired by Reverse UI Cloud Wave Orb — layered FBM noise with drifting cloud ripples. */
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform float iTime;
uniform vec2 iResolution;
uniform float uSpeed;
uniform float uIntensity;
uniform float uAmplitude;
uniform vec3 uMain;
uniform vec3 uLow;
uniform vec3 uMid;
uniform vec3 uHigh;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.02 + vec2(17.0, 31.0);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  float drift = iTime * uSpeed * (0.35 + uAmplitude * 0.25);
  vec2 cloudUv = uv * 2.4 + vec2(drift * 0.18, drift * 0.12);
  vec2 waveUv = vec2(angle * 1.6 + drift * 0.4, r * 3.2 - drift * 0.55);

  float lowBand  = fbm(cloudUv * 0.85 + vec2(drift * 0.05, 0.0));
  float midBand  = fbm(waveUv * 1.15 + vec2(0.0, drift * 0.08));
  float highBand = fbm(cloudUv * 2.1 - waveUv * 0.7 + drift * 0.12);
  float ripple   = sin(r * 10.0 - drift * 2.4 + midBand * 4.0) * 0.5 + 0.5;

  vec3 color = uMain;
  color = mix(color, uLow,  smoothstep(0.15, 0.75, lowBand));
  color = mix(color, uMid,  smoothstep(0.25, 0.85, midBand) * 0.85);
  color = mix(color, uHigh, smoothstep(0.55, 1.0, highBand) * (0.35 + ripple * 0.45));

  float highlight = pow(max(0.0, 1.0 - length(uv - vec2(-0.18, -0.22)) * 2.8), 3.0);
  color += uHigh * highlight * (0.35 + uAmplitude * 0.25);

  float edgeGlow = smoothstep(0.52, 0.28, r);
  color *= edgeGlow * uIntensity * (0.85 + uAmplitude * 0.2);

  float alpha = smoothstep(0.56, 0.22, r) * (0.55 + midBand * 0.35 + uAmplitude * 0.15);
  fragColor = vec4(color * alpha, alpha);
}
`

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed")
  }
  return shader
}

const MIN_RENDER_PX = 160

export type CloudWaveOrbProps = {
  size:       number
  speed?:     number
  intensity?: number
  amplitude?: number
  colors?:    Partial<CloudWaveOrbColors>
  className?: string
}

export default function CloudWaveOrb({
  size,
  speed = 1.0,
  intensity = 1.15,
  amplitude = 0,
  colors,
  className,
}: CloudWaveOrbProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const rafRef = React.useRef(0)
  const timeRef = React.useRef(0)
  const lastFrameRef = React.useRef(0)

  const palette = React.useMemo(() => ({
    ...CLOUD_WAVE_ORB_DEFAULT_COLORS,
    ...colors,
  }), [colors])

  const renderSize = Math.max(Math.round(size * 4), MIN_RENDER_PX)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true })
    if (!gl) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(renderSize * dpr)
    canvas.height = Math.round(renderSize * dpr)

    const program = gl.createProgram()!
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "Program link failed")
    }
    gl.useProgram(program)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, "a_position")
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(program, "iTime")
    const uRes = gl.getUniformLocation(program, "iResolution")
    const uSpeed = gl.getUniformLocation(program, "uSpeed")
    const uIntensity = gl.getUniformLocation(program, "uIntensity")
    const uAmplitude = gl.getUniformLocation(program, "uAmplitude")
    const uMain = gl.getUniformLocation(program, "uMain")
    const uLow = gl.getUniformLocation(program, "uLow")
    const uMid = gl.getUniformLocation(program, "uMid")
    const uHigh = gl.getUniformLocation(program, "uHigh")

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    let reduced = motionQuery.matches

    const draw = (t: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = t
      const dt = Math.min((t - lastFrameRef.current) / 1000, 0.05)
      lastFrameRef.current = t

      if (!reduced) timeRef.current += dt * speed

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      gl.uniform1f(uTime, timeRef.current)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uSpeed, speed)
      gl.uniform1f(uIntensity, intensity)
      gl.uniform1f(uAmplitude, amplitude)
      gl.uniform3f(uMain, palette.main[0], palette.main[1], palette.main[2])
      gl.uniform3f(uLow, palette.low[0], palette.low[1], palette.low[2])
      gl.uniform3f(uMid, palette.mid[0], palette.mid[1], palette.mid[2])
      gl.uniform3f(uHigh, palette.high[0], palette.high[1], palette.high[2])

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      if (!reduced) rafRef.current = requestAnimationFrame(draw)
    }

    const onMotion = () => {
      reduced = motionQuery.matches
      cancelAnimationFrame(rafRef.current)
      if (reduced) draw(performance.now())
      else rafRef.current = requestAnimationFrame(draw)
    }
    motionQuery.addEventListener("change", onMotion)

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      motionQuery.removeEventListener("change", onMotion)
      gl.deleteProgram(program)
      gl.deleteBuffer(buf)
      timeRef.current = 0
      lastFrameRef.current = 0
    }
  }, [renderSize, speed, intensity, amplitude, palette])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="presentation"
      aria-hidden
      style={{
        width: size,
        height: size,
        display: "block",
        pointerEvents: "none",
      }}
    />
  )
}
