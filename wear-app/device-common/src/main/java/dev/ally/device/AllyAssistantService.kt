package dev.ally.device

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import java.util.function.Consumer
import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.view.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.combine

class AllyAssistantService : VoiceInteractionService() {
    override fun onReady() { super.onReady(); current = java.lang.ref.WeakReference(this); ready.value=true }
    override fun onShutdown() { if (current?.get() === this) { current = null; ready.value=false }; super.onShutdown() }
    override fun onDestroy() { if(current?.get() === this) { current=null; ready.value=false }; super.onDestroy() }
    override fun onLaunchVoiceAssistFromKeyguard() {
        startActivity(Intent(this, AssistantUnlockActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    companion object {
        val ready = kotlinx.coroutines.flow.MutableStateFlow(false)
        private var current: java.lang.ref.WeakReference<AllyAssistantService>? = null
        fun showUnlocked(screenContext: Boolean = true): Boolean {
            val service = current?.get() ?: return false
            val phone = !service.packageManager.hasSystemFeature(PackageManager.FEATURE_WATCH)
            val flags = if (phone && screenContext) VoiceInteractionSession.SHOW_WITH_ASSIST or VoiceInteractionSession.SHOW_WITH_SCREENSHOT else 0
            service.showSession(Bundle().apply { putBoolean("allyNoScreenContext", !screenContext) }, flags); return true
        }
        fun showMonitor(): Boolean {
            val service = current?.get() ?: return false
            if(service.getSystemService(android.app.KeyguardManager::class.java).isDeviceLocked) return false
            service.showSession(Bundle().apply { putBoolean("allyMonitorOnly", true) }, 0); return true
        }
    }
}
class AllyAssistantSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession = AllyAssistantSession(this)
}

/** System overlay and full app share exact conversation controllers and receipts. */
private class AllyAssistantSession(context: android.content.Context) : VoiceInteractionSession(context) {
    private val host get() = (context.applicationContext as AssistantApplication).assistantHost
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var observe: Job? = null
    private var refreshSelected: Job? = null
    private lateinit var sheet: AssistantSheet
    private val entry by lazy { AssistantEntry(context, scope, host) { intent ->
        startAssistantActivity(intent)
        scope.launch { hide() }
    } }
    private val activity by lazy { AssistantActivity(context, scope) }
    private val manager get() = context.getSystemService(WindowManager::class.java)
    private var blurListener: Consumer<Boolean>? = null
    private fun dp(value: Int) = (value * context.resources.displayMetrics.density).toInt()
    private fun glass(enabled: Boolean) {
        if(!context.resources.configuration.isScreenRound) {
            // The transparent full-height host must not blur or shade the app
            // behind it; only the compact sheet paints its own background.
            window?.window?.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.TRANSPARENT))
            if(Build.VERSION.SDK_INT>=31) window?.window?.setBackgroundBlurRadius(0)
            if(::sheet.isInitialized) sheet.glass(enabled)
            return
        }
        window?.window?.apply {
            setBackgroundDrawable(GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(
                Color.argb(if(enabled) 170 else 235, 36, 38, 48), Color.argb(if(enabled) 145 else 240, 18, 20, 27))).apply { cornerRadius=dp(28).toFloat() })
            if(Build.VERSION.SDK_INT>=31) setBackgroundBlurRadius(if(enabled) dp(30) else 0)
        }
    }
    private val hold = AssistantHold({
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            if (entry.entry) { if (!entry.automaticRecording) entry.start() } else host.start()
        }
        else sheet.message("Open Ally to enable the microphone")
    }, { if (entry.entry) entry.release() else host.release() }, { entry.cancelCapture(); entry.releaseScreen(); host.cancel() })
    private fun browse(chatId: String? = null): Boolean {
        if (!entry.canBrowse) { sheet.message("Finishing your send…"); return false }
        hold.abort(); entry.browse(); host.cancel()
        if (chatId != null) { host.openChat(chatId); sheet.followChat(); host.refresh() }
        return true
    }
    override fun onCreateContentView(): View = AssistantSheet(context, hold, { if (entry.entry) entry.typed(it) else host.send(it) }, { host.mode(it) }, { expand() }, { hide() }, { entry.choose(it) }, { browse(it) }, { browse() }, {
        hold.abort()
        startAssistantActivity(DeviceLink.inboxIntent(context).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        hide()
    }, { entry.search(it) }, { if(entry.entry) entry.finish() else host.release() }, {
        hold.abort()
        if(entry.entry) entry.keyboard() else host.cancel()
    }, { host.haloAppearance() }).also { sheet = it }
    private var screenToken = 0L
    private var screenJob: Job? = null
    override fun onPrepareShow(args: Bundle?, showFlags: Int) {
        super.onPrepareShow(args, showFlags)
        screenJob?.cancel()
        val allow = !context.packageManager.hasSystemFeature(PackageManager.FEATURE_WATCH) &&
            args?.getBoolean("allyMonitorOnly") != true && args?.getBoolean("allyNoScreenContext") != true &&
            !context.getSystemService(android.app.KeyguardManager::class.java).isDeviceLocked
        val disabled = disabledShowContext or userDisabledShowContext
        screenToken = entry.beginScreen(allow,
            showFlags and SHOW_WITH_SCREENSHOT != 0 && disabled and SHOW_WITH_SCREENSHOT == 0,
            showFlags and SHOW_WITH_ASSIST != 0 && disabled and SHOW_WITH_ASSIST == 0)
    }
    override fun onHandleScreenshot(screenshot: android.graphics.Bitmap?) {
        val token = screenToken
        if (!entry.screenAccepts(token)) { screenshot?.recycle(); return }
        if (screenshot == null) { entry.screenshot(token, null); return }
        screenJob = scope.launch {
            var bytes: ByteArray? = null
            try {
                withContext(Dispatchers.Default) {
                    // The OS supplied this one pre-overlay image; never request a
                    // second capture from inside Ally or work around FLAG_SECURE.
                    bytes = java.io.ByteArrayOutputStream().use { out ->
                        if (screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out) && out.size() <= 20 * 1024 * 1024) out.toByteArray() else null
                    }
                }
                entry.screenshot(token, bytes); bytes = null
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { entry.screenshot(token, null) }
            finally { screenshot.recycle(); bytes?.fill(0) }
        }
    }
    override fun onHandleAssist(state: AssistState) {
        super.onHandleAssist(state)
        if (!entry.screenAccepts(screenToken) || state.index != 0) return
        val structure = state.assistStructure
        val own = structure?.activityComponent?.packageName == context.packageName
        val content = StringBuilder()
        // Only system-provided visible assist fields. Bound traversal and omit
        // password fields; no accessibility service, ADB or continuous capture.
        if (!own) {
            state.assistContent?.webUri?.let { content.append(it.toString().take(1000)).append('\n') }
            var remaining = 200
            fun visit(node: android.app.assist.AssistStructure.ViewNode) {
                if (remaining-- <= 0 || content.length >= 6000) return
                if (node.visibility != View.VISIBLE || node.isAssistBlocked) return
                val password = node.inputType and android.text.InputType.TYPE_MASK_VARIATION in setOf(
                    android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD, android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
                    android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD, android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD)
                if (!password) node.text?.let { content.append(it.take(1000)).append('\n') }
                for (i in 0 until node.childCount) { if (remaining <= 0 || content.length >= 6000) break; visit(node.getChildAt(i)) }
            }
            if (structure != null) for (i in 0 until structure.windowNodeCount) {
                if (remaining <= 0 || content.length >= 6000) break
                visit(structure.getWindowNodeAt(i).rootViewNode)
            }
        }
        entry.assist(screenToken, content.toString(), own)
    }
    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags); AssistantVisibility.visible = true
        // Power-hold is also routed here by some Android builds while locked.
        // Do not subscribe to conversation content or enable capture before unlock.
        if (context.getSystemService(android.app.KeyguardManager::class.java).isDeviceLocked) {
            sheet.message("Unlock to open Ally")
            startAssistantActivity(Intent(context, AssistantUnlockActivity::class.java))
            hide(); return
        }
        host.presentationVisible(true)
        window?.window?.apply {
            val round=context.resources.configuration.isScreenRound
            setLayout(context.resources.displayMetrics.widthPixels - dp(if(round) 48 else 24), if(round) WindowManager.LayoutParams.WRAP_CONTENT else WindowManager.LayoutParams.MATCH_PARENT)
            setGravity(Gravity.BOTTOM)
            attributes=attributes.apply {
                y=if(round) dp(26) else 0
                // A floating WRAP_CONTENT window must fit above the IME too.
                // adjustResize alone leaves its bottom anchor behind the keyboard.
                setFitInsetsTypes(if(round) WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() else 0)
                setFitInsetsIgnoringVisibility(false)
            }
            decorView.elevation=dp(16).toFloat()
            clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            if(!round) {
                clearFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE)
                setDecorFitsSystemWindows(false)
                // A stable full-height coordinate space receives the complete
                // IME height. A WRAP_CONTENT host can receive clipped insets.
                setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING)
                decorView.setOnApplyWindowInsetsListener { _,insets -> sheet.fitInsets(insets); WindowInsets.CONSUMED }
                decorView.setWindowInsetsAnimationCallback(object: WindowInsetsAnimation.Callback(WindowInsetsAnimation.Callback.DISPATCH_MODE_STOP) {
                    override fun onProgress(insets: WindowInsets, runningAnimations: MutableList<WindowInsetsAnimation>): WindowInsets {
                        sheet.fitInsets(insets); return insets
                    }
                })
                decorView.requestApplyInsets()
            }
        }
        glass(Build.VERSION.SDK_INT>=31 && manager.isCrossWindowBlurEnabled)
        if(Build.VERSION.SDK_INT>=31) {
            blurListener?.let { manager.removeCrossWindowBlurEnabledListener(it) }
            blurListener=Consumer<Boolean> { enabled -> glass(enabled) }.also { manager.addCrossWindowBlurEnabledListener(context.mainExecutor,it) }
        }
        sheet.reveal()
        hold.abort()
        activity.start()
        observe?.cancel(); observe = scope.launch { combine(host.snapshots, entry.state, activity.state, DeviceLink.inbox) { snapshot, _, agents, _ -> entry.overlay(snapshot) to agents }.collect { (snapshot, agents) ->
            sheet.render(snapshot, agents)
            val receipt = snapshot.readReceipt
            if (receipt?.unread == true && !snapshot.working && sheet.showingReply && context.getSystemService(android.os.PowerManager::class.java).isInteractive) {
                host.viewed(receipt)
            }
        } }
        host.refresh()
        refreshSelected?.cancel(); refreshSelected = scope.launch { while(isActive) { delay(4000); host.refresh() } }
        // Explicit invocation owns automatic capture; Android need not forward
        // the original power press/release. Later orb gestures remain hold-to-talk.
        if(args?.getBoolean("allyMonitorOnly") == true) { if(browse()) sheet.openMonitor() }
        else if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED && !DeviceLink.prefs(context).getBoolean("muted", false)) entry.activate()
        else sheet.message("Open Ally to enable the microphone, or unpause voice")
    }
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode in assistantKeys) { if (!entry.automaticRecording && !context.getSystemService(android.app.KeyguardManager::class.java).isDeviceLocked) hold.down(); return true }; return super.onKeyDown(keyCode, event)
    }
    override fun onComputeInsets(outInsets: Insets) {
        super.onComputeInsets(outInsets)
        if(!context.resources.configuration.isScreenRound && ::sheet.isInitialized) {
            outInsets.touchableInsets=Insets.TOUCHABLE_INSETS_REGION
            outInsets.touchableRegion.set(sheet.panelBounds())
        }
    }
    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode in assistantKeys) { if(event.isCanceled) hold.abort() else hold.up(); return true }; return super.onKeyUp(keyCode, event)
    }
    private fun expand() {
        hold.abort()
        sheet.expand {
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return@expand
            startAssistantActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("allyAssistant", true))
            hide()
        }
    }
    override fun onHide() { host.presentationVisible(false); if(Build.VERSION.SDK_INT>=31) blurListener?.let { manager.removeCrossWindowBlurEnabledListener(it) }; blurListener=null; activity.stop(); refreshSelected?.cancel(); entry.pause(); entry.releaseScreen(); screenJob?.cancel(); hold.abort(); observe?.cancel(); if(::sheet.isInitialized) sheet.pause(); AssistantVisibility.visible = false; super.onHide() }
    override fun onDestroy() { host.presentationVisible(false); if(Build.VERSION.SDK_INT>=31) blurListener?.let { manager.removeCrossWindowBlurEnabledListener(it) }; blurListener=null; activity.stop(); refreshSelected?.cancel(); entry.cancelCapture(); entry.releaseScreen(); screenJob?.cancel(); hold.abort(); scope.cancel(); if(::sheet.isInitialized) sheet.pause(); AssistantVisibility.visible = false; super.onDestroy() }
    companion object { val assistantKeys = intArrayOf(KeyEvent.KEYCODE_ASSIST, KeyEvent.KEYCODE_VOICE_ASSIST, KeyEvent.KEYCODE_POWER) }
}

