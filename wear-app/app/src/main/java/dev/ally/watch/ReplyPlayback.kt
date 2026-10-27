package dev.ally.watch

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import java.util.UUID

/** Keeps an already requested reply audible while Wear OS dims or sleeps the display. */
class ReplyPlayback : Service() {
    private var wake: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private val expire = Runnable { (application as AllyWatchApplication).model.stopSpeaking(); stopSelf() }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            if (intent.getStringExtra("session") == active) (application as AllyWatchApplication).model.stopSpeaking()
            return START_NOT_STICKY
        }
        val session = intent?.getStringExtra("session")
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Reply audio", NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null) })
        val stop = PendingIntent.getService(this, 32, Intent(this, ReplyPlayback::class.java).setAction(STOP).putExtra("session", session), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val open = PendingIntent.getActivity(this, 32, Intent(this, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        startForeground(32, Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_ally)
            .setContentTitle("Ally is speaking").setContentText("Reply audio continues with the screen dimmed")
            .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_TRANSPORT)
            .addAction(Notification.Action.Builder(null, "Stop audio", stop).build()).build())
        if (session == null || session != active) { stopSelfResult(startId); return START_NOT_STICKY }
        if (wake == null) wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:reply-audio").apply { setReferenceCounted(false) }
        wake?.acquire(MAX_MS)
        handler.removeCallbacks(expire); handler.postDelayed(expire, MAX_MS)
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        handler.removeCallbacks(expire)
        wake?.let { if (it.isHeld) it.release() }; wake = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
    companion object {
        const val MAX_MS = 10 * 60_000L
        private const val CHANNEL = "ally-reply-audio"
        private const val STOP = "dev.ally.watch.STOP_REPLY_AUDIO"
        @Volatile private var active: String? = null
        fun begin(context: Context): String {
            val session = UUID.randomUUID().toString(); active = session
            try { context.startForegroundService(Intent(context, ReplyPlayback::class.java).putExtra("session", session)) }
            catch (e: Exception) { if (active == session) active = null; throw e }
            return session
        }
        fun end(context: Context, session: String?) {
            if (session != null && session == active) { active = null; context.stopService(Intent(context, ReplyPlayback::class.java)) }
        }
        fun renew(context: Context, session: String?) {
            if (session != null && session == active) context.startService(Intent(context, ReplyPlayback::class.java).putExtra("session", session))
        }
    }
}
