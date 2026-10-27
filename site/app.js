// Ally product page: Perception's fin field, Ally's energy orb, the scene rail, the trailing dot and the footer wordmark.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const finePointer = matchMedia('(hover: hover) and (pointer: fine)')

// Fin field, after prxptn.com: fins swirl around the cursor and warm to Ally's sunset there.
function field(canvas) {
  const ctx = canvas.getContext('2d')
  const RADIUS = 320, SPACING = 26
  let t = 0, tx = -9999, ty = -9999, px = -9999, py = -9999, target = 0, influence = 0, frame = 0
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (reducedMotion.matches) draw()
  }
  const draw = () => {
    const w = innerWidth, h = innerHeight
    ctx.clearRect(0, 0, w, h)
    px += (tx - px) * 0.06
    py += (ty - py) * 0.06
    influence += (target - influence) * 0.03
    const r2 = RADIUS * RADIUS
    for (let x = 0; x <= w + SPACING; x += SPACING) {
      for (let y = 0; y <= h + SPACING; y += SPACING) {
        const nx = x / w, ny = y / h
        const angle = Math.sin(nx * 3.5 + t * 0.5) * Math.cos(ny * 2.8 - t * 0.35) * Math.PI + Math.sin(nx * 1.8 - ny * 2.2 + t * 0.25) * Math.PI * 0.6
        const strength = (Math.sin(nx * 4.5 + ny * 3.2 + t * 0.45) + 1) / 2
        let len = 6 + strength * 13, alpha = 0.12 + strength * 0.32, warm = 0
        let dx = Math.cos(angle), dy = Math.sin(angle)
        if (influence > 0.001) {
          const ox = x - px, oy = y - py, d2 = ox * ox + oy * oy
          if (d2 < r2) {
            const d = Math.sqrt(d2) || 1
            const f = 1 - d / RADIUS
            const k = f * f * influence
            const bx = dx * (1 - k) + (-oy / d) * k, by = dy * (1 - k) + (ox / d) * k
            const m = Math.hypot(bx, by) || 1
            dx = bx / m; dy = by / m
            len += k * 9; alpha += k * 0.45; warm = k
          }
        }
        const r = 255, g = Math.round(255 - warm * 148), b = Math.round(255 - warm * 202)
        ctx.beginPath()
        ctx.moveTo(x - (dx * len) / 2, y - (dy * len) / 2)
        ctx.lineTo(x + (dx * len) / 2, y + (dy * len) / 2)
        ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(alpha, 0.95).toFixed(2)})`
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
    t += 0.006
    frame = reducedMotion.matches || document.hidden ? 0 : requestAnimationFrame(draw)
  }
  addEventListener('resize', resize)
  addEventListener('pointermove', e => {
    tx = e.clientX; ty = e.clientY; target = 1
    if (px < -1000) { px = tx; py = ty }
  })
  document.addEventListener('pointerleave', () => { target = 0 })
  document.addEventListener('visibilitychange', () => { if (!frame && !document.hidden) frame = requestAnimationFrame(draw) })
  resize()
  draw()
}

// Ally desktop's energy orb shader, in the sunset palette.
const ORB_SHADER = `#version 300 es
precision highp float;
uniform float iTime;
uniform vec2 iResolution;
uniform vec3 uColor0, uColor1, uColor2;
out vec4 fragColor;
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float r = length(uv);
  float wave = mix(0.55, 1.0, sin(r * 2.0 - iTime * 0.8) * 0.5 + 0.5);
  float glow = smoothstep(0.5, 0.2, r) * wave * 1.15;
  float t1 = sin(iTime * 0.8 + r * 6.0) * 0.5 + 0.5;
  float t2 = sin(iTime * 0.5 + r * 3.0) * 0.5 + 0.5;
  vec3 color = mix(mix(uColor0, uColor1, t1), uColor2, t2) * glow;
  color += 0.26 * smoothstep(0.55, 0.3, r) * mix(uColor0, uColor2, 0.5);
  float alpha = smoothstep(0.6, 0.2, r) * glow;
  fragColor = vec4(color * alpha, alpha);
}`

function energyOrb(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true })
  if (!gl) return
  const shader = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('orb shader')
    return s
  }
  let program
  try {
    program = gl.createProgram()
    gl.attachShader(program, shader(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p;\nvoid main(){gl_Position=vec4(p,0.,1.);}'))
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, ORB_SHADER))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
  } catch { return }
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const pos = gl.getAttribLocation(program, 'p')
  gl.enableVertexAttribArray(pos)
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  ;['#FF6B35', '#F72585', '#FFB347'].forEach((hex, i) => {
    gl.uniform3f(gl.getUniformLocation(program, `uColor${i}`), ...[1, 3, 5].map(s => parseInt(hex.slice(s, s + 2), 16) / 255))
  })
  const uTime = gl.getUniformLocation(program, 'iTime'), uRes = gl.getUniformLocation(program, 'iResolution')
  let time = 1.5, last = 0, frame = 0, visible = true
  const render = now => {
    frame = 0
    if (!visible || document.hidden) { last = 0; return }
    if (!reducedMotion.matches && last) time += Math.min((now - last) / 1000, 0.05) * 0.8
    last = now
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform1f(uTime, time)
    gl.uniform2f(uRes, canvas.width, canvas.height)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    if (!reducedMotion.matches) frame = requestAnimationFrame(render)
  }
  const resume = () => { if (!frame) frame = requestAnimationFrame(render) }
  new ResizeObserver(() => {
    const px = Math.min(768, Math.max(160, Math.round(canvas.clientWidth * Math.min(devicePixelRatio || 1, 2))))
    canvas.width = px; canvas.height = px
    resume()
  }).observe(canvas)
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) resume() }).observe(canvas)
  document.addEventListener('visibilitychange', resume)
  canvas.classList.add('is-gl')
}

// The rail follows whichever story section is in view; on one column it cycles on its own.
const SCENES = [
  ['The pill, collapsed', 'A glass pill that floats over every app. One shortcut opens it; drag it to the top edge and it docks as a notch.', 'Your agents stay one keystroke away without a terminal or browser tab taking over the screen.'],
  ['A reply, in place', 'Codex answering about a failing test, with the files it read and actions to take next, right over your editor.', 'The agent does the work with its own tools. Ally only gives it a better surface.'],
  ['Accounts, switching', 'One account hits its usage limit mid-task. The same chat continues on the next signed-in account.', 'Long jobs keep going instead of stopping at a limit or forcing a handoff to a new thread.'],
  ['Phone control', 'An agent stepping through Settings on an Android phone during a session you approved once.', 'Works over any network with no ADB, and the things that matter most are always left to you.'],
  ['Drawing reader', 'An explanation drawn as a labelled thin-lens diagram on the board beside the chat.', 'Some answers are pictures. The board keeps them interactive and saved with the conversation.'],
]

function rail() {
  const views = [...document.querySelectorAll('[data-scene-view]')]
  const dots = [...document.querySelectorAll('.scene-dots li')]
  const title = document.querySelector('[data-rail-title]')
  const seeing = document.querySelector('[data-rail-seeing]')
  const why = document.querySelector('[data-rail-why]')
  let current = 0
  const show = i => {
    if (i === current) return
    current = i
    views.forEach((v, n) => v.classList.toggle('is-on', n === i))
    dots.forEach((d, n) => d.classList.toggle('is-on', n === i))
    ;[title.textContent, seeing.textContent, why.textContent] = SCENES[i]
  }
  const wide = matchMedia('(min-width: 1024px)')
  const sections = [...document.querySelectorAll('[data-scene]')]
  // The section crossing a line just above the middle of the screen picks the scene.
  const pick = () => {
    if (!wide.matches) return
    const line = innerHeight * 0.45
    let best = sections[0], gap = Infinity
    for (const s of sections) {
      const r = s.getBoundingClientRect()
      const d = r.top > line ? r.top - line : r.bottom < line ? line - r.bottom : 0
      if (d < gap) { gap = d; best = s }
    }
    show(Number(best.dataset.scene))
  }
  addEventListener('scroll', pick, { passive: true })
  setInterval(() => { if (!wide.matches && !reducedMotion.matches && !document.hidden) show((current + 1) % SCENES.length) }, 4200)
}

function cursorDot() {
  if (!finePointer.matches || reducedMotion.matches) return
  const dot = document.createElement('div')
  dot.className = 'cursor-dot'
  dot.style.opacity = '0'
  document.body.append(dot)
  let x = -100, y = -100, cx = -100, cy = -100, started = false
  addEventListener('pointermove', e => {
    x = e.clientX; y = e.clientY
    if (!started) { started = true; cx = x; cy = y; dot.style.opacity = '1'; document.documentElement.classList.add('has-dot') }
    dot.classList.toggle('is-link', !!e.target.closest('a, button'))
  })
  document.addEventListener('pointerleave', () => { dot.style.opacity = '0' })
  document.addEventListener('pointerenter', () => { if (started) dot.style.opacity = '1' })
  const tick = () => {
    cx += (x - cx) * 0.25; cy += (y - cy) * 0.25
    dot.style.transform = `translate(${cx}px, ${cy}px)`
    requestAnimationFrame(tick)
  }
  tick()
}

// Footer wordmark retypes itself on hover, like PRXPTN's.
function wordmark(el) {
  const word = el.dataset.type
  let timer
  el.addEventListener('mouseenter', () => {
    clearInterval(timer)
    let i = 0
    el.innerHTML = '<span class="caret">|</span>'
    timer = setInterval(() => {
      i++
      el.innerHTML = word.slice(0, i) + '<span class="caret">|</span>'
      if (i >= word.length) { clearInterval(timer); setTimeout(() => { el.textContent = word }, 900) }
    }, 90)
  })
}

field(document.querySelector('.field'))
energyOrb(document.querySelector('.energy'))
rail()
cursorDot()
wordmark(document.querySelector('.giant'))
