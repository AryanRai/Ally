package dev.ally.device
import android.content.Context
import android.graphics.*
import android.view.MotionEvent
import android.view.View

internal class HandoffSwipeView(context:Context,private val chatId:String,private val title:String,enabled:Boolean,private val send:()->Unit):View(context){
 private val gesture=HandoffSwipe();private val p=Paint(Paint.ANTI_ALIAS_FLAG);private var progress=0f;private var ready=false
 init{isEnabled=enabled;contentDescription="Swipe up to Send to $title. The Send attachment button is also available."}
 override fun onTouchEvent(e:MotionEvent):Boolean{
  if(!isEnabled)return false
  val distance=48*resources.displayMetrics.density
  when(e.actionMasked){
   MotionEvent.ACTION_DOWN->{ready=false;progress=0f;gesture.begin(chatId,e.rawX,e.rawY,isEnabled);parent.requestDisallowInterceptTouchEvent(true)}
   MotionEvent.ACTION_MOVE->{progress=gesture.progress(e.rawX,e.rawY,distance);if(progress>=1f&&!ready){ready=true;performHapticFeedback(android.view.HapticFeedbackConstants.CONTEXT_CLICK)};invalidate()}
   MotionEvent.ACTION_UP->{val accepted=gesture.release(chatId,e.rawX,e.rawY,distance);progress=0f;ready=false;parent.requestDisallowInterceptTouchEvent(false);invalidate();if(accepted){isEnabled=false;send()};performClick()}
   MotionEvent.ACTION_CANCEL,MotionEvent.ACTION_POINTER_DOWN->{gesture.cancel();progress=0f;ready=false;invalidate();parent.requestDisallowInterceptTouchEvent(false)}
  };return true
 }
 override fun performClick():Boolean{super.performClick();return true}
 override fun onDraw(c:Canvas){
  val d=resources.displayMetrics.density;c.save();c.scale(d,d);val w=width/d;val h=height/d
  p.style=Paint.Style.FILL;p.color=Color.rgb(25,28,31);c.drawRoundRect(0f,0f,w,h,26f,26f,p)
  p.style=Paint.Style.STROKE;p.strokeWidth=1.5f;p.color=Color.rgb(174,210,204)
  val y=38f-progress*12f;c.drawRoundRect(w/2-10f,y-17f,w/2+10f,y+17f,5f,5f,p)
  c.drawLine(w/2-3f,y+12f,w/2+3f,y+12f,p)
  p.strokeWidth=2f;c.drawLine(w/2+26f,y+6,w/2+26f,y-6,p);c.drawLine(w/2+26f,y-6,w/2+22f,y-2,p);c.drawLine(w/2+26f,y-6,w/2+30f,y-2,p)
  p.style=Paint.Style.FILL;p.color=if(isEnabled)Color.rgb(226,255,246)else Color.GRAY;p.textAlign=Paint.Align.CENTER;p.typeface=Typeface.create("sans-serif-medium",Typeface.NORMAL);p.textSize=15f
  c.drawText(if(progress>=1f)"Release to Send" else "Swipe up to Send",w/2,h-38f,p);p.textSize=11f;p.typeface=Typeface.DEFAULT
  c.drawText(android.text.TextUtils.ellipsize(title,android.text.TextPaint(p),w-30,android.text.TextUtils.TruncateAt.END).toString(),w/2,h-17f,p);c.restore()
 }
}
