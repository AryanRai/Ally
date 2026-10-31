package dev.ally.phone.codex

import android.app.*
import android.content.*
import android.os.IBinder
import dev.ally.phone.R
import kotlinx.coroutines.*

/** User-visible lifetime only: sign-in or an active phone turn. Never restarts silently. */
class CodexPhoneService:Service(){
    private var awake:android.os.PowerManager.WakeLock?=null
    override fun onBind(intent:Intent?):IBinder?=null
    override fun onCreate(){super.onCreate();channel(this);startForeground(NOTICE,notice(this));instance=this
        awake=getSystemService(android.os.PowerManager::class.java).newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK,"Ally:PhoneCodex").apply{acquire(55*60_000L)}
    }
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {if(intent?.action=="stop") {PhoneCodex.stopAll();stopSelf()};return START_NOT_STICKY}
    override fun onDestroy(){instance=null;PhoneCodex.stopAll();awake?.let{if(it.isHeld)it.release()};awake=null;super.onDestroy()}
    companion object {
        private const val CHANNEL="ally-phone-codex"
        private const val NOTICE=81
        @Volatile private var instance:CodexPhoneService?=null
        private fun channel(c:Context)=c.getSystemService(NotificationManager::class.java).also {it.createNotificationChannel(NotificationChannel(CHANNEL,"Codex running on phone",NotificationManager.IMPORTANCE_LOW))}
        private fun notice(c:Context):Notification {
            val stop=PendingIntent.getService(c,NOTICE,Intent(c,CodexPhoneService::class.java).setAction("stop"),PendingIntent.FLAG_IMMUTABLE)
            val open=PendingIntent.getActivity(c,NOTICE,Intent(c,CodexPhoneActivity::class.java),PendingIntent.FLAG_IMMUTABLE)
            return Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_ally).setContentTitle("Ally · Codex on this phone")
                .setContentText("Working or signing in · Stop ends it immediately").setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
                .addAction(Notification.Action.Builder(null,"Stop",stop).build()).build()
        }
        fun start(c:Context){c.startForegroundService(Intent(c,CodexPhoneService::class.java))}
        fun idle(c:Context){c.stopService(Intent(c,CodexPhoneService::class.java))}
        private const val REVIEW_CHANNEL="ally-phone-codex-approvals"
        /** Heads-up, so a decision is seen without opening Ally over the app the agent is using. */
        private fun reviewChannel(c:Context)=c.getSystemService(NotificationManager::class.java).also {it.createNotificationChannel(NotificationChannel(REVIEW_CHANNEL,"Phone agent approvals",NotificationManager.IMPORTANCE_HIGH))}
        internal fun reviewNotice(c:Context,p:LocalDecision){reviewChannel(c);val open=PendingIntent.getActivity(c,82,Intent(c,CodexReviewActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val builder=Notification.Builder(c,REVIEW_CHANNEL).setSmallIcon(R.drawable.ic_ally).setContentTitle("Ally · approval needed").setContentText(p.title)
                .setStyle(Notification.BigTextStyle().bigText(p.body.take(1200))).setContentIntent(open).setAutoCancel(true)
            // A plain yes/no is answered from the notification (after unlock); forms with fields open the review.
            if(p.form.fields.isEmpty()) listOf("allow" to "Allow","deny" to "Deny").forEachIndexed { index,(value,label) ->
                val intent=Intent(c,PhoneDecisionReceiver::class.java).setData(android.net.Uri.parse("ally-phone-decision://${p.id}/$value")).putExtra("id",p.id).putExtra("decision",value)
                val action=Notification.Action.Builder(null,label,PendingIntent.getBroadcast(c,83+index,intent,PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
                if(android.os.Build.VERSION.SDK_INT>=31)action.setAuthenticationRequired(true)
                builder.addAction(action.build())
            }
            c.getSystemService(NotificationManager::class.java).notify(82,builder.build())}
        fun clearReview(c:Context){c.getSystemService(NotificationManager::class.java).cancel(82)}
    }
}
