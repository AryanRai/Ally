package dev.ally.watch

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.IBinder
import kotlinx.coroutines.*

/** Exists only for an accepted turn. No microphone, model call or idle polling. */
class ReplyMonitor : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var work: Job? = null
    private var active: String? = null
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prefs = getSharedPreferences("ally-watch", 0)
        val turn = intent?.getStringExtra("turn") ?: prefs.getString("turn", null)
        val chat = intent?.getStringExtra("chat") ?: prefs.getString("chatId", "") ?: ""
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("ally-working", "Active Ally request", NotificationManager.IMPORTANCE_LOW))
        startForeground(2, Notification.Builder(this, "ally-working").setSmallIcon(R.drawable.ic_ally)
            .setContentTitle("Ally is working").setContentText("You can lower your wrist. A reply alert will follow.").setOngoing(true).setOnlyAlertOnce(true).build())
        if (turn == null) { stopSelf(); return START_NOT_STICKY }
        if (turn == active && work?.isActive == true) return START_REDELIVER_INTENT
        work?.cancel(); active = turn
        work = scope.launch {
            val api = WatchApi({ prefs.getString("endpoint", "")!! }, { prefs.getString("token", "")!! })
            try {
                withTimeout(15 * 60_000L) {
                    var approvalId = ""
                    while (isActive) {
                        try {
                            val result = api.request("/v1/turns/$turn")
                            val status = result.optString("status")
                            val approval = ApprovalParser.parse(result)
                            if (approval != null && approval.id != approvalId) {
                                approvalId = approval.id
                                WatchNotifications.show(this@ReplyMonitor, "Ally needs your answer", "Open Ally to review this request.", "$turn-${approval.id}", chat)
                            }
                            if (status == "done" || status == "error") {
                                WatchNotifications.show(this@ReplyMonitor, if (status == "done") "Ally has your answer" else "Ally needs attention",
                                    if (status == "done") result.optJSONObject("reply")?.optString("text") ?: "Response ready" else result.optString("error"), turn, chat)
                                return@withTimeout
                            }
                        } catch (e: CancellationException) { throw e }
                        catch (e: Exception) { if (!ConnectionRecovery.canReconnect(e)) return@withTimeout }
                        delay(3000)
                    }
                }
            } catch (_: TimeoutCancellationException) {
                WatchNotifications.show(this@ReplyMonitor, "Check your Ally chat", "Background checking paused. Open Ally to reconnect.", "$turn-timeout", chat)
            } finally { if (active == turn) { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() } }
        }
        return START_REDELIVER_INTENT
    }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }
    companion object {
        fun start(context: Context, turn: String, chat: String): Boolean = runCatching {
            context.startForegroundService(Intent(context, ReplyMonitor::class.java).putExtra("turn", turn).putExtra("chat", chat)); true
        }.getOrDefault(false)
    }
}
