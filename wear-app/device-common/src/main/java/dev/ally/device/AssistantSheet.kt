package dev.ally.device

import android.animation.LayoutTransition
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.SystemClock
import android.text.InputType
import android.view.*
import android.view.animation.PathInterpolator
import android.view.inputmethod.EditorInfo
import android.widget.*
import kotlin.math.*

/** Compact Orbit-style input dock, in Android's own assistant window. */
internal class AssistantSheet(context: Context, private val hold: AssistantHold, private val send: (String) -> Unit,
    private val mode: (String) -> Unit, private val open: () -> Unit, private val dismiss: () -> Unit) : FrameLayout(context) {
    private val round = resources.configuration.isScreenRound
    private val muted = Color.rgb(155,158,169)
    private val motion get() = ValueAnimator.areAnimatorsEnabled() && !DeviceLink.prefs(context).getBoolean(if(round) "look.reducedMotion" else "phone.look.reducedMotion", false)
    private val panel = LinearLayout(context)
    private val orb = FluidAssistantOrb(context)
    private val status = label("Hold the orb to talk", 11f, muted)
    private val chat = label("", 11f, muted)
    private val reply = label("", if(round) 12f else 15f)
    private val replyScroll = ScrollView(context)
    private val modes = LinearLayout(context)
    private val queue = label("Queue", 12f)
    private val steer = label("Steer now", 12f)
    private var interacted = false
    private var firstText: String? = null
    private var hasLiveReply = false
    private var expanding = false
    private fun dp(v: Int) = (v*resources.displayMetrics.density).roundToInt()
    private fun label(text: String, size: Float, color: Int = Color.rgb(242,242,245)) = TextView(context).apply {
        this.text = text; textSize = size; setTextColor(color); gravity = Gravity.CENTER_VERTICAL
        val font = resources.getIdentifier("geist_regular", "font", context.packageName)
        if(font != 0) typeface = resources.getFont(font)
    }
    private fun background(fill: Int, radius: Int, border: Int = 0) = GradientDrawable().apply {
        setColor(fill); cornerRadius = dp(radius).toFloat(); if(border != 0) setStroke(dp(1), border)
    }
    init {
        setBackgroundColor(Color.TRANSPARENT); setOnClickListener { dismiss() }; isFocusableInTouchMode = true
        panel.orientation = LinearLayout.VERTICAL; panel.setPadding(dp(16), dp(8), dp(12), dp(12))
        panel.background = background(Color.TRANSPARENT, 28, Color.argb(35,255,255,255))
        panel.isClickable = true
        if(motion) panel.layoutTransition = LayoutTransition().apply { setDuration(210); setAnimateParentHierarchy(false) }
        addView(panel, LayoutParams(-1,-2,Gravity.BOTTOM))
        val handle = FrameLayout(context).apply { contentDescription = "Swipe up to expand Ally"; setOnClickListener { open() } }
        handle.addView(View(context).apply { background = background(Color.argb(75,255,255,255),2) },LayoutParams(dp(25),dp(3),Gravity.CENTER))
        panel.addView(handle,LinearLayout.LayoutParams(-1,dp(17)))
        var origin = 0f
        handle.setOnTouchListener { v,e -> when(e.actionMasked) {
            MotionEvent.ACTION_DOWN -> { origin=e.rawY; panel.animate().cancel(); true }
            MotionEvent.ACTION_MOVE -> { panel.translationY = min(0f,(e.rawY-origin)*.7f); true }
            MotionEvent.ACTION_UP -> { if(origin-e.rawY>dp(36)) open() else { panel.animate().translationY(0f).setDuration(if(motion) 220 else 0).start(); v.performClick() }; true }
            MotionEvent.ACTION_CANCEL -> { panel.animate().translationY(0f).setDuration(180).start(); true }
            else -> true
        } }
        val header=LinearLayout(context).apply { gravity=Gravity.CENTER_VERTICAL }
        val brand=label("ALLY",if(round) 15f else 18f).apply {
            val font=resources.getIdentifier("tanker","font",context.packageName); if(font!=0) typeface=resources.getFont(font)
            letterSpacing=.035f
        }
        header.addView(brand,LinearLayout.LayoutParams(-2,dp(32)))
        chat.maxLines=1; chat.ellipsize=android.text.TextUtils.TruncateAt.END; chat.setPadding(dp(9),0,0,0)
        header.addView(chat,LinearLayout.LayoutParams(0,dp(32),1f))
        if(!round) header.addView(SheetIcon(context,false).apply { contentDescription="Expand into full Ally app"; setOnClickListener { open() } },LinearLayout.LayoutParams(dp(40),dp(40)))
        header.addView(SheetIcon(context,true).apply { contentDescription="Dismiss assistant"; setOnClickListener { dismiss() } },LinearLayout.LayoutParams(dp(36),dp(40)))
        panel.addView(header)
        reply.setPadding(dp(2),dp(8),dp(5),dp(10)); reply.setTextIsSelectable(true); reply.autoLinkMask=android.text.util.Linkify.WEB_URLS; reply.setLinkTextColor(Color.rgb(174,193,255))
        replyScroll.addView(reply); replyScroll.visibility=GONE
        panel.addView(replyScroll,LinearLayout.LayoutParams(-1,dp(if(round) 56 else 118)))
        val dock=LinearLayout(context).apply { gravity=Gravity.CENTER_VERTICAL; setPadding(dp(1),dp(1),dp(4),dp(1)); background=background(Color.argb(13,255,255,255),24,Color.argb(18,255,255,255)) }
        orb.contentDescription="Hold to talk, release to send"; orb.isClickable=true
        orb.setOnClickListener { interacted=true; if(hold.held) hold.up() else hold.down() }
        var x=0f; var y=0f
        orb.setOnTouchListener { _,e -> when(e.actionMasked) {
            MotionEvent.ACTION_DOWN -> { interacted=true; x=e.rawX; y=e.rawY; hold.down(); orb.pressed(true); true }
            MotionEvent.ACTION_MOVE -> { if(abs(e.rawX-x)>dp(64)||abs(e.rawY-y)>dp(64)) { hold.abort(); orb.pressed(false) }; true }
            MotionEvent.ACTION_UP -> { hold.up(); orb.pressed(false); true }
            MotionEvent.ACTION_CANCEL -> { hold.abort(); orb.pressed(false); true }
            else -> false
        } }
        dock.addView(orb,LinearLayout.LayoutParams(dp(if(round) 44 else 48),dp(if(round) 44 else 48)))
        if(round) {
            dock.addView(label("Hold to talk",12f,Color.rgb(195,197,206)).apply { setOnClickListener { open() } },LinearLayout.LayoutParams(0,dp(44),1f))
        } else {
            val input=EditText(context).apply {
                hint="Ask Ally…"; contentDescription="Message Ally"; textSize=16f; setTextColor(Color.WHITE); setHintTextColor(Color.rgb(146,149,161))
                background=null; setPadding(dp(3),0,dp(4),0); setSingleLine(); inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                imeOptions=EditorInfo.IME_ACTION_SEND
                val font=resources.getIdentifier("geist_regular","font",context.packageName); if(font!=0) typeface=resources.getFont(font)
            }
            fun submit() { if(input.text.isNotBlank()) { interacted=true; send(input.text.toString()) } }
            input.setOnEditorActionListener { _,action,_ -> if(action==EditorInfo.IME_ACTION_SEND) { submit(); true } else false }
            dock.addView(input,LinearLayout.LayoutParams(0,dp(48),1f))
            dock.addView(SendIcon(context).apply { contentDescription="Send message"; setOnClickListener { submit() } },LinearLayout.LayoutParams(dp(40),dp(44)))
        }
        panel.addView(dock,LinearLayout.LayoutParams(-1,-2).apply { topMargin=dp(6) })
        status.gravity=Gravity.CENTER; status.maxLines=2; status.setPadding(dp(2),dp(9),dp(2),0)
        panel.addView(status,LinearLayout.LayoutParams(-1,-2))
        modes.gravity=Gravity.CENTER; modes.visibility=GONE
        queue.gravity=Gravity.CENTER; steer.gravity=Gravity.CENTER
        queue.contentDescription="Queue after current response"; steer.contentDescription="Add guidance to current work"
        queue.setOnClickListener { mode("queue") }; steer.setOnClickListener { mode("steer") }
        modes.addView(queue,LinearLayout.LayoutParams(0,dp(36),1f)); modes.addView(steer,LinearLayout.LayoutParams(0,dp(36),1f))
        panel.addView(modes)
    }
    fun reveal() {
        expanding=false; interacted=false; firstText=null; hasLiveReply=false; replyScroll.visibility=GONE; modes.visibility=GONE
        panel.animate().cancel(); panel.alpha=if(motion) 0f else 1f; panel.translationY=if(motion) dp(30).toFloat() else 0f
        panel.animate().alpha(1f).translationY(0f).setDuration(if(motion) 310 else 0).setInterpolator(PathInterpolator(.2f,.8f,.2f,1f)).start()
        orb.active=motion; orb.invalidate()
    }
    fun render(s: AssistantSnapshot) {
        if(firstText==null) { firstText=s.text; hasLiveReply=false }
        chat.text=s.title; status.text=s.status
        status.setTextColor(if(s.needsAttention) Color.rgb(234,191,165) else muted)
        if(s.working && s.text.isNotBlank() && s.text!=firstText) hasLiveReply=true
        val show=(interacted || s.needsAttention || hasLiveReply) && s.text.isNotBlank()
        reply.text=s.text
        replyScroll.visibility=if(show) VISIBLE else GONE
        modes.visibility=if(s.working&&!s.recording) VISIBLE else GONE
        queue.alpha=if(s.mode=="queue") 1f else .4f; steer.alpha=if(s.mode=="steer") 1f else .4f
        orb.recording=s.recording; orb.working=s.working; orb.level=s.level; orb.invalidate()
    }
    val showingReply get() = replyScroll.visibility == VISIBLE && isShown && reply.text.isNotBlank()
    fun message(text: String) { status.text=text }
    fun expand(done: () -> Unit) {
        if(expanding) return; expanding=true
        if(!motion) { done(); return }
        panel.animate().translationY(-dp(26).toFloat()).alpha(0f).setDuration(160).setInterpolator(PathInterpolator(.2f,0f,0f,1f)).withEndAction { done() }.start()
    }
    fun pause() { panel.animate().cancel(); orb.active=false; hold.abort() }
}

private class SheetIcon(context: Context, private val close: Boolean) : View(context) {
    private val p=Paint(Paint.ANTI_ALIAS_FLAG).apply { color=Color.rgb(162,166,178); strokeWidth=resources.displayMetrics.density*1.5f; style=Paint.Style.STROKE; strokeCap=Paint.Cap.ROUND }
    init { isClickable=true; isFocusable=true }
    override fun onDraw(c: Canvas) {
        val x=width/2f; val y=height/2f; val r=resources.displayMetrics.density*4.5f
        if(close) { c.drawLine(x-r,y-r,x+r,y+r,p); c.drawLine(x+r,y-r,x-r,y+r,p) }
        else { c.drawLine(x-r,y+r,x+r,y-r,p); c.drawLine(x-r*.4f,y-r,x+r,y-r,p); c.drawLine(x+r,y-r,x+r,y+r*.4f,p) }
    }
}
private class SendIcon(context: Context) : View(context) {
    private val p=Paint(Paint.ANTI_ALIAS_FLAG).apply { color=Color.rgb(206,209,220); strokeWidth=resources.displayMetrics.density*1.7f; style=Paint.Style.STROKE; strokeCap=Paint.Cap.ROUND; strokeJoin=Paint.Join.ROUND }
    init { isClickable=true; isFocusable=true }
    override fun onDraw(c: Canvas) { val x=width/2f; val y=height/2f; val r=resources.displayMetrics.density*5; c.drawLine(x,y+r,x,y-r,p); c.drawLine(x-r,y,x,y-r,p); c.drawLine(x+r,y,x,y-r,p) }
}

/** AGSL port of Orbit/Ally's energy shader; no static bevel or bitmap orb.
 * Below API33, animated moving gradients preserve the same soft palette. */
private class FluidAssistantOrb(context: Context) : View(context) {
    var active=false; var recording=false; var working=false; var level=0f
    private var eased=0f
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    private val origin=SystemClock.uptimeMillis()
    private val shader=if(Build.VERSION.SDK_INT>=33) RuntimeShader(SHADER) else null
    fun pressed(value: Boolean) { animate().scaleX(if(value) 1.09f else 1f).scaleY(if(value) 1.09f else 1f).setDuration(if(ValueAnimator.areAnimatorsEnabled()) 180 else 0).start() }
    override fun onDraw(c: Canvas) {
        super.onDraw(c); eased+=(level-eased)*.15f
        val t=if(active) (SystemClock.uptimeMillis()-origin)/1000f else 1.8f
        if(Build.VERSION.SDK_INT>=33&&shader!=null) {
            shader.setFloatUniform("resolution",width.toFloat(),height.toFloat()); shader.setFloatUniform("time",t)
            shader.setFloatUniform("speed",if(recording) 1.25f else if(working) 1.55f else .55f); shader.setFloatUniform("amplitude",eased)
            paint.shader=shader; c.drawRect(0f,0f,width.toFloat(),height.toFloat(),paint)
        } else {
            val x=width/2f; val y=height/2f; val r=min(x,y)*.82f
            paint.shader=RadialGradient(x+sin(t*.7f)*r*.2f,y+cos(t*.5f)*r*.2f,r,intArrayOf(Color.rgb(206,199,255),Color.rgb(108,147,230),Color.TRANSPARENT),floatArrayOf(0f,.3f,1f),Shader.TileMode.CLAMP)
            c.drawCircle(x,y,r,paint)
        }
        if(active&&isAttachedToWindow&&windowVisibility==VISIBLE) postInvalidateDelayed(if(resources.configuration.isScreenRound) 33 else 16)
    }
    companion object { const val SHADER = """
        uniform float2 resolution;
        uniform float time;
        uniform float speed;
        uniform float amplitude;
        half4 main(float2 point) {
            float2 uv=(point-.5*resolution)/resolution.y;
            float r=length(uv)/(1.+amplitude*.18);
            float wave=mix(.48,1.,sin(r*2.-time*speed)*.5+.5);
            float glow=(1.-smoothstep(.2,.46,r))*wave*1.75;
            float t1=sin(time*.8+r*6.)*.5+.5;
            float t2=sin(time*.5+r*3.)*.5+.5;
            float3 color=mix(mix(float3(.39,.55,1.),float3(.70,.59,1.),t1),float3(.82,.90,1.),t2)*glow;
            color+=.15*(1.-smoothstep(.3,.55,r))*float3(.6,.7,1.);
            float alpha=clamp((1.-smoothstep(.22,.48,r))*glow,0.,1.);
            return half4(half3(clamp(color,0.,1.)*alpha),half(alpha));
        }
    """ }
}
