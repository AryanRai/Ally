package dev.ally.phone

import android.accessibilityservice.AccessibilityService
import android.animation.ValueAnimator
import android.graphics.*
import android.view.*
import kotlinx.coroutines.delay
import dev.ally.device.HandoffSwipe

/** Finite progress driven by real hold state, never an autonomous success animation.
 * Accessibility-owned overlay needs no draw-over-apps permission. Only its finite ready
 * card accepts the deliberate review swipe; the rest of the screen remains available. */
internal class HoldHandoffOverlay(private val service: AccessibilityService) {
    private val manager = service.getSystemService(WindowManager::class.java)
    private var view: Card? = null
    private var generation = 0
    private var retracting = false
    private var confirm: (() -> Unit)? = null
    /** Draw only after screenshot acquisition; it can never be baked into captured bytes. */
    suspend fun depart(stillAllowed: () -> Boolean) {
        show(1f)
        val card = view ?: return
        if (!ValueAnimator.areAnimatorsEnabled()) { remove(); return }
        val start = android.os.SystemClock.elapsedRealtime()
        while (android.os.SystemClock.elapsedRealtime()-start < 450) {
            if (!stillAllowed()) { cancel(); throw kotlinx.coroutines.CancellationException("Hold withdrawn") }
            card.departure=((android.os.SystemClock.elapsedRealtime()-start)/450f).coerceIn(0f,1f)
            card.invalidate();delay(16)
        }
        remove()
    }
    fun show(progress: Float, onConfirm: (() -> Unit)? = null) {
        confirm=onConfirm
        generation++
        val wasRetracting = retracting
        retracting = false
        var card = view
        if (card == null) {
            card = Card()
            val width = minOf(dp(390), service.resources.displayMetrics.widthPixels - dp(32))
            val params = WindowManager.LayoutParams(width, dp(112), WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_SECURE or (if(onConfirm==null)WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE else 0),
                PixelFormat.TRANSLUCENT).apply { gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL; y = dp(28); setFitInsetsTypes(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()) }
            manager.addView(card, params); view = card
            if (ValueAnimator.areAnimatorsEnabled()) { card.translationY = dp(100).toFloat(); card.alpha = 0f; card.animate().translationY(0f).alpha(1f).setDuration(240).start() }
        } else if (wasRetracting) { card.animate().cancel(); card.alpha = 1f; card.translationY = 0f }
        run {
            val params=card.layoutParams as WindowManager.LayoutParams
            val flags=if(confirm==null)params.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE else params.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
            if(flags!=params.flags){params.flags=flags;manager.updateViewLayout(card,params)}
        }
        card.fraction = progress; card.invalidate()
    }
    fun cancel() {
        confirm=null
        val card = view ?: return
        if (retracting) return
        retracting = true
        val serial = ++generation
        card.animate().cancel(); card.fraction = 0f; card.invalidate()
        if (ValueAnimator.areAnimatorsEnabled()) card.animate().alpha(0f).translationY(dp(100).toFloat()).setDuration(170).withEndAction { if (serial == generation) remove() }.start()
        else remove()
    }
    fun remove() { confirm=null;generation++; retracting = false; view?.let { it.animate().cancel(); runCatching { manager.removeViewImmediate(it) } }; view = null }
    private fun dp(value: Int) = (value * service.resources.displayMetrics.density).toInt()
    private inner class Card : View(service) {
        var fraction = 0f
        var departure = 0f
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        private val swipe=HandoffSwipe()
        override fun onTouchEvent(event:MotionEvent):Boolean {
            if(confirm==null){swipe.cancel();return false}
            if(event.pointerCount!=1){swipe.cancel();return true}
            val distance=48f*resources.displayMetrics.density
            when(event.actionMasked){
                MotionEvent.ACTION_DOWN->swipe.begin("local-review",event.rawX,event.rawY,true)
                MotionEvent.ACTION_MOVE->swipe.progress(event.rawX,event.rawY,distance)
                MotionEvent.ACTION_UP->{if(swipe.release("local-review",event.rawX,event.rawY,distance)){val action=confirm;confirm=null;action?.invoke()}}
                MotionEvent.ACTION_CANCEL,MotionEvent.ACTION_POINTER_DOWN->swipe.cancel()
            }
            return true
        }
        init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }
        override fun onDraw(canvas: Canvas) {
            val density = resources.displayMetrics.density
            canvas.save(); canvas.scale(density, density)
            val w = width / density
            p.style = Paint.Style.FILL; p.color = Color.rgb(19, 35, 34)
            canvas.drawRoundRect(0f, 0f, w, 112f, 32f, 32f, p)
            val lift = departure*40f
            val orbit=29f+fraction*4f+departure*16f
            p.style = Paint.Style.STROKE; p.strokeWidth = 2f; p.strokeCap = Paint.Cap.ROUND
            for(i in 0..2) {
                p.color=Color.argb(((1f-departure)*(.22f-i*.045f)*255).toInt().coerceIn(0,255),126,235,207)
                canvas.drawCircle(49f+departure*28f,56f-lift,orbit+i*6f,p)
            }
            p.strokeWidth = 4f;p.color = Color.rgb(49, 76, 69)
            canvas.drawCircle(49f+departure*28f, 56f-lift, orbit, p)
            p.color = Color.rgb(126, 235, 207)
            p.alpha=((1f-departure)*255).toInt()
            canvas.drawArc(49f+departure*28f-orbit,56f-lift-orbit,49f+departure*28f+orbit,56f-lift+orbit,-90f,fraction*360f,false,p)
            p.strokeWidth=2.5f;canvas.drawRoundRect(40f+departure*28f,39f-lift,58f+departure*28f,72f-lift,5f,5f,p)
            p.alpha=255
            p.style = Paint.Style.FILL; p.color = Color.rgb(231, 255, 248); p.textSize = 17f; p.typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            canvas.drawText(if (departure>0f) "Opening your handoff" else if (confirm!=null) "Swipe up to review" else if (fraction >= 1f) "Preparing screen review" else "Hold close to your PC", 95f, 48f, p)
            p.color = Color.rgb(173, 203, 193); p.textSize = 12f; p.typeface = Typeface.create("sans-serif", Typeface.NORMAL)
            canvas.drawText(if(confirm!=null)"Local review first · choose Send later" else "Move away to cancel", 95f, 71f, p)
            canvas.restore()
        }
    }
}
