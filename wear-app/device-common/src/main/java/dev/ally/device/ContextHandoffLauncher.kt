package dev.ally.device

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

/** Explicit user action opens local review. This never captures a screen or submits a message. */
internal object ContextHandoffLauncher {
    const val ACTION = "dev.ally.device.REVIEW_CONTEXT_HANDOFF"
    const val TOKEN = "dev.ally.device.CONTEXT_TOKEN"
    const val RECEIPT="dev.ally.device.HANDOFF_RECEIPT"
    private val vault = ContextHandoff(SystemClock::elapsedRealtime)
    private val reviewed = mutableMapOf<String, () -> Unit>()
    fun openPending(context: Context): Boolean {
        if (DeviceLink.prefs(context).getString("sharePickerPending", null) == null) return false
        context.startActivity(Intent(context, ShareToChatActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        android.widget.Toast.makeText(context, "Your previous send is unconfirmed. Review or retry it first.", android.widget.Toast.LENGTH_LONG).show()
        return true
    }
    fun open(context: Context, text: String, image: ByteArray?, onReviewed: (() -> Unit)? = null,receipt:org.json.JSONObject?=null,continuity:String?=null): Boolean {
        require(context.packageName.endsWith(".phone")) { "Screen handoff is available on the phone" }
        if (openPending(context)) return false
        val token = vault.offer(text, image,continuity)
        reviewed.clear()
        if (onReviewed != null) reviewed[token] = onReviewed
        try {
            context.startActivity(Intent(context, ShareToChatActivity::class.java).setAction(ACTION)
                .putExtra(TOKEN, token).putExtra(RECEIPT,receipt?.toString()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            Handler(Looper.getMainLooper()).postDelayed({ vault.expire(token); reviewed.remove(token) }, 60_000)
            return true
        } catch (error: Exception) { vault.expire(token); reviewed.remove(token); throw error }
    }
    fun take(intent: Intent): ContextHandoff.Snapshot? =
        if (intent.action == ACTION) intent.getStringExtra(TOKEN)?.let(vault::take) else null
    fun reviewed(intent: Intent) { intent.getStringExtra(TOKEN)?.let { reviewed.remove(it)?.invoke() } }
    fun discard(intent: Intent) { intent.getStringExtra(TOKEN)?.let { vault.expire(it); reviewed.remove(it) } }
}
