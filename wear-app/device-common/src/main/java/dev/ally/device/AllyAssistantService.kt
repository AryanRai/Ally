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

class AllyAssistantService : VoiceInteractionService() {
    override fun onReady() { super.onReady(); current = java.lang.ref.WeakReference(this) }
    override fun onShutdown() { if (current?.get() === this) current = null; super.onShutdown() }
    override fun onLaunchVoiceAssistFromKeyguard() {
        startActivity(Intent(this, AssistantUnlockActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    companion object {
        private var current: java.lang.ref.WeakReference<AllyAssistantService>? = null
        fun showUnlocked(): Boolean {
            val service = current?.get() ?: return false
            service.showSession(Bundle(), 0); return true
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
    private lateinit var sheet: AssistantSheet
    private val manager get() = context.getSystemService(WindowManager::class.java)
    private var blurListener: Consumer<Boolean>? = null
    private fun dp(value: Int) = (value * context.resources.displayMetrics.density).toInt()
    private fun glass(enabled: Boolean) {
        window?.window?.apply {
            setBackgroundDrawable(GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(
                Color.argb(if(enabled) 170 else 235, 36, 38, 48), Color.argb(if(enabled) 145 else 240, 18, 20, 27))).apply { cornerRadius=dp(28).toFloat() })
            if(Build.VERSION.SDK_INT>=31) setBackgroundBlurRadius(if(enabled) dp(30) else 0)
        }
    }
    private val hold = AssistantHold({
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) host.start()
        else sheet.message("Open Ally to enable the microphone")
    }, { host.release() }, { host.cancel() })
    override fun onCreateContentView(): View = AssistantSheet(context, hold, { host.send(it) }, { host.mode(it) }, { expand() }, { hide() }).also { sheet = it }
    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags); AssistantVisibility.visible = true
        // Power-hold is also routed here by some Android builds while locked.
        // Do not subscribe to conversation content or enable capture before unlock.
        if (context.getSystemService(android.app.KeyguardManager::class.java).isDeviceLocked) {
            sheet.message("Unlock to open Ally")
            startAssistantActivity(Intent(context, AssistantUnlockActivity::class.java))
            hide(); return
        }
        window?.window?.apply {
            setLayout(context.resources.displayMetrics.widthPixels - dp(if(context.resources.configuration.isScreenRound) 48 else 24), WindowManager.LayoutParams.WRAP_CONTENT)
            setGravity(Gravity.BOTTOM)
            attributes=attributes.apply { y=dp(if(context.resources.configuration.isScreenRound) 26 else 18) }
            decorView.elevation=dp(16).toFloat()
            clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        }
        glass(Build.VERSION.SDK_INT>=31 && manager.isCrossWindowBlurEnabled)
        if(Build.VERSION.SDK_INT>=31) {
            blurListener?.let { manager.removeCrossWindowBlurEnabledListener(it) }
            blurListener=Consumer<Boolean> { enabled -> glass(enabled) }.also { manager.addCrossWindowBlurEnabledListener(context.mainExecutor,it) }
        }
        sheet.reveal()
        observe?.cancel(); observe = scope.launch { host.snapshots.collect { snapshot ->
            sheet.render(snapshot)
            val receipt = snapshot.readReceipt
            if (receipt?.unread == true && !snapshot.working && sheet.showingReply && context.getSystemService(android.os.PowerManager::class.java).isInteractive) {
                host.viewed(receipt)
            }
        } }
        host.refresh()
        // Many Android builds consume the power release. Only an observed
        // forwarded key/touch press owns a release; no guessed/timed submission.
    }
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode in assistantKeys) { if (!context.getSystemService(android.app.KeyguardManager::class.java).isDeviceLocked) hold.down(); return true }; return super.onKeyDown(keyCode, event)
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
    override fun onHide() { if(Build.VERSION.SDK_INT>=31) blurListener?.let { manager.removeCrossWindowBlurEnabledListener(it) }; blurListener=null; hold.abort(); observe?.cancel(); if(::sheet.isInitialized) sheet.pause(); AssistantVisibility.visible = false; super.onHide() }
    override fun onDestroy() { if(Build.VERSION.SDK_INT>=31) blurListener?.let { manager.removeCrossWindowBlurEnabledListener(it) }; blurListener=null; hold.abort(); scope.cancel(); if(::sheet.isInitialized) sheet.pause(); AssistantVisibility.visible = false; super.onDestroy() }
    companion object { val assistantKeys = intArrayOf(KeyEvent.KEYCODE_ASSIST, KeyEvent.KEYCODE_VOICE_ASSIST, KeyEvent.KEYCODE_POWER) }
}
