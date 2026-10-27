package dev.ally.device

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.view.View
import android.view.animation.PathInterpolator

/** Decorative flight only: transport receipts, never this animation, determine delivery. */
internal class HandoffSendAnimationView(context:Context,private val accepted:Boolean):View(context) {
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    private var flight=0f
    private val animator=ValueAnimator.ofFloat(0f,1f).apply {
        duration=if(accepted)280L else 360L
        interpolator=PathInterpolator(.2f,0f,.2f,1f)
        repeatCount=0
        addUpdateListener { flight=it.animatedValue as Float;invalidate() }
    }
    init { contentDescription=if(accepted)"Added to your conversation" else "Sending to your selected chat";importantForAccessibility=IMPORTANT_FOR_ACCESSIBILITY_YES }
    override fun onAttachedToWindow(){super.onAttachedToWindow();if(ValueAnimator.areAnimatorsEnabled())animator.start()else{flight=1f;invalidate()}}
    override fun onDetachedFromWindow(){animator.cancel();super.onDetachedFromWindow()}
    override fun onDraw(c:Canvas){
        val d=resources.displayMetrics.density;c.save();c.scale(d,d);val w=width/d;val h=height/d
        paint.style=Paint.Style.FILL;paint.color=Color.rgb(25,28,31);c.drawRoundRect(0f,0f,w,h,24f,24f,paint)
        val y=46f-flight*12f
        paint.style=Paint.Style.STROKE;paint.strokeWidth=1.8f
        paint.color=Color.rgb(174,210,204)
        // A rigid silhouette and short lift: no deformation, orbit or overshoot.
        paint.alpha=if(accepted)((1f-flight)*255).toInt()else 255
        c.drawRoundRect(w/2-10f,y-19,w/2+10f,y+19,5f,5f,paint)
        c.drawLine(w/2-3f,y+13,w/2+3f,y+13,paint)
        if(accepted){
            paint.alpha=(flight*255).toInt();paint.strokeWidth=2.5f
            c.drawLine(w/2-7f,43f,w/2-1f,49f,paint);c.drawLine(w/2-1f,49f,w/2+10f,36f,paint)
        }
        paint.alpha=255;paint.color=Color.rgb(226,237,234)
        paint.style=Paint.Style.FILL;paint.textAlign=Paint.Align.CENTER;paint.textSize=14f;paint.typeface=Typeface.create("sans-serif-medium",Typeface.NORMAL)
        c.drawText(if(accepted)"Added to your conversation" else "Sending to your selected chat…",w/2,h-17f,paint);c.restore()
    }
}
