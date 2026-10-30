package dev.ally.phone

import android.app.KeyguardManager
import android.content.Context
import android.graphics.*
import android.os.PowerManager
import android.view.*
import dev.ally.device.DeviceLink

/** No capture, touch target, wake lock or additional permission. Owned by AccessibilityService. */
internal class ControlEdgeGlow(private val service: AllyControlService) {
    private val manager = service.getSystemService(WindowManager::class.java)
    private var view: EdgeView? = null
    private var captureHidden = false
    private var active = false
    private var moving = false
    fun update(state: ControlVisualState) {
        val now = System.currentTimeMillis()
        val visible = state.visible(now,DeviceLink.status.value=="Connected",service.getSystemService(KeyguardManager::class.java).isDeviceLocked,service.getSystemService(PowerManager::class.java).isInteractive)
        active=visible; moving=state.activityPulse(now)
        if(!visible || service.protectedSurface || captureHidden || !DeviceLink.prefs(service).getBoolean("control.edgeGlow",true)) { hide();return }
        if(view==null) {
            val next=EdgeView(service)
            val params=WindowManager.LayoutParams(-1,-1,WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT).apply {
                gravity=Gravity.TOP or Gravity.START; layoutInDisplayCutoutMode=WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS; setFitInsetsTypes(0)
            }
            if(runCatching{manager.addView(next,params)}.isSuccess)view=next
        }
        view?.moving=moving; view?.invalidate()
    }
    fun hideForCapture(hide: Boolean) { captureHidden=hide;if(hide)hide() else if(active) update(ControlBridge.visual.value) }
    fun close() { active=false;hide() }
    private fun hide() { view?.let{runCatching{manager.removeView(it)}};view=null }
    private class EdgeView(c: Context):View(c) {
        var moving=false
        private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
        init { importantForAccessibility=IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS;isClickable=false;isFocusable=false;setLayerType(LAYER_TYPE_SOFTWARE,null) }
        override fun onDraw(canvas:Canvas) {
            val look=PhoneLook.load(DeviceLink.prefs(context));val power=context.getSystemService(PowerManager::class.java)
            val still=look.reducedMotion || power.isPowerSaveMode || !ValueAnimatorEnabled()
            val intensity=if(moving) .9f else .28f
            val pulse=if(still || !moving)1f else (.85+.15*kotlin.math.sin(System.currentTimeMillis()/350.0)).toFloat()
            val d=resources.displayMetrics.density
            paint.style=Paint.Style.STROKE;paint.strokeWidth=2*d;paint.color=Color.rgb(0,180,216);paint.alpha=(255*intensity*pulse).toInt()
            paint.setShadowLayer(6*d,0f,0f,Color.CYAN)
            canvas.drawRoundRect(RectF(3*d,3*d,width-3*d,height-3*d),28*d,28*d,paint)
            if(moving && !still)postInvalidateDelayed(50)
        }
        private fun ValueAnimatorEnabled()=android.animation.ValueAnimator.areAnimatorsEnabled()
    }
}
