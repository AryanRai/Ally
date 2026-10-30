package dev.ally.phone.notch
import android.app.*
import android.content.*
import android.media.MediaMetadata
import android.media.session.*
import android.os.Handler
import android.os.Looper
import android.service.notification.*
import dev.ally.device.DeviceLink
/** Separate opt-in listener; never widens the existing media-handoff listener's scope. */
class PhoneNotchListener:NotificationListenerService(){
    private val handler=Handler(Looper.getMainLooper())
    override fun onListenerConnected(){NotchEvents.listener=this;runCatching{activeNotifications?.forEach{onNotificationPosted(it)}};refreshMedia()}
    override fun onNotificationPosted(sbn:StatusBarNotification?){sbn ?: return;NotchEvents.post(this,sbn)}
    override fun onNotificationRemoved(sbn:StatusBarNotification?){sbn?.let{NotchEvents.remove(it.key)}}
    private val media=object:Runnable{override fun run(){NotchEvents.media(this@PhoneNotchListener);if(PhoneNotch.enabled(this@PhoneNotchListener)&&DeviceLink.prefs(this@PhoneNotchListener).getBoolean("notch.media",false))handler.postDelayed(this,3000)}}
    internal fun refreshMedia(){handler.removeCallbacks(media);if(PhoneNotch.enabled(this)&&DeviceLink.prefs(this).getBoolean("notch.media",false))handler.post(media)else NotchEvents.clearMedia()}
    override fun onListenerDisconnected(){handler.removeCallbacksAndMessages(null);NotchEvents.clear();NotchEvents.listener=null}
    override fun onDestroy(){handler.removeCallbacksAndMessages(null);NotchEvents.clear();NotchEvents.listener=null;super.onDestroy()}
}
internal object NotchEvents {
    var listener:PhoneNotchListener?=null
    private val opens=mutableMapOf<String,PendingIntent>()
    private val media=mutableMapOf<String,MediaController>()
    private fun allowed(c:Context,pkg:String)=pkg in DeviceLink.prefs(c).getStringSet("notch.apps",emptySet()).orEmpty()
    fun post(c:Context,sbn:StatusBarNotification){
        val prefs=DeviceLink.prefs(c);val n=sbn.notification
        if(!PhoneNotch.enabled(c)||!prefs.getBoolean("notch.events",false))return
        if(sbn.packageName==c.packageName || !allowed(c,sbn.packageName))return
        val title=n.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        if(!NotchPolicy.notificationAllowed(sbn.packageName==c.packageName,allowed(c,sbn.packageName),n.visibility==Notification.VISIBILITY_SECRET,n.category,title))return
        val id="notification:${sbn.key}"
        val label=runCatching{c.packageManager.getApplicationLabel(c.packageManager.getApplicationInfo(sbn.packageName,0)).toString()}.getOrDefault("Notification")
        if(opens.size>=24)opens.keys.firstOrNull()?.let{opens.remove(it);PhoneNotch.remove(it)}
        n.contentIntent?.let{opens[id]=it}
        val now=System.currentTimeMillis()
        val deadline=NotchPolicy.countdown(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER),n.extras.getBoolean(Notification.EXTRA_CHRONOMETER_COUNT_DOWN),n.`when`,now)
        PhoneNotch.event(NotchItem(id,if(deadline!=null)"$label · Timer"else label,if(prefs.getBoolean("notch.notificationText",false))title.take(160)else "New notification · open on phone",if(deadline!=null)"timer"else "notification",deadline ?: (now+120000),if(deadline!=null)35 else 30))
    }
    fun remove(key:String){val id="notification:$key";opens.remove(id);PhoneNotch.remove(id)}
    fun clear(){opens.clear();media.clear();PhoneNotch.clearNotifications()}
    fun clearMedia(){media.keys.toList().forEach{PhoneNotch.remove(it)};media.clear()}
    fun open(c:Context,key:String){if(c.getSystemService(KeyguardManager::class.java).isDeviceLocked)return;val event=PhoneNotch.events.value.firstOrNull{it.key==key&&it.expiresAt>System.currentTimeMillis()} ?: return;runCatching{opens[event.key]?.send()}}
    fun media(c:PhoneNotchListener){
        val prefs=DeviceLink.prefs(c)
        if(!PhoneNotch.enabled(c)||!prefs.getBoolean("notch.media",false)){media.keys.toList().forEach{PhoneNotch.remove(it)};media.clear();return}
        val sessions=runCatching{c.getSystemService(MediaSessionManager::class.java).getActiveSessions(ComponentName(c,PhoneNotchListener::class.java))}.getOrNull().orEmpty()
        val current=mutableSetOf<String>()
        sessions.filter{allowed(c,it.packageName)&&it.playbackState?.state in setOf(PlaybackState.STATE_PLAYING,PlaybackState.STATE_PAUSED)}.take(4).forEach{
            val id="media:${it.packageName}";current+=id;media[id]=it
            PhoneNotch.event(NotchItem(id,if(it.playbackState?.state==PlaybackState.STATE_PLAYING)"Now playing" else "Paused",it.metadata?.getString(MediaMetadata.METADATA_KEY_TITLE)?.take(160).orEmpty(),"media",System.currentTimeMillis()+6000,20))
        }
        (media.keys-current).toList().forEach{media.remove(it);PhoneNotch.remove(it)}
    }
    fun togglePlayback(key:String){val c=listener ?: return;if(c.getSystemService(KeyguardManager::class.java).isDeviceLocked)return;val m=media[key] ?: return;if(!allowed(c,m.packageName)||!DeviceLink.prefs(c).getBoolean("notch.media",false))return;if(m.playbackState?.state==PlaybackState.STATE_PLAYING)m.transportControls.pause()else m.transportControls.play()}
}
