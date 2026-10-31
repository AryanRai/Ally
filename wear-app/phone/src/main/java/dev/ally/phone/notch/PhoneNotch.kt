package dev.ally.phone.notch
import android.app.*
import android.content.*
import android.os.Build
import android.provider.Settings
import dev.ally.device.*
import dev.ally.phone.*
import kotlinx.coroutines.flow.MutableStateFlow
/** The optional built-in module boundary. No executable plugins, permissions or agent writes. */
internal object PhoneNotch {
    val state = MutableStateFlow(NotchState(null, 0, 0, 0, false))
    val events = MutableStateFlow<List<NotchItem>>(emptyList())
    var expanded = false
    var captureHidden = false
    fun hideForCapture(hide:Boolean){captureHidden=hide;PhoneNotchService.instance?.visibilityChanged()}
    var snoozeUntil = 0L
    fun enabled(c: Context) = DeviceLink.prefs(c).getBoolean("notch.enabled", false)
    fun permission(c: Context) = AllyControlService.instance != null || Settings.canDrawOverlays(c)
    fun resume(c: Context) {
        if (!enabled(c) || !permission(c)) return
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) return
        runCatching { c.startForegroundService(Intent(c, PhoneNotchService::class.java)) }
    }
    fun enable(c: Context, on: Boolean) {
        DeviceLink.prefs(c).edit().putBoolean("notch.enabled", on).apply()
        if (on) resume(c) else { c.stopService(Intent(c, PhoneNotchService::class.java)); events.value = emptyList(); state.value = NotchState(null,0,0,0,false) }
        NotchEvents.listener?.refreshMedia()
    }
    fun event(value: NotchItem) { events.value = (events.value.filterNot { it.key == value.key } + value).takeLast(24) }
    fun remove(key: String) { events.value = events.value.filterNot { it.key == key } }
    fun clearNotifications() { events.value = events.value.filterNot { it.kind == "notification" || it.kind == "media" } }
    fun open(c: Context) {
        if(c.getSystemService(KeyguardManager::class.java).isDeviceLocked) return
        // One existing floating assistant, with no mic/screen capture or app launch.
        // Its explicit Expand action is the only path from here to full chat.
        if(!AllyAssistantService.showMonitor()) android.widget.Toast.makeText(c,"Select Ally as your default assistant to open the floating window",android.widget.Toast.LENGTH_LONG).show()
    }
    fun project(c: Context, phone: PhoneState): NotchState {
        val now = System.currentTimeMillis()
        val connected = DeviceLink.status.value == "Connected"
        val surface = SurfaceStatus.load(c).state
        val requests = DeviceInteractions.pending(DeviceLink.inbox.value, now).filterNot { it.optBoolean("desktopOnly") }
        val items = mutableListOf<NotchItem>()
        requests.forEach { items += NotchItem(it.optString("id"), it.optString("title").take(160), if (connected) "Tap to review your ${it.optString("kind", "request")}" else "Reconnect to answer", "request", it.optLong("expiresAt"), 100, it.optString("chatId")) }
        val control = ControlBridge.visual.value
        val driving = control.visible(now, connected, false, true)
        // Only the newest status line while Ally drives the phone; older ones are in the chat.
        if (driving) items += NotchItem("control:${control.grantId}", if(control.operations>0) "Acting on your phone" else "Phone control active",phone.progress.lastOrNull()?.text?.take(200)?.takeIf { it.isNotBlank() } ?: control.title,"control",control.expiresAt,95,control.chatId)
        val chat = phone.selected?.id
        when {
            phone.recording -> items += NotchItem("recording", "Listening", "Open Ally to finish or cancel", "voice", priority=90,chatId=chat)
            phone.transcribing -> items += NotchItem("transcribing", "Finishing your words…", priority=85,chatId=chat)
            phone.speaking -> items += NotchItem("speaking", "Speaking", phone.selected?.title.orEmpty(), "speech", priority=80,chatId=chat)
            driving -> {}
            phone.busy || phone.externalRunning -> items += NotchItem("working:${phone.progressTurnId}",phone.activity.ifBlank { "Working…" },phone.progress.lastOrNull()?.text?.take(200).orEmpty(),priority=75,chatId=chat)
        }
        if (connected && !surface.stale) surface.chats.filter { it.active }.forEach { items += NotchItem("agent:${it.key}",it.title,it.text.ifBlank { it.detail },priority=if(it.status=="needs_input") 82 else 70,chatId=it.id) }
        items += events.value.filter { it.expiresAt > now }.map{if(it.kind=="timer")it.copy(detail="${((it.expiresAt-now)/1000)/60}m ${((it.expiresAt-now)/1000)%60}s remaining")else it}
        val unread = maxOf(surface.chats.count { it.unread },phone.attentionChats.count { it.unread })
        if(items.isEmpty()) items += NotchItem("selected:$chat",phone.selected?.title ?: "Ally", if(!connected) "Reconnecting" else if(unread>0) "$unread unread" else "Tap to open your chat",chatId=chat)
        return NotchPolicy.project(items,surface.chats.count { it.active },unread,requests.size,connected,now)
    }
}
