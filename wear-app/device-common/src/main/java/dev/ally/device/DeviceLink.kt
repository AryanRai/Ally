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
    val interactionSending = MutableStateFlow<Set<String>>(emptySet())
    val interactionErrors = MutableStateFlow<Map<String, String>>(emptyMap())
    private var foregroundActivity = java.lang.ref.WeakReference<Activity>(null)
    internal var service: DeviceLinkService? = null
    /** Set by the phone app's on-device control executor; calls are answered with control_result. */
    var controlHandler: ((Context, JSONObject, (JSONObject) -> Unit) -> Unit)? = null
    /** Phone-only local handoff adapter; authenticated socket events, no raw capture transport. */
    var tapHandler: ((Context, JSONObject) -> Unit)? = null
    var viewerHandler: ((Context,JSONObject)->Unit)?=null
    /** Large-file transfer status/completion events pushed from the desktop bridge. */
    var transferHandler: ((Context, JSONObject) -> Unit)? = null
    /** Phone-only: closes the notification shade through Ally's control service, if it is on. */
    var closeNotificationShade: (() -> Boolean)? = null
    fun sendControl(message: JSONObject): Boolean = service?.send(message) == true
    fun prefs(c: Context) = c.getSharedPreferences("ally-watch", Context.MODE_PRIVATE)
    fun kind(c: Context) = if (c.packageName.endsWith(".watch")) "watch" else "phone"
    /** Phone notifications open its full Compose UI; the watch keeps its compact screen. */
    fun inboxIntent(c: Context, page: String = "Inbox"): Intent {
        if (kind(c) == "phone") c.packageManager.getLaunchIntentForPackage(c.packageName)?.let {
            return it.putExtra("allyPage", page).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        return Intent(c, DeviceInboxActivity::class.java)
    }
    fun load(c: Context) {
        val a = runCatching { JSONArray(prefs(c).getString("deviceInbox", "[]")) }.getOrDefault(JSONArray()); inbox.value = (0 until a.length()).mapNotNull { a.optJSONObject(it) }
        if (prefs(c).getInt("replyPresentationVersion",0) < 2) {
            val manager = c.getSystemService(NotificationManager::class.java)
            // Old posted notifications retain their original icon and raw body after install.
            // Remove only completion notices; pending decisions and connection status survive.
            val replyIds = inbox.value.filter { DeviceAlerts.kind(it)=="Reply" }.flatMap { listOf(it.optString("id").hashCode(), DeviceAlerts.notificationId(it)) }.toSet()
            manager.activeNotifications.filter { it.id in replyIds || it.notification.channelId=="ally-replies" }.forEach { manager.cancel(it.tag,it.id) }
            prefs(c).edit().putInt("replyPresentationVersion",2).apply()
        }
    }
    @Synchronized fun save(c: Context, item: JSONObject) {
        load(c); val all = listOf(item) + inbox.value.filter { it.optString("id") != item.optString("id") }
        val live = all.filter { (it.optBoolean("interaction") && it.optString("interactionState") == "pending" || it.optBoolean("command")) && it.optLong("expiresAt") > System.currentTimeMillis() }
        inbox.value = live.take(72) + all.filter { entry -> live.none { it.optString("id") == entry.optString("id") } }.take(30)
        persist(c)
    }
    @Synchronized fun markAlertViewed(c: Context, id: String) {
        load(c)
        inbox.value.firstOrNull { it.optString("id") == id }?.let { save(c, JSONObject(it.toString()).put("_viewedAt",System.currentTimeMillis())) }
    }
    fun alertIntent(c: Context, item: JSONObject): Intent {
        val chat = DeviceAlerts.chat(item)
        return (if(chat != null) c.packageManager.getLaunchIntentForPackage(c.packageName)!!
            .putExtra("openChat",chat).putExtra("allyPage","Chat")
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP) else inboxIntent(c)).putExtra("id",item.optString("id"))
    }
    private fun persist(c: Context) { prefs(c).edit().putString("deviceInbox", JSONArray(inbox.value).toString()).commit() }
    @Synchronized fun dismiss(c: Context, id: String) {
        load(c)
        // Swiping a notification never answers or loses a server-held question.
        if(inbox.value.any { it.optString("id") == id && DeviceAlerts.blocking(it) }) { cancelNotification(c,id); return }
        cancelNotification(c,id)
        inbox.value = inbox.value.filter { it.optString("id") != id }; persist(c)
        receipt(c, id, "dismissed")
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
    fun resume(c: Context) { if(c is Activity) foregroundActivity = java.lang.ref.WeakReference(c); load(c); if (prefs(c).getBoolean("deviceConnected", false) && service == null) start(c) }
    fun answerInteraction(activity: Activity, item: JSONObject, action: String, values: Map<String, String>) {
        val id = item.optString("id")
        if (id in interactionSending.value) return
        if (!DeviceInteractions.canAnswer(item, status.value == "Connected", service?.connectionId)) { interactionErrors.value += id to "Request expired or disconnected"; return }
        val data = JSONObject().put("type", "interaction_answer").put("id", id).put("action", action).put("values", JSONObject(values))
        val connection = service?.connectionId
        interactionSending.value += id; interactionErrors.value -= id
        fun send() {
            if(service?.connectionId != connection || !DeviceInteractions.canAnswer(item, status.value == "Connected", connection) || service?.send(data) != true) {
                interactionSending.value -= id; interactionErrors.value += id to "Decision not confirmed. Reconnect and try again."
            }
        }
        if(action == "accept" && item.optString("deviceAction") == "phone_control_approve" && item.optString("targetDeviceId") == prefs(activity).getString("deviceId", null)) {
            activity.moveTaskToBack(true); Handler(Looper.getMainLooper()).postDelayed({send()},700)
        } else send()
    }
    fun answerNotification(c:Context,id:String,action:String,connection:String) {
        if(c.getSystemService(android.app.KeyguardManager::class.java).isDeviceLocked) return
        load(c)
        val item=inbox.value.firstOrNull { it.optString("id")==id } ?: return
        if(connection!=service?.connectionId || !DeviceInteractions.canAnswer(item,status.value=="Connected",connection) || DeviceInteractions.notificationActions(item).none{it.first==action} || id in interactionSending.value) return
        val answer=DeviceInteractions.notificationAnswer(item,action) ?: return
        interactionSending.value += id
        c.getSystemService(NotificationManager::class.java).cancel(DeviceAlerts.notificationId(item))
        fun send() {
            val sent=service?.connectionId==connection && service?.send(JSONObject().put("type","interaction_answer").put("id",id).put("action",answer.first).put("values",JSONObject(answer.second)))==true
            if(!sent){interactionSending.value -= id;interactionErrors.value += id to "Reconnect before answering";notify(c,item)}
        }
        // Phone control inspects the screen right away: close the shade first so it sees the app, not the shade.
        if(answer.first=="accept" && item.optString("deviceAction")=="phone_control_approve" && item.optString("targetDeviceId")==prefs(c).getString("deviceId",null) && closeNotificationShade?.invoke()==true)
            Handler(Looper.getMainLooper()).postDelayed({send()},700)
        else send()
    }
    /** Allow on an app-opening action: answer from a foreground screen so the approved command can start the app. */
    internal fun answerFromScreen(activity: Activity,id:String,action:String,connection:String):Boolean {
        foregroundActivity=java.lang.ref.WeakReference(activity)
        answerNotification(activity,id,action,connection)
        return id in interactionSending.value
    }
    internal fun interactionEvent(c: Context, message: JSONObject, connection: String) {
        val id = message.optString("id")
        when(message.optString("type")) {
            "interaction_sync" -> {
                val ids = message.optJSONArray("ids"); val pendingIds = (0 until (ids?.length() ?: 0)).map { ids!!.optString(it) }.toSet()
                load(c)
                val outdated = inbox.value.filter { it.optBoolean("interaction") && it.optString("interactionState") == "pending" && it.optString("id") !in pendingIds }
                outdated.forEach { interactionEvent(c,JSONObject().put("type","interaction_closed").put("id",it.optString("id")).put("state","cancelled"),connection) }
                interactionSending.value = emptySet()
            }
            "interaction" -> {
                val item = message.getJSONObject("request"); val requestId = item.optString("id")
                if(requestId.isBlank() || requestId.length > 160) return
                load(c); val existing = inbox.value.firstOrNull { it.optString("id") == requestId }
                item.put("_receivedAt", existing?.optLong("_receivedAt")?.takeIf { it > 0 } ?: System.currentTimeMillis()).put("interaction",true).put("interactionState","pending").put("_connection",connection).put("body",item.optString("detail"))
                save(c,item); if(existing == null) notify(c,item)
            }
            "interaction_closed" -> {
                load(c); inbox.value.firstOrNull { it.optString("id") == id }?.let {
                    if(message.optString("decision") == "accept" && it.optString("deviceAction") == "phone_control_approve" && it.optString("targetDeviceId") == prefs(c).getString("deviceId",null)) foregroundActivity.get()?.takeIf { activity -> activity.hasWindowFocus() }?.moveTaskToBack(true)
                    val updated = JSONObject(it.toString()).put("interactionState",message.optString("state")).put("answeredOn",message.optString("answeredOn","another device"))
                    updated.put("decision",message.optString("decision")).put("answerValues",message.optJSONObject("values") ?: JSONObject())
                    save(c,updated)
                }
                interactionSending.value -= id; interactionErrors.value -= id
                cancelNotification(c,id)
            }
            "interaction_ack" -> {
                interactionSending.value -= id
                if(!message.optBoolean("accepted")) {
                    interactionErrors.value += id to message.optString("error","Decision not confirmed")
                    inbox.value.firstOrNull{it.optString("id")==id}?.let{notify(c,it)}
                }
            }
        }
    }
    internal fun executeAuthorized(c: Context, item: JSONObject, connection: String) {
        if(service?.connectionId != connection || item.optLong("expiresAt") <= System.currentTimeMillis()) return
        val activity = foregroundActivity.get()?.takeIf { !it.isFinishing && it.hasWindowFocus() }
        if(activity == null && item.optString("action") !in setOf("watch_haptic", "watch_show_card", "phone_notify")) {
            val waiting = JSONObject(item.toString()).put("authorized",true).put("_connection",connection).put("interaction",true).put("interactionState","continue").put("detail",item.optString("body"))
            save(c,waiting); notify(c,waiting); return
        }
        runCommand(activity ?: c, item)
        (activity as? DeviceDecisionActivity)?.finish()
    }
    fun continueAuthorized(activity: Activity, item: JSONObject) {
        if(!item.optBoolean("authorized") || service?.connectionId != item.optString("_connection") || item.optLong("expiresAt") <= System.currentTimeMillis()) return
        runCommand(activity,item)
    }
    fun decide(activity: Activity, item: JSONObject, approved: Boolean) {
        val id = item.optString("id")
        fun feedback(message: String) { android.widget.Toast.makeText(activity, message, android.widget.Toast.LENGTH_LONG).show() }
        if (service == null || status.value != "Connected" || item.optString("_connection") != service?.connectionId || item.optLong("expiresAt") < System.currentTimeMillis()) { feedback("Request expired or disconnected"); return }
        if (!approved) {
            receipt(activity, id, "rejected")
            inbox.value = inbox.value.filter { it.optString("id") != id }; persist(activity)
            cancelNotification(activity,id)
            return
        }
        if (inbox.value.none { it.optString("id") == id }) return
        if (service?.send(JSONObject().put("type", "receipt").put("id", id).put("status", "approved")) != true) { feedback("Reconnect before approving"); return }
        // Remove before execution: a second tap cannot run the command again.
        if (inbox.value.none { it.optString("id") == id }) return
        inbox.value = inbox.value.filter { it.optString("id") != id }; persist(activity)
        cancelNotification(activity,id)
        runCommand(activity,item)
    }
    private fun runCommand(activity: Context, item: JSONObject) {
        val id = item.optString("id")
        val executed = prefs(activity).getStringSet("authorizedExecuted",emptySet())!!
        if(id in executed) return
        prefs(activity).edit().putStringSet("authorizedExecuted",(executed.toList().takeLast(99)+id).toSet()).commit()
        val interaction = inbox.value.firstOrNull { it.optString("id") == id && it.optBoolean("interaction") }
        if(interaction != null) save(activity,JSONObject(interaction.toString()).put("interactionState","answered").put("authorized",false))
        else { inbox.value = inbox.value.filter { it.optString("id") != id }; persist(activity) }
        cancelNotification(activity,id)
        try {
            if (quiet(activity) && item.optString("action") in setOf("watch_haptic", "phone_notify")) { receipt(activity, id, "suppressed"); return }
            var handedOff = false
            when (item.optString("action")) {
                "phone_control_approve" -> {
                    require(kind(activity) == "phone")
                    // Consent only: the desktop executes the exact displayed finite plan.
                    // Hide the consent inbox before inspection, restoring the previous app.
                    (activity as? Activity)?.moveTaskToBack(true)
                    val approvedConnection = service?.connectionId
                    Handler(Looper.getMainLooper()).postDelayed({
                        if (service?.connectionId == approvedConnection && item.optLong("expiresAt") >= System.currentTimeMillis()) receipt(activity, id, "done")
                    }, 700)
                    return
                }
                "watch_haptic" -> if (!quiet(activity)) activity.getSystemService(Vibrator::class.java).vibrate(VibrationEffect.createOneShot(70, VibrationEffect.DEFAULT_AMPLITUDE))
                "watch_show_card", "phone_notify" -> {
                    val card = JSONObject(item.toString()).put("command", false)
                    if(interaction == null) save(activity, card)
                    else card.put("interaction",true)
                    notify(activity, card)
                }
                "phone_open_url" -> {
                    require(kind(activity) == "phone"); val uri = Uri.parse(item.getString("url")); require(uri.scheme == "https" && uri.userInfo == null)
                    activity.startActivity(Intent(Intent.ACTION_VIEW, uri)); handedOff = true
                }
                "phone_open_app" -> {
                    require(kind(activity) == "phone")
                    val appPackage = item.getString("packageName")
                    require(appPackage.matches(Regex("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+")))
                    val launch = activity.packageManager.getLaunchIntentForPackage(appPackage) ?: error("App is not installed or cannot be opened")
                    activity.startActivity(launch); handedOff = true
                }
                "phone_set_alarm" -> {
                    require(kind(activity) == "phone")
                    val hour = item.getInt("hour"); val minute = item.getInt("minute")
                    require(hour in 0..23 && minute in 0..59)
                    activity.startActivity(Intent(AlarmClock.ACTION_SET_ALARM).putExtra(AlarmClock.EXTRA_HOUR, hour)
                        .putExtra(AlarmClock.EXTRA_MINUTES, minute).putExtra(AlarmClock.EXTRA_MESSAGE, item.optString("title"))
                        .putExtra(AlarmClock.EXTRA_SKIP_UI, false)); handedOff = true
                }
                "phone_set_timer" -> {
                    require(kind(activity) == "phone"); val seconds = item.getInt("seconds"); require(seconds in 1..86400)
                    activity.startActivity(Intent(AlarmClock.ACTION_SET_TIMER).putExtra(AlarmClock.EXTRA_LENGTH, seconds).putExtra(AlarmClock.EXTRA_MESSAGE, item.optString("title")).putExtra(AlarmClock.EXTRA_SKIP_UI, false)); handedOff = true
                }
                else -> throw IllegalArgumentException("Unknown action")
            }
            receipt(activity, id, if (handedOff) "handed_off" else "done")
        } catch (_: Exception) { receipt(activity, id, "failed"); android.widget.Toast.makeText(activity,"No compatible app could complete this request",android.widget.Toast.LENGTH_LONG).show() }
    }
    private fun cancelNotification(c: Context,id: String) {
        val manager=c.getSystemService(NotificationManager::class.java);manager.cancel(id.hashCode())
        inbox.value.find{it.optString("id")==id}?.let{manager.cancel(DeviceAlerts.notificationId(it))}
    }
    fun notify(c: Context, item: JSONObject) {
        val response = DeviceAlerts.kind(item) == "Reply"
        val responseChat = DeviceAlerts.chat(item)
        if(response && responseChat != null) LiveAgentNotifications.finished(c,responseChat)
        if(response && (AssistantVisibility.visible || foregroundActivity.get()?.hasWindowFocus()==true))return
        if(response && !prefs(c).getBoolean("replyAlerts",true))return
        if (quiet(c)) return
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val manager = c.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("ally-device", "Ally cards and requests", NotificationManager.IMPORTANCE_DEFAULT).apply { enableVibration(true) })
        // Routine cards use the existing quiet channel. Decisions need a visible
        // heads-up category, while still respecting app/OS and legacy channel denial.
        val approval = DeviceAlerts.blocking(item)
        if (manager.getNotificationChannel("ally-device")?.importance == NotificationManager.IMPORTANCE_NONE) return
        val channel = if (approval) "ally-approvals" else "ally-device"
        if (approval) manager.createNotificationChannel(NotificationChannel(channel, "Ally approval requests", NotificationManager.IMPORTANCE_HIGH).apply { enableVibration(true) })
        val id = item.optString("id")
        val chatId = DeviceAlerts.chat(item).orEmpty()
        val openIntent = alertIntent(c,item)
        val open = PendingIntent.getActivity(c, id.hashCode(), openIntent.putExtra("id", id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val dismiss = PendingIntent.getBroadcast(c, id.hashCode(), Intent(c, DeviceDismissReceiver::class.java).putExtra("id", id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val title = if(item.optBoolean("authorized")) "Continue approved action" else if (item.optBoolean("command")) "Approve: ${item.optString("action").replace('_', ' ')}" else "${DeviceAlerts.kind(item)} · ${item.optString("title")}"
        val icon=c.resources.getIdentifier("ic_ally","drawable",c.packageName).takeIf{it!=0} ?: android.R.drawable.ic_dialog_info
        val builder = Notification.Builder(c, channel).setSmallIcon(icon)
            .setContentTitle(title.take(80)).setContentText(item.optString("body").take(160)).setStyle(Notification.BigTextStyle().bigText(item.optString("body").take(if(response) 280 else 1200)))
            .setCategory(if(item.optBoolean("interaction") || response) Notification.CATEGORY_MESSAGE else Notification.CATEGORY_STATUS).setGroup(if(chatId.isNotBlank()) "ally-chat:$chatId" else "ally-device").setVisibility(Notification.VISIBILITY_PRIVATE).setOnlyAlertOnce(!response)
            .setContentIntent(open).setDeleteIntent(dismiss).setAutoCancel(true)
        DeviceInteractions.notificationActions(item).forEach { (value,label) ->
            val connection=item.optString("_connection")
            val intent=Intent(c,DeviceDecisionReceiver::class.java).setData(android.net.Uri.parse("ally-decision://request/"+android.net.Uri.encode(id)+"/"+android.net.Uri.encode(connection)+"/"+value)).putExtra("id",id).putExtra("decision",value).putExtra("connection",connection)
            val pending=if(DeviceInteractions.needsForeground(item,value))PendingIntent.getActivity(c,0,intent.setClass(c,DeviceDecisionActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                else PendingIntent.getBroadcast(c,0,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val action=Notification.Action.Builder(null,label,pending)
            if(Build.VERSION.SDK_INT>=31)action.setAuthenticationRequired(true)
            builder.addAction(action.build())
        }
        manager.notify(DeviceAlerts.notificationId(item),builder.build())
    }
}

class DeviceDecisionReceiver : BroadcastReceiver() {
    override fun onReceive(context:Context,intent:Intent) {
        val id=intent.getStringExtra("id") ?: return
        val decision=intent.getStringExtra("decision") ?: return
        val connection=intent.getStringExtra("connection") ?: return
        DeviceLink.answerNotification(context,id,decision,connection)
    }
}
/** No-UI screen behind Allow on app-opening actions: Android lets the approved command start the app from here. */
class DeviceDecisionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id=intent.getStringExtra("id"); val decision=intent.getStringExtra("decision"); val connection=intent.getStringExtra("connection")
        if(id==null || decision==null || connection==null || !DeviceLink.answerFromScreen(this,id,decision,connection)) { finish(); return }
        // The approved command normally arrives within a second; otherwise "Continue approved action" remains.
        Handler(Looper.getMainLooper()).postDelayed({ if(!isFinishing) finish() }, 8000)
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
    private var surfaceRefresh: Job? = null
    private var surfaceDirty = false
    private fun refreshSurfaces() {
        surfaceDirty=true
        if(surfaceRefresh?.isActive==true) return
        surfaceRefresh=scope.launch {
            do {
                surfaceDirty=false; delay(250)
                SurfaceStatus.refresh(this@DeviceLinkService)
            } while(surfaceDirty && isActive)
        }
    }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() { super.onCreate(); DeviceLink.service = this }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!DeviceLink.prefs(this).getBoolean("deviceConnected", false)) { stopSelf(); return START_NOT_STICKY }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("ally-link", "Ally device connection", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, DeviceLink.inboxIntent(this, "Settings"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val icon=resources.getIdentifier("ic_ally","drawable",packageName).takeIf{it!=0} ?: android.R.drawable.ic_dialog_info
        startForeground(23, Notification.Builder(this, "ally-link").setSmallIcon(icon).setContentTitle("Ally connected")
            .setContentText("Your agent updates").setContentIntent(open).setSound(null).setVibrate(longArrayOf(0)).setOnlyAlertOnce(true).setShowWhen(false).setOngoing(true).build())
        if (socket == null) connect()
        return START_STICKY
    }
    private fun connect() {
        if (!DeviceLink.prefs(this).getBoolean("deviceConnected", false)) return
        val p = DeviceLink.prefs(this)
        val endpoint = p.getString("endpoint", "")!!.trimEnd('/')
        if (!endpoint.startsWith("https://") || p.getString("token", "").isNullOrBlank()) { DeviceLink.status.value = "Configure HTTPS connection first"; stopSelf(); return }
        val id = p.getString("deviceId", null) ?: UUID.randomUUID().toString().also { p.edit().putString("deviceId", it).commit() }
        // Non-secret identity for the explicitly authorized ADB development adapter.
        if (DeviceLink.kind(this) == "phone") java.io.File(filesDir, "phone-control-id").writeText(id)
        connectionId = UUID.randomUUID().toString()
        DeviceLink.status.value = "Connecting…"
        val request = Request.Builder().url(endpoint.replaceFirst("https://", "wss://") + "/v1/devices/live").header("Authorization", "Bearer ${p.getString("token", "")}").build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(JSONObject().put("type", "hello").put("deviceId", id).put("kind", DeviceLink.kind(this@DeviceLinkService))
                    .put("capabilities", org.json.JSONArray().apply { put("device-access-v1");if(DeviceLink.viewerHandler!=null)put("native-viewer-v1");if (DeviceLink.controlHandler != null) put("on-device-control") }).toString())
            }
            override fun onMessage(webSocket: WebSocket, text: String) { scope.launch {
                if (socket !== webSocket) return@launch
                if (text.length > 32000) return@launch
                val msg = runCatching { JSONObject(text) }.getOrNull() ?: return@launch
                when (msg.optString("type")) {
                    "media_result"->if(MediaContinuation.protocol.value)MediaContinuation.receive(msg)
                    "acoustic_challenge","acoustic_error"->if(AcousticLink.available)AcousticLink.handler?.invoke(msg)
                    "viewer_offer","viewer_stop"->if(DeviceAccess.protocol.value)DeviceLink.viewerHandler?.invoke(this@DeviceLinkService,msg)
                    "device_access_state" -> if(DeviceAccess.protocol.value)DeviceAccess.receive(this@DeviceLinkService,msg)
                    "tap_target", "tap_review", "tap_feedback", "tap_unavailable", "tap_rejected","tap_session_status" -> DeviceLink.tapHandler?.invoke(this@DeviceLinkService, msg)
                    "transfer_complete", "transfer_status" -> DeviceLink.transferHandler?.invoke(this@DeviceLinkService, msg)
                    "agent_activity" -> msg.optJSONObject("activity")?.let { SurfaceStatus.save(this@DeviceLinkService,it);LiveAgentNotifications.update(this@DeviceLinkService,it) }
                    "interaction", "interaction_closed", "interaction_ack", "interaction_sync" -> { DeviceLink.interactionEvent(this@DeviceLinkService,msg,connectionId); refreshSurfaces() }
                    "authorized_command" -> DeviceLink.executeAuthorized(this@DeviceLinkService,msg.getJSONObject("command"),connectionId)
                    "control_call" -> {
                        val handler = DeviceLink.controlHandler
                        if (handler == null) webSocket.send(JSONObject().put("type", "control_result").put("id", msg.optString("id")).put("ok", false).put("error", "On-device control isn't available on this device.").toString())
                        else handler(this@DeviceLinkService, msg) { reply -> if (socket === webSocket) webSocket.send(reply.toString()) }
                    }
                    "ready" -> {
                        DeviceAccess.ready(msg.optInt("deviceAccessProtocol")==1)
                        MediaContinuation.ready(msg.optInt("mediaContinuityProtocol")==1)
                        AcousticLink.available=msg.optInt("acousticProtocol")==1
                        backoff = 1000L; DeviceLink.status.value = "Connected"
                        if(DeviceLink.kind(this@DeviceLinkService)=="watch")DeviceAccess.reportMaintenance()
                        DeviceLink.tapHandler?.invoke(this@DeviceLinkService, JSONObject().put("type", "tap_connected"))
                        refreshSurfaces()
                        val queued = JSONArray(p.getString("deviceReceipts", "[]")); for (i in 0 until queued.length()) webSocket.send(queued.getJSONObject(i).toString())
                        p.edit().remove("deviceReceipts").apply()
                    }
                    "card", "command" -> {
                        if(msg.optString("type")=="card") refreshSurfaces()
                        val command = msg.optString("type") == "command"
                        val item = msg.optJSONObject(if (command) "command" else "card") ?: return@launch
                        val itemId = item.optString("id"); if (itemId.isBlank() || itemId.length > 160) return@launch
                        DeviceLink.load(this@DeviceLinkService)
                        val duplicate = DeviceLink.inbox.value.any { it.optString("id") == itemId }
                        if (!duplicate) { item.put("_receivedAt",System.currentTimeMillis()).put("command", command).put("_connection", connectionId); DeviceLink.save(this@DeviceLinkService, item); DeviceLink.notify(this@DeviceLinkService, item) }
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
        LiveAgentNotifications.clear(this@DeviceLinkService)
        socket = null
        DeviceAccess.disconnected()
        MediaContinuation.disconnected()
        AcousticLink.disconnected()
        DeviceLink.viewerHandler?.invoke(this@DeviceLinkService,JSONObject().put("type","viewer_disconnected"))
        DeviceLink.tapHandler?.invoke(this@DeviceLinkService, JSONObject().put("type", "tap_disconnected"))
        SurfaceStatus.failed(this@DeviceLinkService)
        if (code == 401 || code == 403) { DeviceLink.status.value = "Pairing rejected; check token"; DeviceLink.prefs(this@DeviceLinkService).edit().putBoolean("deviceConnected", false).apply(); stopSelf(); return@launch }
        DeviceLink.status.value = "Reconnecting…"; retry?.cancel(); retry = scope.launch { delay(backoff); backoff = (backoff * 2).coerceAtMost(30_000); connect() }
    } }
    fun send(message: JSONObject): Boolean {
        val peer=socket?:return false
        if(message.optString("type")=="viewer_frame"&&peer.queueSize()>300000)return false
        return peer.send(message.toString())
    }
    override fun onDestroy() { AcousticLink.disconnected();MediaContinuation.disconnected();DeviceAccess.disconnected();DeviceLink.viewerHandler?.invoke(this,JSONObject().put("type","viewer_disconnected"));DeviceLink.tapHandler?.invoke(this, JSONObject().put("type", "tap_disconnected")); LiveAgentNotifications.clear(this);DeviceLink.service = null; scope.cancel(); socket?.cancel(); socket = null; client.dispatcher.executorService.shutdown(); DeviceLink.status.value = "Not connected"; super.onDestroy() }
}
