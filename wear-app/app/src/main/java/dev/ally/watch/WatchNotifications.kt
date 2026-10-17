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
    fun show(context: Context, title: String, text: String) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("ally-replies", "Ally responses", NotificationManager.IMPORTANCE_DEFAULT))
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        manager.notify(1, Notification.Builder(context, "ally-replies").setSmallIcon(R.drawable.ic_ally)
            .setContentTitle(title.take(80)).setContentText(text.take(160)).setContentIntent(open).setAutoCancel(true).build())
    }
}
