package dev.ally.watch

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

/** Shared entry point for response alerts and a future authenticated push transport. */
object WatchNotifications {
    @Volatile var foreground = false
    @Synchronized fun show(context: Context, title: String, text: String, id: String, chat: String) {
        // The shared authenticated device feed owns completion/approval alerts.
        // Keep this path only for installations that have not enabled that feed.
        if(dev.ally.device.DeviceLink.prefs(context).getBoolean("deviceConnected",false) && dev.ally.device.DeviceLink.status.value=="Connected")return
        val prefs = context.getSharedPreferences("ally-watch", 0)
        if (!prefs.getBoolean("replyAlerts", true) || prefs.getBoolean("muted", false)) return
        val seen = prefs.getStringSet("notifiedTurns", emptySet())!!.toMutableSet()
        if (id in seen) return
        seen.add(id); prefs.edit().putStringSet("notifiedTurns", seen.toList().takeLast(100).toSet()).commit()
        if (foreground) return
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("ally-replies", "Ally responses", NotificationManager.IMPORTANCE_DEFAULT))
        val open = PendingIntent.getActivity(context, id.hashCode(), Intent(context, MainActivity::class.java).putExtra("openChat", chat).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        manager.notify(id.hashCode(), Notification.Builder(context, "ally-replies").setSmallIcon(R.drawable.ic_ally)
            .setContentTitle(title.take(80)).setContentText(text.take(160)).setContentIntent(open).setAutoCancel(true).build())
    }
}
