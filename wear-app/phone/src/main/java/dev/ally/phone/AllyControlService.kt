package dev.ally.phone

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Base64
import android.view.Display
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import dev.ally.device.DeviceLink
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Executes the desktop agent's exact, already-validated operations on this phone. It never
 * acts on its own: every call needs an active user-approved grant held by [ControlBridge].
 */
class AllyControlService : AccessibilityService() {
    companion object { @Volatile var instance: AllyControlService? = null; private set }

    override fun onServiceConnected() { instance = this }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}
    override fun onUnbind(intent: Intent?): Boolean { keepAwake(false); instance = null; ControlBridge.end(this, "Ally control was turned off.") ; return super.onUnbind(intent) }
    override fun onDestroy() { keepAwake(false); instance = null; super.onDestroy() }

    private var awake: android.view.View? = null
    /**
     * Holds the screen on during a control session with an invisible, untouchable 1 px overlay
     * instead of changing the user's timeout setting. It never wakes or unlocks the phone.
     */
    fun keepAwake(on: Boolean) {
        val manager = getSystemService(WindowManager::class.java)
        if (!on) { awake?.let { runCatching { manager.removeView(it) } }; awake = null; return }
        if (awake != null) return
        val view = android.view.View(this)
        val params = WindowManager.LayoutParams(1, 1, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            android.graphics.PixelFormat.TRANSLUCENT).apply { gravity = android.view.Gravity.TOP or android.view.Gravity.START }
        if (runCatching { manager.addView(view, params) }.isSuccess) awake = view
    }

    fun screenSize(): Pair<Int, Int> = getSystemService(WindowManager::class.java).currentWindowMetrics.bounds.let { it.width() to it.height() }

    /** Visible windows, bottom first, so overlays and dialogs are last as in uiautomator output. */
    fun tree(): String {
        var budget = ControlTree.MAX_NODES
        fun convert(node: AccessibilityNodeInfo, depth: Int): ControlNode? {
            if (budget <= 0 || depth > 60 || !node.isVisibleToUser) return null
            budget--
            val r = Rect().also { node.getBoundsInScreen(it) }
            val children = (0 until node.childCount).mapNotNull { i -> node.getChild(i)?.let { convert(it, depth + 1) } }
            return ControlNode(node.packageName?.toString().orEmpty(), node.className?.toString().orEmpty(),
                if (node.isShowingHintText) "" else node.text?.toString().orEmpty(), node.contentDescription?.toString().orEmpty(),
                node.viewIdResourceName.orEmpty(), r.left, r.top, r.right, r.bottom, node.isPassword, node.isClickable,
                node.isEditable, node.isFocused, node.isScrollable, children)
        }
        val shown = windows.filter { it.type != AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY }.sortedBy { it.layer }
        val roots = shown.mapNotNull { w -> w.root?.let { convert(it, 0) } }.ifEmpty { listOfNotNull(rootInActiveWindow?.let { convert(it, 0) }) }
        if (roots.isEmpty()) throw IllegalStateException("The screen is unavailable. Unlock the phone and try again.")
        return ControlTree.xml(roots)
    }

    suspend fun gesture(points: List<Pair<Int, Int>>, durationMs: Long): Unit = withContext(Dispatchers.Main) {
        val path = Path().apply { moveTo(points[0].first.toFloat(), points[0].second.toFloat()); points.drop(1).forEach { lineTo(it.first.toFloat(), it.second.toFloat()) } }
        val description = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, durationMs)).build()
        val done = suspendCancellableCoroutine { c ->
            val callback = object : GestureResultCallback() {
                override fun onCompleted(d: GestureDescription?) { if (c.isActive) c.resume(true) }
                override fun onCancelled(d: GestureDescription?) { if (c.isActive) c.resume(false) }
            }
            if (!dispatchGesture(description, callback, null) && c.isActive) c.resume(false)
        }
        if (!done) throw IllegalStateException("Android cancelled the gesture.")
    }

    /** Appends to the focused field, matching ADB `input text`. Password fields are refused. */
    fun type(text: String) {
        val node = findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: throw IllegalStateException("Tap a text field first.")
        if (!node.isEditable || node.isPassword) throw IllegalStateException("This field can't be typed into by Ally.")
        val existing = if (node.isShowingHintText) "" else node.text?.toString().orEmpty()
        val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, existing + text) }
        if (!node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) throw IllegalStateException("The field didn't accept text.")
    }

    fun key(key: String) {
        val action = when (key) { "back" -> GLOBAL_ACTION_BACK; "home" -> GLOBAL_ACTION_HOME; "recents" -> GLOBAL_ACTION_RECENTS; else -> throw IllegalArgumentException("Unsupported key.") }
        if (!performGlobalAction(action)) throw IllegalStateException("Android ignored the key.")
    }

    fun open(packageName: String) {
        if (packageName.startsWith("dev.ally.")) throw IllegalArgumentException("Ally can't control its own app.")
        val intent = packageManager.getLaunchIntentForPackage(packageName) ?: throw IllegalStateException("That app isn't installed.")
        startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** JPEG at most 1080 px wide; apps that set FLAG_SECURE make Android refuse the capture. */
    suspend fun screenshot(): JSONObject = withContext(Dispatchers.Main) {
        val bitmap = suspendCancellableCoroutine { c ->
            takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
                override fun onSuccess(result: ScreenshotResult) {
                    val buffer = result.hardwareBuffer
                    val copy = Bitmap.wrapHardwareBuffer(buffer, result.colorSpace)?.copy(Bitmap.Config.ARGB_8888, false)
                    buffer.close()
                    if (!c.isActive) return
                    if (copy == null) c.resumeWithException(IllegalStateException("Screenshot unavailable.")) else c.resume(copy)
                }
                override fun onFailure(errorCode: Int) { if (c.isActive) c.resumeWithException(IllegalStateException("Screenshot unavailable; this app may block screenshots.")) }
            })
        }
        withContext(Dispatchers.Default) {
            val scale = minOf(1f, 1080f / bitmap.width)
            val sized = if (scale < 1f) Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true) else bitmap
            val bytes = ByteArrayOutputStream().also { sized.compress(Bitmap.CompressFormat.JPEG, 70, it) }.toByteArray()
            JSONObject().put("mimeType", "image/jpeg").put("data", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("scale", scale.toDouble())
        }
    }
}

/** Grant enforcement, desktop calls and the persistent "Ally is controlling this phone" notice. */
object ControlBridge {
    private const val CHANNEL = "ally-control"
    private const val NOTICE = 31
    private const val SETUP = 32
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val handler = Handler(Looper.getMainLooper())
    @Volatile private var grant: ControlGrant? = null
    private val expire = Runnable { grant?.let { if (!it.active(System.currentTimeMillis())) end(appContext ?: return@Runnable, "Ally's control session ended.") } }
    private var appContext: Context? = null

    fun install(context: Context) {
        appContext = context.applicationContext
        DeviceLink.controlHandler = { c, message, reply -> handle(c, message, reply) }
    }

    private fun handle(context: Context, message: JSONObject, reply: (JSONObject) -> Unit) {
        val id = message.optString("id")
        scope.launch {
            val out = JSONObject().put("type", "control_result").put("id", id)
            try { out.put("ok", true).put("result", dispatch(context, message.optString("method"), message.optJSONObject("params") ?: JSONObject())) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { out.put("ok", false).put("error", e.message?.take(300) ?: "Phone control failed.") }
            reply(out)
        }
    }

    private suspend fun dispatch(context: Context, method: String, params: JSONObject): JSONObject {
        val service = AllyControlService.instance
        when (method) {
            "control.status" -> {
                if (service == null) promptSetup(context)
                return JSONObject().put("enabled", service != null).put("grant", grant?.takeIf { it.active(System.currentTimeMillis()) }?.id ?: JSONObject.NULL)
            }
            "control.grant" -> {
                val next = ControlGrant.parse(params.optString("grantId"), params.optString("chatId"), params.optString("title"), params.optLong("expiresAt"), System.currentTimeMillis())
                    ?: throw IllegalArgumentException("Invalid control session.")
                if (service == null) { promptSetup(context); throw IllegalStateException(SETUP_MESSAGE) }
                grant = next; showNotice(context, next); service.keepAwake(true)
                handler.removeCallbacks(expire); handler.postDelayed(expire, next.expiresAt - System.currentTimeMillis() + 500)
                return JSONObject().put("granted", true)
            }
            "control.end" -> { if (params.optString("grantId") == grant?.id) end(context, null, notifyDesktop = false); return JSONObject() }
        }
        val active = grant
        if (active == null || active.id != params.optString("grantId") || active.chatId != params.optString("chatId") || !active.active(System.currentTimeMillis()))
            throw IllegalStateException("No active control session on the phone. Ask again to start one.")
        if (service == null) { promptSetup(context); throw IllegalStateException(SETUP_MESSAGE) }
        return when (method) {
            "control.ready" -> { awaitUnlocked(context); JSONObject().put("ready", true) }
            "control.view" -> {
                val (width, height) = service.screenSize()
                JSONObject().put("xml", withContext(Dispatchers.Default) { service.tree() }).put("width", width).put("height", height)
            }
            "control.screenshot" -> service.screenshot()
            "control.perform" -> { perform(service, params.getJSONObject("operation")); JSONObject() }
            else -> throw IllegalArgumentException("Unsupported phone control call.")
        }
    }

    private suspend fun perform(service: AllyControlService, op: JSONObject) {
        when (op.optString("type")) {
            "tap" -> service.gesture(listOf(op.getInt("x") to op.getInt("y")), 60)
            "swipe" -> service.gesture(listOf(op.getInt("x") to op.getInt("y"), op.getInt("endX") to op.getInt("endY")), op.optLong("durationMs", 300).coerceIn(100, 2000))
            "text" -> service.type(op.getString("text"))
            "key" -> service.key(op.getString("key"))
            "open_app" -> service.open(op.getString("packageName"))
            else -> throw IllegalArgumentException("Unsupported operation.")
        }
    }

    private const val UNLOCK = 33
    private const val UNLOCK_CHANNEL = "ally-control-unlock"
    @Volatile private var unlockWaiter: CompletableDeferred<Unit>? = null
    fun unlocked() { unlockWaiter?.complete(Unit) }

    /**
     * A locked phone is never driven. Ask once with a notification; tapping it opens Android's own
     * unlock prompt. Any genuine unlock (including the side button) lets the request continue.
     */
    private suspend fun awaitUnlocked(context: Context) {
        val keyguard = context.getSystemService(android.app.KeyguardManager::class.java)
        if (!keyguard.isDeviceLocked) return
        val waiter = CompletableDeferred<Unit>().also { unlockWaiter = it }
        val receiver = object : BroadcastReceiver() { override fun onReceive(c: Context, i: Intent) { if (!keyguard.isDeviceLocked) waiter.complete(Unit) } }
        context.registerReceiver(receiver, android.content.IntentFilter(Intent.ACTION_USER_PRESENT), Context.RECEIVER_NOT_EXPORTED)
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(UNLOCK_CHANNEL, "Ally needs you to unlock", NotificationManager.IMPORTANCE_HIGH))
        val open = PendingIntent.getActivity(context, UNLOCK, Intent(context, ControlUnlockActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val icon = context.resources.getIdentifier("ic_ally", "drawable", context.packageName).takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
        manager.notify(UNLOCK, Notification.Builder(context, UNLOCK_CHANNEL).setSmallIcon(icon)
            .setContentTitle("Unlock to let Ally continue").setContentText("Tap, then use your fingerprint, face or PIN. Nothing runs until you do.")
            .setVisibility(Notification.VISIBILITY_PUBLIC).setCategory(Notification.CATEGORY_REMINDER).setContentIntent(open).setAutoCancel(true).build())
        try {
            if (withTimeoutOrNull(75_000) { waiter.await() } == null || keyguard.isDeviceLocked)
                throw IllegalStateException("The phone stayed locked, so Ally didn't continue. Ask again once it's unlocked.")
        } finally {
            unlockWaiter = null
            runCatching { context.unregisterReceiver(receiver) }
            manager.cancel(UNLOCK)
        }
    }

    /** Ends the session on the phone; the desktop is told so it stops immediately too. */
    fun end(context: Context, reason: String?, notifyDesktop: Boolean = true) {
        val ended = grant ?: return
        grant = null; handler.removeCallbacks(expire)
        AllyControlService.instance?.keepAwake(false)
        context.getSystemService(NotificationManager::class.java).cancel(NOTICE)
        if (notifyDesktop) DeviceLink.sendControl(JSONObject().put("type", "control_revoked").put("grantId", ended.id).put("reason", reason ?: "Stopped on the phone."))
    }

    private fun channel(context: Context) = context.getSystemService(NotificationManager::class.java).also {
        it.createNotificationChannel(NotificationChannel(CHANNEL, "Ally phone control", NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null); enableVibration(false) })
    }

    private fun showNotice(context: Context, g: ControlGrant) {
        val stop = PendingIntent.getBroadcast(context, NOTICE, Intent(context, ControlStopReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val icon = context.resources.getIdentifier("ic_ally", "drawable", context.packageName).takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
        channel(context).notify(NOTICE, Notification.Builder(context, CHANNEL).setSmallIcon(icon)
            .setContentTitle("Ally is controlling this phone").setContentText("For “${g.title}” · tap Stop to end now")
            .setOngoing(true).setOnlyAlertOnce(true).setUsesChronometer(true).setChronometerCountDown(true).setWhen(g.expiresAt).setShowWhen(true)
            .addAction(Notification.Action.Builder(null, "Stop", stop).build()).build())
    }

    private fun promptSetup(context: Context) {
        val open = PendingIntent.getActivity(context, SETUP, Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)
        val icon = context.resources.getIdentifier("ic_ally", "drawable", context.packageName).takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info
        channel(context).notify(SETUP, Notification.Builder(context, CHANNEL).setSmallIcon(icon).setContentTitle("Turn on Ally control")
            .setContentText("Settings → Accessibility → Ally control. One-time setup.").setContentIntent(open).setAutoCancel(true).build())
    }

    private const val SETUP_MESSAGE = "Ally control is off on the phone. Turn it on once in Settings → Accessibility → Ally control (if it's greyed out, allow restricted settings in Ally's App info first)."
}

class ControlStopReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { ControlBridge.end(context, "Stopped on the phone.") }
}
