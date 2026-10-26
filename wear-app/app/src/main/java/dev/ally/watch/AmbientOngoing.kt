package dev.ally.watch

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status

/**
 * Wear OS returns ambient apps to the watch face after about a minute unless they hold an Ongoing Activity
 * (how media apps stay up). This silent marker exists only while Ally is on screen; live progress stays
 * in the shared device notification.
 */
object AmbientOngoing {
    private const val ID = 31
    private const val CHANNEL = "ally-always-on"

    fun show(c: Context) {
        if(Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val manager = NotificationManagerCompat.from(c)
        manager.createNotificationChannel(NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_LOW)
            .setName("Always-on Ally").setShowBadge(false).setVibrationEnabled(false).setSound(null, null).build())
        val open = PendingIntent.getActivity(c, ID, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationCompat.Builder(c, CHANNEL).setSmallIcon(R.drawable.ic_ally).setContentTitle("Ally")
            .setContentText("Open on your watch").setContentIntent(open).setOngoing(true).setSilent(true).setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_STATUS).setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        OngoingActivity.Builder(c, ID, builder).setStaticIcon(R.drawable.ic_ally).setTouchIntent(open)
            .setStatus(Status.Builder().addTemplate("Ally").build()).build().apply(c)
        try { manager.notify(ID, builder.build()) } catch(_: SecurityException) {}
    }

    fun hide(c: Context) = NotificationManagerCompat.from(c).cancel(ID)
}
