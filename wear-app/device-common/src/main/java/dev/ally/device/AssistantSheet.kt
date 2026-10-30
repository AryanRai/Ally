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
    private val mode: (String) -> Unit, private val open: () -> Unit, private val dismiss: () -> Unit, private val choose: (String) -> Unit,
    private val selectChat: (String) -> Unit, private val beginMonitor: () -> Boolean,
    private val reviewPending: () -> Unit = open, private val search: (String) -> Unit = {},
    private val finishRecording: () -> Unit = {}, private val beginTyping: () -> Unit = {},
    private val haloAppearance: () -> AssistantHaloAppearance? = { null }) : FrameLayout(context) {
    private val round = resources.configuration.isScreenRound
    private val muted = Color.rgb(155,158,169)
    private val motion get() = ValueAnimator.areAnimatorsEnabled() && !DeviceLink.prefs(context).getBoolean(if(round) "look.reducedMotion" else "phone.look.reducedMotion", false)
    private val panel = LinearLayout(context)
    private val dock = LinearLayout(context)
    private val orb = FluidAssistantOrb(context)
    private val status = label("Hold the orb to talk", 11f, muted)
    private val approvals = label("Approval waiting · Review", 11f, muted)
    private val chat = label("", 11f, muted)
    private val reply = label("", if(round) 12f else 15f)
    private val replyScroll = ScrollView(context)
    private val modes = LinearLayout(context)
    private val routeOptions = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    private val routeScroll = ScrollView(context)
    private var shownChoices = emptyList<AssistantChoice>() to (null as String?)
    private val routeSend = label("Send", if(round) 12f else 15f, Color.rgb(12,12,13))
    private var sideSend: View? = null
    private val routeSearch = EditText(context)
    private var searchOpen = false
    private var syncingSearch = false
    private val activityToggle = label("Agents · checking…", 11f, muted)
    private val activityRows = LinearLayout(context).apply { orientation=LinearLayout.VERTICAL }
    private val activityScroll = ScrollView(context)
    private var activityExpanded = false
    private var lastSnapshot: AssistantSnapshot? = null
    private var lastActivity = AssistantActivityState()
    private var activitySignature = ""
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
        reply.setPadding(dp(2),dp(if(round) 4 else 8),dp(5),dp(if(round) 5 else 10)); reply.setTextIsSelectable(true); reply.autoLinkMask=android.text.util.Linkify.WEB_URLS; reply.setLinkTextColor(Color.rgb(174,193,255))
        replyScroll.addView(reply); replyScroll.visibility=GONE
        panel.addView(replyScroll,LinearLayout.LayoutParams(-1,dp(if(round) 40 else 118)))
        dock.apply { gravity=Gravity.CENTER_VERTICAL; setPadding(dp(1),dp(1),dp(4),dp(1)); background=background(Color.argb(13,255,255,255),24,Color.argb(18,255,255,255)) }
        orb.contentDescription="Hold to talk, release to send"; orb.isClickable=true
        orb.setOnClickListener {
            interacted=true
            if(lastSnapshot?.recording==true && lastSnapshot?.title=="New request") { hold.down(); hold.up() }
            else if(hold.held) hold.up() else hold.down()
        }
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
            fun submit() {
                interacted=true
                when (AssistantSend.action(input.text.toString(), lastSnapshot?.recording==true)) {
                    AssistantSend.Action.TEXT -> send(input.text.toString())
                    AssistantSend.Action.FINISH_VOICE -> finishRecording()
                    AssistantSend.Action.NONE -> Unit
                }
            }
            // EditText can receive initial focus automatically. Only an actual
            // touch/edit switches input modes, so showing the sheet still listens.
            input.setOnTouchListener { _, event ->
                if(event.actionMasked==MotionEvent.ACTION_DOWN) { interacted=true; beginTyping() }
                false
            }
            input.addTextChangedListener(object : android.text.TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
                override fun afterTextChanged(s: android.text.Editable?) { if(!s.isNullOrBlank()) beginTyping() }
            })
            input.setOnEditorActionListener { _,action,_ -> if(action==EditorInfo.IME_ACTION_SEND) { submit(); true } else false }
            dock.addView(input,LinearLayout.LayoutParams(0,dp(48),1f))
            sideSend=SendIcon(context).apply { contentDescription="Send message"; isFocusable=true; setOnClickListener { submit() } }
            dock.addView(sideSend,LinearLayout.LayoutParams(dp(40),dp(44)))
        }
        panel.addView(dock,LinearLayout.LayoutParams(-1,-2).apply { topMargin=dp(6) })
        status.gravity=Gravity.CENTER; status.maxLines=2; status.setPadding(dp(2),dp(9),dp(2),0)
        panel.addView(status,LinearLayout.LayoutParams(-1,-2))
        approvals.visibility=GONE; approvals.gravity=Gravity.CENTER
        approvals.setPadding(dp(4),0,dp(4),0); approvals.isFocusable=true
        approvals.setOnClickListener { reviewPending() }
        panel.addView(approvals,LinearLayout.LayoutParams(-1,dp(36)))
        activityToggle.gravity=Gravity.CENTER_VERTICAL
        activityToggle.maxLines=1; activityToggle.ellipsize=android.text.TextUtils.TruncateAt.END
        activityToggle.isFocusable=true; activityToggle.isClickable=true
        activityToggle.setPadding(dp(4),0,dp(4),0)
        activityToggle.setOnClickListener {
            if(activityExpanded || beginMonitor()) {
                activityExpanded=!activityExpanded
                lastSnapshot?.let { render(it,lastActivity) }
            }
        }
        panel.addView(activityToggle,LinearLayout.LayoutParams(-1,dp(28)))
        activityScroll.addView(activityRows); activityScroll.visibility=GONE
        panel.addView(activityScroll,LinearLayout.LayoutParams(-1,dp(if(round) 88 else 144)))
        // Send stays fixed above the compact list so confirming is always one tap.
        routeSend.gravity=Gravity.CENTER; routeSend.maxLines=1; routeSend.ellipsize=android.text.TextUtils.TruncateAt.END
        routeSend.setPadding(dp(12),0,dp(12),0); routeSend.isClickable=true; routeSend.isFocusable=true; routeSend.visibility=GONE
        routeSend.background=background(Color.rgb(244,244,245),if(round) 18 else 22)
        routeSend.setOnClickListener { choose(AssistantRoutePicker.SEND) }
        panel.addView(routeSend,LinearLayout.LayoutParams(-1,dp(if(round) 36 else 44)).apply { topMargin=dp(4) })
        routeSearch.apply {
            hint="Search chats"; contentDescription="Search chats"; textSize=if(round) 12f else 14f; setTextColor(Color.WHITE); setHintTextColor(Color.rgb(146,149,161))
            setSingleLine(); inputType=InputType.TYPE_CLASS_TEXT; imeOptions=EditorInfo.IME_ACTION_SEARCH; visibility=GONE
            setPadding(dp(10),0,dp(10),0); background=background(Color.argb(20,255,255,255),12,Color.argb(40,255,255,255))
            val font=resources.getIdentifier("geist_regular","font",context.packageName); if(font!=0) typeface=resources.getFont(font)
            addTextChangedListener(object: android.text.TextWatcher {
                override fun beforeTextChanged(t: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(t: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(t: android.text.Editable?) { if(!syncingSearch) search(t.toString()) }
            })
            setOnEditorActionListener { v,action,_ -> if(action==EditorInfo.IME_ACTION_SEARCH) { hideKeyboard(v); true } else false }
        }
        panel.addView(routeSearch,LinearLayout.LayoutParams(-1,dp(if(round) 34 else 40)).apply { topMargin=dp(4) })
        routeScroll.addView(routeOptions); routeScroll.visibility=GONE
        panel.addView(routeScroll,LinearLayout.LayoutParams(-1,dp(if(round) 84 else 156)))
        modes.gravity=Gravity.CENTER; modes.visibility=GONE
        queue.gravity=Gravity.CENTER; steer.gravity=Gravity.CENTER
        queue.contentDescription="Queue after current response"; steer.contentDescription="Add guidance to current work"
        queue.setOnClickListener { mode("queue") }; steer.setOnClickListener { mode("steer") }
        modes.addView(queue,LinearLayout.LayoutParams(0,dp(36),1f)); modes.addView(steer,LinearLayout.LayoutParams(0,dp(36),1f))
        panel.addView(modes)
    }
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        // Restore preferred heights on every pass, including keyboard dismissal.
        // Only scrollable content gives up space; input and actions retain theirs.
        val scrolls = listOf(replyScroll to dp(if(round) 40 else 118),
            activityScroll to dp(if(round) 88 else 144), routeScroll to dp(if(round) 84 else 156))
        scrolls.forEach { (view, height) -> view.layoutParams.height = height }
        if (!round && MeasureSpec.getMode(heightMeasureSpec) != MeasureSpec.UNSPECIFIED) {
            val panelWidth = getChildMeasureSpec(widthMeasureSpec, paddingLeft + paddingRight, panel.layoutParams.width)
            panel.measure(panelWidth, MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
            val visible = scrolls.filter { it.first.visibility != GONE }
            val preferred = visible.map { it.second }
            val fixed = panel.measuredHeight - preferred.sum()
            val fitted = AssistantImeLayout.fit(preferred,
                (MeasureSpec.getSize(heightMeasureSpec) - paddingTop - paddingBottom - fixed).coerceAtLeast(0))
            visible.forEachIndexed { index, (view, _) -> view.layoutParams.height = fitted[index] }
        }
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    }
    fun reveal() {
        expanding=false; activityExpanded=false; interacted=false; firstText=null; hasLiveReply=false; replyScroll.visibility=GONE; modes.visibility=GONE
        panel.animate().cancel(); panel.alpha=if(motion) 0f else 1f; panel.translationY=if(motion) dp(30).toFloat() else 0f
        panel.animate().alpha(1f).translationY(0f).setDuration(if(motion) 310 else 0).setInterpolator(PathInterpolator(.2f,.8f,.2f,1f)).start()
        orb.active=motion; orb.invalidate()
    }
    fun followChat() { activityExpanded=false; interacted=true; firstText=null; hasLiveReply=false }
    fun openMonitor() { activityExpanded=true; lastSnapshot?.let { render(it,lastActivity) } }
    fun render(s: AssistantSnapshot, agents: AssistantActivityState = lastActivity) {
        // The assistant window has its own lifecycle, separate from MainActivity.
        // Only microphone capture holds the display; release/cancel restores AOD.
        keepScreenOn = s.recording
        approvals.visibility=if(!round && DeviceLink.inbox.value.any { DeviceAlerts.blocking(it) }) VISIBLE else GONE
        lastSnapshot=s; lastActivity=agents
        activityToggle.text="${agents.summary} ${if(activityExpanded) "▴" else "▾"}"
        activityToggle.contentDescription="${agents.summary}. ${if(activityExpanded) "Collapse" else "Show"} agent chats"
        activityToggle.setTextColor(if(agents.stale) muted else if(agents.chats.any { it.status=="needs_input" || it.status=="error" }) Color.rgb(234,191,165) else Color.rgb(177,190,222))
        activityToggle.visibility=VISIBLE
        activityScroll.visibility=if(activityExpanded) VISIBLE else GONE
        dock.visibility=if(round && (activityExpanded || s.choices.isNotEmpty())) GONE else VISIBLE
        status.visibility=if(round && activityExpanded) GONE else VISIBLE
        val signature="${s.chatId}|${agents.stale}|${agents.chats}"
        if(signature!=activitySignature) {
            activitySignature=signature; activityRows.removeAllViews()
            if(agents.chats.isEmpty()) activityRows.addView(label(if(agents.stale) "Reconnect to see agent status" else if(!agents.checked) "Checking agent status…" else "No active or recent replies",11f,muted))
            agents.chats.forEach { agent ->
                val selected=agent.id==s.chatId
                val indicator=when(agent.status) { "running" -> "●"; "needs_input" -> "!"; "unread" -> "•"; "completed" -> "✓"; "stopped" -> "■"; else -> "!" }
                activityRows.addView(label("${if(selected) "› " else ""}${agent.title}\n$indicator ${if(agents.stale) "Last seen · " else ""}${agent.label} · ${agent.provider}",if(round) 10f else 12f,
                    if(agent.status=="needs_input" || agent.status=="error") Color.rgb(234,191,165) else Color.rgb(212,219,234)).apply {
                    maxLines=2; ellipsize=android.text.TextUtils.TruncateAt.END
                    setPadding(dp(7),dp(3),dp(7),dp(3)); isClickable=true; isFocusable=true
                    contentDescription="${agent.title}. ${if(agents.stale) "Last known status" else "Status"}: ${agent.label}. ${agent.provider}. ${agent.detail}. Open chat"
                    background=background(Color.argb(if(selected) 34 else 16,180,199,255),10)
                    setOnClickListener { selectChat(agent.id) }
                },LinearLayout.LayoutParams(-1,dp(if(round) 42 else 46)).apply { topMargin=dp(2) })
            }
        }
        if (s.choices to s.selected != shownChoices) {
            shownChoices=s.choices to s.selected; routeOptions.removeAllViews()
            s.choices.forEach { choice ->
                val picked=choice.id==s.selected
                val name=if(choice.id.startsWith("__")) choice.title else "${choice.title} · ${choice.provider}"
                routeOptions.addView(label((if(picked) "✓ " else "")+name, if(round) 11f else 14f, if(picked) Color.WHITE else Color.rgb(212,215,224)).apply {
                    setPadding(dp(8),0,dp(8),0); maxLines=1; ellipsize=android.text.TextUtils.TruncateAt.END
                    contentDescription=if(picked) "$name, selected" else name
                    isClickable=true; isFocusable=true
                    background=background(Color.argb(if(picked) 46 else 16,if(picked) 180 else 255,if(picked) 199 else 255,255),12,if(picked) Color.argb(90,180,199,255) else 0)
                    setOnClickListener { if(choice.id==AssistantRoutePicker.SEARCH) toggleSearch(); choose(choice.id) }
                },LinearLayout.LayoutParams(-1,dp(if(round) 34 else 40)).apply { topMargin=dp(3) })
            }
        }
        val destination=s.choices.find { it.id==s.selected }
        routeSend.text=destination?.let { "Send to ${if(it.id==AssistantRoutePicker.NEW) it.title.replaceFirstChar { c -> c.lowercase() } else it.title}" } ?: "Send"
        routeSend.contentDescription=routeSend.text
        routeSend.visibility=if(destination==null || activityExpanded) GONE else VISIBLE
        if(s.choices.none { it.id==AssistantRoutePicker.SEARCH } && searchOpen) { searchOpen=false; setSearch("") }
        routeSearch.visibility=if(searchOpen && !activityExpanded) VISIBLE else GONE
        routeScroll.visibility=if(s.choices.isEmpty() || activityExpanded) GONE else VISIBLE
        if(round && s.choices.isNotEmpty()) activityToggle.visibility=GONE
        if(firstText==null) { firstText=s.text; hasLiveReply=false }
        chat.text=s.title; status.text=if(round && s.choices.isNotEmpty() && s.text.isNotBlank()) "“${s.text.take(55)}” · ${s.status}" else s.status
        status.setTextColor(if(s.needsAttention) Color.rgb(234,191,165) else muted)
        if(s.working && s.text.isNotBlank() && s.text!=firstText) hasLiveReply=true
        val show=(s.recording || interacted || s.needsAttention || hasLiveReply || s.working) && s.text.isNotBlank() && !(round && s.choices.isNotEmpty())
        reply.text=s.text
        replyScroll.visibility=if(show&&!activityExpanded) VISIBLE else GONE
        if(round && show && !activityExpanded) status.visibility=GONE
        modes.visibility=if(s.working&&!s.recording&&s.title!="New request"&&!activityExpanded) VISIBLE else GONE
        queue.alpha=if(s.mode=="queue") 1f else .4f; steer.alpha=if(s.mode=="steer") 1f else .4f
        orb.appearance=haloAppearance(); orb.recording=s.recording; orb.speaking=s.speaking && !s.recording; orb.working=s.working; orb.level=s.level; orb.invalidate()
        sideSend?.contentDescription=if(s.recording) "Finish recording and send" else "Send message"
        orb.contentDescription=if(s.recording && s.title=="New request") "Listening. Tap to finish and review your words." else "Hold to talk, release to send"
    }
    private fun setSearch(value: String) { syncingSearch=true; routeSearch.setText(value); syncingSearch=false }
    fun fitInsets(insets: WindowInsets) {
        if(round) return
        val bars=insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
        val ime=insets.getInsets(WindowInsets.Type.ime())
        setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom)+dp(18))
    }
    fun panelBounds(): Rect = Rect().also { bounds ->
        val origin=IntArray(2); panel.getLocationInWindow(origin)
        bounds.set(origin[0],origin[1],origin[0]+panel.width,origin[1]+panel.height)
    }
    fun glass(enabled: Boolean) {
        panel.background=GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(
            Color.argb(if(enabled) 225 else 245,36,38,48),Color.argb(if(enabled) 220 else 245,18,20,27))).apply {
            cornerRadius=dp(28).toFloat(); setStroke(dp(1),Color.argb(35,255,255,255))
        }
    }
    private fun hideKeyboard(v: View) { context.getSystemService(android.view.inputmethod.InputMethodManager::class.java)?.hideSoftInputFromWindow(v.windowToken,0) }
    /** Search only filters the destination list; the entry clears its query via choose(SEARCH). */
    private fun toggleSearch() {
        searchOpen=!searchOpen; setSearch("")
        routeSearch.visibility=if(searchOpen) VISIBLE else GONE
        if(searchOpen) { routeSearch.requestFocus(); context.getSystemService(android.view.inputmethod.InputMethodManager::class.java)?.showSoftInput(routeSearch,0) }
        else hideKeyboard(routeSearch)
    }
    val showingReply get() = replyScroll.visibility == VISIBLE && isShown && reply.text.isNotBlank()
    fun message(text: String) { status.text=text }
    fun expand(done: () -> Unit) {
        if(expanding) return; expanding=true
        if(!motion) { done(); return }
        panel.animate().translationY(-dp(26).toFloat()).alpha(0f).setDuration(160).setInterpolator(PathInterpolator(.2f,0f,0f,1f)).withEndAction { done() }.start()
    }
    fun pause() { keepScreenOn=false; panel.animate().cancel(); orb.active=false; hold.abort() }
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
    var active=false; var recording=false; var speaking=false; var working=false; var level=0f
    var appearance: AssistantHaloAppearance? = null
    private var eased=0f
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    private val origin=SystemClock.uptimeMillis()
    private val shader=if(Build.VERSION.SDK_INT>=33) RuntimeShader(SHADER) else null
    fun pressed(value: Boolean) { animate().scaleX(if(value) 1.09f else 1f).scaleY(if(value) 1.09f else 1f).setDuration(if(ValueAnimator.areAnimatorsEnabled()) 180 else 0).start() }
    override fun onDraw(c: Canvas) {
        super.onDraw(c)
        // RMS values for quiet speech are small. Give the halo visible attack
        // and a softer release; all motion still follows actual microphone PCM.
        val target=if(recording || speaking) (kotlin.math.sqrt(level.coerceIn(0f,1f))*2.2f).coerceAtMost(1f) else 0f
        eased+=(target-eased)*(if(target>eased) .4f else .12f)
        val t=if(active) (SystemClock.uptimeMillis()-origin)/1000f else 1.8f
        val theme=appearance?.takeIf { it.colors.size==3 }
        if(theme!=null) {
            drawPhoneHalo(c, theme, t)
        } else if(Build.VERSION.SDK_INT>=33&&shader!=null) {
            shader.setFloatUniform("resolution",width.toFloat(),height.toFloat()); shader.setFloatUniform("time",t)
            shader.setFloatUniform("speed",if(recording) 1.25f else if(working) 1.55f else .55f); shader.setFloatUniform("amplitude",eased)
            paint.shader=shader; c.drawRect(0f,0f,width.toFloat(),height.toFloat(),paint)
        } else {
            val x=width/2f; val y=height/2f; val r=min(x,y)*(.70f+eased*.22f)
            paint.shader=RadialGradient(x+sin(t*.7f)*r*.2f,y+cos(t*.5f)*r*.2f,r,intArrayOf(Color.rgb(206,199,255),Color.rgb(108,147,230),Color.TRANSPARENT),floatArrayOf(0f,.3f,1f),Shader.TileMode.CLAMP)
            c.drawCircle(x,y,r,paint)
        }
        if(theme==null && (recording || eased>.01f)) {
            paint.shader=null; paint.style=Paint.Style.STROKE
            paint.color=Color.argb((65+eased*170).toInt(),104,174,255)
            paint.strokeWidth=min(width,height)*(.018f+eased*.035f)
            c.drawCircle(width/2f,height/2f,min(width,height)*(.28f+eased*.13f),paint)
            paint.style=Paint.Style.FILL
        }
        if(active&&isAttachedToWindow&&windowVisibility==VISIBLE) postInvalidateDelayed(if(resources.configuration.isScreenRound) 33 else 16)
    }
    /** Same style names, palette order and geometry as the main phone halo. */
    private fun drawPhoneHalo(c: Canvas, theme: AssistantHaloAppearance, t: Float) {
        val x=width/2f; val y=height/2f
        val phase=if(active) t*(if(speaking) 2.99f else 1.40f) else .61f
        val r=min(width,height)*(if(recording || speaking) .36f+eased*.12f else .47f)
        val dx=cos(phase)*r*.2f; val dy=sin(phase)*r*.18f
        val colors=theme.colors
        fun alpha(color: Int, value: Float)=Color.argb((value.coerceIn(0f,1f)*255).toInt(),Color.red(color),Color.green(color),Color.blue(color))
        fun glow(cx: Float, cy: Float, radius: Float, color: Int, strength: Float) {
            paint.style=Paint.Style.FILL
            paint.shader=RadialGradient(cx,cy,radius,intArrayOf(alpha(color,strength),alpha(color,strength*.35f),Color.TRANSPARENT),floatArrayOf(0f,.35f,1f),Shader.TileMode.CLAMP)
            c.drawCircle(cx,cy,radius,paint); paint.shader=null
        }
        when(theme.style) {
            "SIRI" -> {
                glow(x,y,r,colors[0],.65f)
                val ring=Path()
                for(i in 0..100) {
                    val a=i*Math.PI*2/100; val radius=r*(.65+.12*sin(a*3+phase))
                    val px=x+(cos(a)*radius).toFloat(); val py=y+(sin(a)*radius).toFloat()
                    if(i==0)ring.moveTo(px,py)else ring.lineTo(px,py)
                }
                ring.close();paint.shader=SweepGradient(x,y,(colors+colors[0]).toIntArray(),null);paint.style=Paint.Style.STROKE;paint.strokeWidth=r*.12f;c.drawPath(ring,paint);paint.shader=null;paint.style=Paint.Style.FILL
                paint.color=alpha(colors[2],.7f);c.drawCircle(x-dx,y-dy,r*.13f,paint)
            }
            "CLOUD" -> {
                glow(x,y,r,colors[1],.4f)
                colors.forEachIndexed { index,color ->
                    val wave=Path()
                    for(i in 0..60) {
                        val u=i/60f; val px=x+(u*2-1)*r*.85f
                        val py=y+(sin(u*Math.PI*2+phase+index*1.7)*sin(u*Math.PI)*r*.38).toFloat()
                        if(i==0)wave.moveTo(px,py)else wave.lineTo(px,py)
                    }
                    paint.style=Paint.Style.STROKE;paint.strokeCap=Paint.Cap.ROUND
                    paint.color=alpha(color,.18f);paint.strokeWidth=r*.32f;c.drawPath(wave,paint)
                    paint.color=alpha(color,.9f);paint.strokeWidth=r*.07f;c.drawPath(wave,paint)
                };paint.style=Paint.Style.FILL
            }
            "PIXEL" -> {
                val cell=r*.23f
                listOf("0011100","0111110","1111111","1111111","1111111","0111110","0011100").forEachIndexed { row,line -> line.forEachIndexed { col,value ->
                    if(value=='1') {paint.color=colors[(row/3).coerceAtMost(2)];val left=x+(col-3.5f)*cell;val top=y+(row-3.5f)*cell;c.drawRect(left,top,left+cell*.87f,top+cell*.87f,paint)}
                } }
            }
            else -> { glow(x+dx,y+dy,r,colors[1],.6f);glow(x-dx,y-dy,r*.8f,colors[0],.95f);glow(x-r*.15f,y-r*.2f,r*.55f,colors[2],.95f) }
        }
        paint.shader=null;paint.color=alpha(colors[2],.55f+eased*.4f);paint.strokeCap=Paint.Cap.ROUND
        if(speaking) { paint.style=Paint.Style.STROKE;paint.strokeWidth=r*(.03f+eased*.05f);c.drawArc(x-r*.9f,y-r*.9f,x+r*.9f,y+r*.9f,phase*180f/Math.PI.toFloat(),110f+eased*90f,false,paint) }
        if(recording) { paint.style=Paint.Style.STROKE;paint.strokeWidth=r*.06f;for(i in -2..2){val h=r*(.15f+eased*(.85f-abs(i)*.2f));c.drawLine(x+i*r*.22f,y-h/2,x+i*r*.22f,y+h/2,paint)} }
        paint.style=Paint.Style.FILL
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
