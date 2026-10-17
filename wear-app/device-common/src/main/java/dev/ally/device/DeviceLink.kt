package dev.ally.device

import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.os.*
import android.provider.AlarmClock
import android.net.Uri
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import okhttp3.*
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalTime
import java.util.UUID
import java.util.concurrent.TimeUnit

object DeviceLink {
    val status = MutableStateFlow("Not connected")
    val inbox = MutableStateFlow<List<JSONObject>>(emptyList())
    internal var service: DeviceLinkService? = null
    fun prefs(c: Context) = c.getSharedPreferences("ally-watch", Context.MODE_PRIVATE)
    fun kind(c: Context) = if (c.packageName.endsWith(".watch")) "watch" else "phone"
    fun load(c: Context) { val a = runCatching { JSONArray(prefs(c).getString("deviceInbox", "[]")) }.getOrDefault(JSONArray()); inbox.value = (0 until a.length()).mapNotNull { a.optJSONObject(it) } }
    @Synchronized fun save(c: Context, item: JSONObject) { load(c); inbox.value = (listOf(item) + inbox.value.filter { it.optString("id") != item.optString("id") }).take(30); persist(c) }
    private fun persist(c: Context) { prefs(c).edit().putString("deviceInbox", JSONArray(inbox.value).toString()).commit() }
    @Synchronized fun dismiss(c: Context, id: String) {
        load(c); inbox.value = inbox.value.filter { it.optString("id") != id }; persist(c)
        receipt(c, id, "dismissed")
        c.getSystemService(NotificationManager::class.java).cancel(id.hashCode())
    }
    @Synchronized fun receipt(c: Context, id: String, status: String) {
        val data = JSONObject().put("type", "receipt").put("id", id).put("status", status)
        if (service?.send(data) == true) return
        // Only dismissal/receipt feedback is replayable, never approvals or actions.
        if (status !in setOf("dismissed", "received", "suppressed")) return
        val a = JSONArray(prefs(c).getString("deviceReceipts", "[]")); a.put(data)
        val bounded = JSONArray(); for (i in maxOf(0, a.length() - 100) until a.length()) bounded.put(a.get(i))
        prefs(c).edit().putString("deviceReceipts", bounded.toString()).commit()
    }
    fun quiet(c: Context): Boolean {
        val p = prefs(c)
        if (p.getBoolean("muted", false)) return true
        val filter = c.getSystemService(NotificationManager::class.java).currentInterruptionFilter
        if (filter != NotificationManager.INTERRUPTION_FILTER_ALL && filter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN) return true
        if (!p.getBoolean("deviceQuietHours", false)) return false
        val hour = LocalTime.now().hour
        return hour >= 22 || hour < 8
    }
    fun start(c: Context): Boolean = runCatching {
        val p = prefs(c)
        require(p.getString("endpoint", "")!!.startsWith("https://") && !p.getString("token", "").isNullOrBlank()) { "Save an HTTPS connection and token first" }
        if (Build.VERSION.SDK_INT >= 33) require(c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) { "Allow notifications first" }
        p.edit().putBoolean("deviceConnected", true).apply()
        c.startForegroundService(Intent(c, DeviceLinkService::class.java)); true
    }.getOrElse { status.value = it.message ?: "Cannot connect"; false }
    fun stop(c: Context) { prefs(c).edit().putBoolean("deviceConnected", false).apply(); c.stopService(Intent(c, DeviceLinkService::class.java)); status.value = "Not connected" }
    fun resume(c: Context) { load(c); if (prefs(c).getBoolean("deviceConnected", false) && service == null) start(c) }
    fun decide(activity: Activity, item: JSONObject, approved: Boolean) {
        val id = item.optString("id")
        if (service == null || status.value != "Connected" || item.optString("_connection") != service?.connectionId || item.optLong("expiresAt") < System.currentTimeMillis()) { status.value = "Request expired or disconnected"; return }
        if (!approved) { receipt(activity, id, "rejected"); dismiss(activity, id); return }
        if (service?.send(JSONObject().put("type", "receipt").put("id", id).put("status", "approved")) != true) { status.value = "Reconnect before approving"; return }
        // Remove before execution: a second tap cannot run the command again.
        if (inbox.value.none { it.optString("id") == id }) return
        inbox.value = inbox.value.filter { it.optString("id") != id }; persist(activity)
        activity.getSystemService(NotificationManager::class.java).cancel(id.hashCode())
        try {
            if (quiet(activity) && item.optString("action") in setOf("watch_haptic", "phone_notify")) { receipt(activity, id, "suppressed"); return }
            var handedOff = false
            when (item.optString("action")) {
                "watch_haptic" -> if (!quiet(activity)) activity.getSystemService(Vibrator::class.java).vibrate(VibrationEffect.createOneShot(70, VibrationEffect.DEFAULT_AMPLITUDE))
                "watch_show_card", "phone_notify" -> {
                    val card = JSONObject(item.toString()).put("command", false)
                    save(activity, card); notify(activity, card)
                }
                "phone_open_url" -> {
                    require(kind(activity) == "phone"); val uri = Uri.parse(item.getString("url")); require(uri.scheme == "https" && uri.userInfo == null)
                    activity.startActivity(Intent(Intent.ACTION_VIEW, uri)); handedOff = true
                }
                "phone_set_timer" -> {
                    require(kind(activity) == "phone"); val seconds = item.getInt("seconds"); require(seconds in 1..86400)
                    activity.startActivity(Intent(AlarmClock.ACTION_SET_TIMER).putExtra(AlarmClock.EXTRA_LENGTH, seconds).putExtra(AlarmClock.EXTRA_MESSAGE, item.optString("title")).putExtra(AlarmClock.EXTRA_SKIP_UI, false)); handedOff = true
                }
                else -> throw IllegalArgumentException("Unknown action")
            }
            receipt(activity, id, if (handedOff) "handed_off" else "done")
        } catch (_: Exception) { receipt(activity, id, "failed"); status.value = "No compatible app could complete this request" }
    }
    fun notify(c: Context, item: JSONObject) {
        if (quiet(c)) return
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val manager = c.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("ally-device", "Ally cards and requests", NotificationManager.IMPORTANCE_DEFAULT).apply { enableVibration(true) })
        val id = item.optString("id")
        val open = PendingIntent.getActivity(c, id.hashCode(), Intent(c, DeviceInboxActivity::class.java).putExtra("id", id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val dismiss = PendingIntent.getBroadcast(c, id.hashCode(), Intent(c, DeviceDismissReceiver::class.java).putExtra("id", id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val title = if (item.optBoolean("command")) "Approve: ${item.optString("action").replace('_', ' ')}" else item.optString("title")
        manager.notify(id.hashCode(), Notification.Builder(c, "ally-device").setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title.take(80)).setContentText(item.optString("body").take(160)).setStyle(Notification.BigTextStyle().bigText(item.optString("body")))
            .setContentIntent(open).setDeleteIntent(dismiss).setAutoCancel(true).build())
    }
}

class DeviceDismissReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { intent.getStringExtra("id")?.let { DeviceLink.dismiss(context, it) } }
}

/** Explicit opt-in connection to a companion PC; no microphone, model calls or idle polling. */
class DeviceLinkService : Service() {
    var connectionId: String = ""; private set
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val client = OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS).connectTimeout(10, TimeUnit.SECONDS).build()
    private var socket: WebSocket? = null
    private var retry: Job? = null
    private var backoff = 1000L
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() { super.onCreate(); DeviceLink.service = this }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!DeviceLink.prefs(this).getBoolean("deviceConnected", false)) { stopSelf(); return START_NOT_STICKY }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("ally-link", "Ally device connection", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, DeviceInboxActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        startForeground(23, Notification.Builder(this, "ally-link").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Ally device connection")
            .setContentText("Cards and approval requests · tap to manage").setContentIntent(open).setOngoing(true).build())
        if (socket == null) connect()
        return START_STICKY
    }
    private fun connect() {
        if (!DeviceLink.prefs(this).getBoolean("deviceConnected", false)) return
        val p = DeviceLink.prefs(this)
        val endpoint = p.getString("endpoint", "")!!.trimEnd('/')
        if (!endpoint.startsWith("https://") || p.getString("token", "").isNullOrBlank()) { DeviceLink.status.value = "Configure HTTPS connection first"; stopSelf(); return }
        val id = p.getString("deviceId", null) ?: UUID.randomUUID().toString().also { p.edit().putString("deviceId", it).commit() }
        connectionId = UUID.randomUUID().toString()
        DeviceLink.status.value = "Connecting…"
        val request = Request.Builder().url(endpoint.replaceFirst("https://", "wss://") + "/v1/devices/live").header("Authorization", "Bearer ${p.getString("token", "")}").build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(JSONObject().put("type", "hello").put("deviceId", id).put("kind", DeviceLink.kind(this@DeviceLinkService)).toString())
            }
            override fun onMessage(webSocket: WebSocket, text: String) { scope.launch {
                if (socket !== webSocket) return@launch
                if (text.length > 16000) return@launch
                val msg = runCatching { JSONObject(text) }.getOrNull() ?: return@launch
                when (msg.optString("type")) {
                    "ready" -> {
                        backoff = 1000L; DeviceLink.status.value = "Connected"
                        val queued = JSONArray(p.getString("deviceReceipts", "[]")); for (i in 0 until queued.length()) webSocket.send(queued.getJSONObject(i).toString())
                        p.edit().remove("deviceReceipts").apply()
                    }
                    "card", "command" -> {
                        val command = msg.optString("type") == "command"
                        val item = msg.optJSONObject(if (command) "command" else "card") ?: return@launch
                        val itemId = item.optString("id"); if (itemId.isBlank() || itemId.length > 160) return@launch
                        DeviceLink.load(this@DeviceLinkService)
                        val duplicate = DeviceLink.inbox.value.any { it.optString("id") == itemId }
                        if (!duplicate) { item.put("command", command).put("_connection", connectionId); DeviceLink.save(this@DeviceLinkService, item); DeviceLink.notify(this@DeviceLinkService, item) }
                        if (!command) DeviceLink.receipt(this@DeviceLinkService, itemId, if (DeviceLink.quiet(this@DeviceLinkService)) "suppressed" else "received")
                    }
                }
            } }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { reconnect(webSocket, response?.code) }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { reconnect(webSocket, null) }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, null) }
        })
    }
    private fun reconnect(ws: WebSocket, code: Int?) { scope.launch {
        if (socket !== ws) return@launch
        socket = null
        if (code == 401 || code == 403) { DeviceLink.status.value = "Pairing rejected; check token"; DeviceLink.prefs(this@DeviceLinkService).edit().putBoolean("deviceConnected", false).apply(); stopSelf(); return@launch }
        DeviceLink.status.value = "Reconnecting…"; retry?.cancel(); retry = scope.launch { delay(backoff); backoff = (backoff * 2).coerceAtMost(30_000); connect() }
    } }
    fun send(message: JSONObject): Boolean = socket?.send(message.toString()) == true
    override fun onDestroy() { DeviceLink.service = null; scope.cancel(); socket?.cancel(); socket = null; client.dispatcher.executorService.shutdown(); DeviceLink.status.value = "Not connected"; super.onDestroy() }
}
