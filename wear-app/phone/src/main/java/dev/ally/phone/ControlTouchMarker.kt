package dev.ally.phone

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.os.PowerManager
import android.os.SystemClock
import android.view.*
import dev.ally.device.DeviceLink
import kotlin.math.hypot

/**
 * Shows where Ally is touching while it controls the phone: a sunset dot in a hairline ring
 * (Ally's cursor, in prxptn's line style). A tap ripples outward; a swipe glides the dot along its
 * path with a fading trail. Touch-through and hidden from accessibility, owned by the
 * AccessibilityService like [ControlEdgeGlow], and hidden while the agent takes a screenshot.
 */
internal class ControlTouchMarker(private val service: AllyControlService) {
    private val manager = service.getSystemService(WindowManager::class.java)
    private var view: MarkerView? = null
    private var captureHidden = false

    /** Called just before Android performs the gesture; [durationMs] is the gesture's own length. */
    fun show(points: List<Pair<Int, Int>>, durationMs: Long) {
        if (captureHidden || service.protectedSurface || points.isEmpty() || !DeviceLink.prefs(service).getBoolean("control.touchMarker", true)) return
        val target = view ?: attach() ?: return
        target.play(points.map { PointF(it.first.toFloat(), it.second.toFloat()) }, durationMs)
    }

    fun hideForCapture(hide: Boolean) { captureHidden = hide; if (hide) close() }
    fun close() { view?.let { runCatching { manager.removeView(it) } }; view = null }

    private fun attach(): MarkerView? {
        val next = MarkerView(service) { close() }
        val params = WindowManager.LayoutParams(-1, -1, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT).apply {
            gravity = Gravity.TOP or Gravity.START
            layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            setFitInsetsTypes(0)
        }
        return if (runCatching { manager.addView(next, params) }.isSuccess) next.also { view = it } else null
    }

    private class MarkerView(c: Context, private val finished: () -> Unit) : View(c) {
        private var path: List<PointF> = emptyList()
        private var started = 0L
        private var moveMs = 0L
        private var still = false
        private val dot = Paint(Paint.ANTI_ALIAS_FLAG)
        private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
        private val trail = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }

        init {
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            isClickable = false; isFocusable = false
            setLayerType(LAYER_TYPE_SOFTWARE, null) // the glow uses shadow layers
        }

        fun play(points: List<PointF>, durationMs: Long) {
            val look = PhoneLook.load(DeviceLink.prefs(context))
            still = look.reducedMotion || context.getSystemService(PowerManager::class.java).isPowerSaveMode || !ValueAnimator.areAnimatorsEnabled()
            path = points; moveMs = if (points.size > 1) durationMs.coerceIn(100, 2000) else 0
            started = SystemClock.uptimeMillis()
            invalidate()
        }

        /** Where the dot is along the path at [fraction] (0–1), by distance. */
        private fun along(fraction: Float): PointF {
            if (path.size < 2) return path.first()
            val lengths = path.zipWithNext { a, b -> hypot(b.x - a.x, b.y - a.y) }
            var remaining = lengths.sum() * fraction
            for ((i, length) in lengths.withIndex()) {
                if (remaining <= length || i == lengths.lastIndex) {
                    val t = if (length == 0f) 0f else (remaining / length).coerceIn(0f, 1f)
                    return PointF(path[i].x + (path[i + 1].x - path[i].x) * t, path[i].y + (path[i + 1].y - path[i].y) * t)
                }
                remaining -= length
            }
            return path.last()
        }

        override fun onDraw(canvas: Canvas) {
            if (path.isEmpty()) return
            val d = resources.displayMetrics.density
            val elapsed = SystemClock.uptimeMillis() - started
            val total = moveMs + if (still) STILL_MS else RIPPLE_MS
            if (elapsed > total) { path = emptyList(); post(finished); return }
            val moving = moveMs > 0 && elapsed < moveMs && !still
            val head = if (moving) along(elapsed / moveMs.toFloat()) else path.last()
            val fade = if (elapsed <= moveMs) 1f else (1f - (elapsed - moveMs) / (total - moveMs).toFloat()).coerceIn(0f, 1f)

            // Swipe: a thinning trail behind the dot.
            if (path.size > 1 && !still) {
                val steps = 18
                val reached = if (moving) elapsed / moveMs.toFloat() else 1f
                for (s in 1..steps) {
                    val a = along((reached * (s - 1) / steps)); val b = along((reached * s / steps))
                    trail.strokeWidth = (1.5f + 3f * s / steps) * d
                    trail.color = SUN_0; trail.alpha = (140 * fade * s / steps).toInt()
                    canvas.drawLine(a.x, a.y, b.x, b.y, trail)
                }
            }
            // Tap (and the end of a swipe): a hairline ring ripples out and fades.
            val ripple = if (still || moving) 0f else ((elapsed - moveMs) / RIPPLE_MS.toFloat()).coerceIn(0f, 1f)
            ring.strokeWidth = 1.2f * d
            ring.color = Color.WHITE; ring.alpha = (220 * (1f - ripple) * fade).toInt()
            ring.setShadowLayer(8 * d, 0f, 0f, SUN_1)
            canvas.drawCircle(head.x, head.y, (14 + 26 * ripple) * d, ring)
            // The dot: warm core with a sunset glow, like Ally's cursor.
            dot.color = SUN_2; dot.alpha = (255 * fade).toInt()
            dot.setShadowLayer(10 * d, 0f, 0f, SUN_0)
            canvas.drawCircle(head.x, head.y, 6 * d, dot)
            postInvalidateOnAnimation()
        }

        companion object {
            const val RIPPLE_MS = 650L
            const val STILL_MS = 700L
            val SUN_0 = Color.rgb(0xFF, 0x6B, 0x35)
            val SUN_1 = Color.rgb(0xF7, 0x25, 0x85)
            val SUN_2 = Color.rgb(0xFF, 0xB3, 0x47)
        }
    }
}
