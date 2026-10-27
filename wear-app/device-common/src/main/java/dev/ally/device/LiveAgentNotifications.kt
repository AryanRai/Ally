package dev.ally.device

import android.Manifest
import android.app.*
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import org.json.JSONObject

/** One quiet, replaceable progress notice. Final replies use the existing inbox. */
object LiveAgentNotifications {
    private const val ID = 24
    private const val CHANNEL = "ally-live-agents"
    private val state = LiveAgentState()
    private val rows get() = state.rows
    private var fingerprint = ""
    @Synchronized fun update(c: Context, activity: JSONObject) {
        state.update(AssistantActivityParser.parse(activity).chats)
        render(c)
    }
    @Synchronized fun finished(c: Context, chat: String) {
        state.finish(chat,System.currentTimeMillis());render(c)
    }
    fun clear(c: Context) { state.clear();fingerprint = ""; c.getSystemService(NotificationManager::class.java).cancel(ID) }
    private fun render(c: Context) {
        val manager = c.getSystemService(NotificationManager::class.java)
        if(rows.isEmpty() || DeviceLink.quiet(c) || !DeviceLink.prefs(c).getBoolean("replyAlerts",true)) { manager.cancel(ID);fingerprint="";return }
        if(Build.VERSION.SDK_INT>=33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return
        val lines = rows.map { "${it.title} · ${it.label}\n${it.text.ifBlank { it.detail }.takeLast(500)}" }
        val signature=lines.joinToString("\n\n");if(signature==fingerprint)return;fingerprint=signature
        manager.createNotificationChannel(NotificationChannel(CHANNEL,"Live agent progress",NotificationManager.IMPORTANCE_LOW).apply { setSound(null,null);enableVibration(false);setShowBadge(false) })
        val lead=rows.first()
        val open=PendingIntent.getActivity(c,ID,SurfaceActions.intent(c,"chat",lead.id),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val icon=c.resources.getIdentifier("ic_ally","drawable",c.packageName).takeIf{it!=0} ?: android.R.drawable.ic_dialog_info
        manager.notify(ID,Notification.Builder(c,CHANNEL).setSmallIcon(icon).setContentTitle(if(rows.size==1) lead.title else "${rows.size} agents active")
            .setContentText("${lead.label} · ${lead.text.ifBlank{lead.detail}}".take(180)).setStyle(Notification.BigTextStyle().bigText(signature))
            .setSound(null).setVibrate(longArrayOf(0)).setOnlyAlertOnce(true).setOngoing(true).setShowWhen(false).setVisibility(Notification.VISIBILITY_PRIVATE)
            .setCategory(Notification.CATEGORY_PROGRESS).setContentIntent(open).build())
    }
}
