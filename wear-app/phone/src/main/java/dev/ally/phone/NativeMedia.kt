package dev.ally.phone
import android.content.*
import android.media.MediaMetadata
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import dev.ally.device.DeviceLink
import dev.ally.device.MediaContinuation
import org.json.JSONObject

/** Notification access is solely used to query media sessions. Notification bodies are never read. */
class AllyMediaListener:NotificationListenerService()
internal object NativeMedia {
 fun install(){
  MediaContinuation.snapshot={c,pkg,text->snapshot(c,pkg,text)}
  MediaContinuation.review={c,value->c.startActivity(Intent(c,MediaHandoffActivity::class.java).putExtra("media",value.toString()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}
 }
 fun snapshot(c:Context,pkg:String?,text:String?):JSONObject?{
  val shared=text?.split(Regex("\\s+"))?.mapNotNull{MediaHandoffRules.youtube(it)}?.distinct()?.singleOrNull()
  if(!DeviceLink.prefs(c).getBoolean("media.enabled",false))return shared?.let{JSONObject().put("url",it).put("urlSource","explicit_android_share").put("reason","Enter the playback position; native media access is off.")}
  if(pkg!=null&&pkg !in listOf("com.google.android.youtube","com.spotify.music")&&shared==null)return null
  val sessions=runCatching{c.getSystemService(MediaSessionManager::class.java).getActiveSessions(ComponentName(c,AllyMediaListener::class.java))}.getOrNull()
  val candidates=sessions?.filter{it.packageName in listOf("com.google.android.youtube","com.spotify.music")&&(pkg==null||it.packageName==pkg)}.orEmpty()
  val active=candidates.filter{it.playbackState?.state==PlaybackState.STATE_PLAYING}.let{if(it.size==1)it.single()else candidates.singleOrNull()}
  if(active==null&&shared==null&&pkg==null)return null
  val out=JSONObject().put("observedAt",System.currentTimeMillis()).put("reason",if(sessions==null)"Enable Ally media notification access, or share a video URL and enter its position." else "App did not supply a supported video link/position. Share the original YouTube URL and enter its position.")
  if(shared!=null)out.put("url",shared).put("urlSource","explicit_android_share")
  if(active!=null){
   val metadata=active.metadata;val state=active.playbackState
   out.put("package",active.packageName)
   val raw=metadata?.getString(MediaMetadata.METADATA_KEY_MEDIA_URI)?:metadata?.description?.mediaUri?.toString()?:metadata?.getString(MediaMetadata.METADATA_KEY_MEDIA_ID)
   val nativeUrl=MediaHandoffRules.youtube(raw)?:raw?.takeIf{active.packageName=="com.google.android.youtube"&&it.matches(Regex("[A-Za-z0-9_-]{11}"))}?.let{"https://www.youtube.com/watch?v=$it"}
   if(shared==null||shared==nativeUrl)metadata?.getString(MediaMetadata.METADATA_KEY_TITLE)?.take(240)?.let{out.put("title",it).put("titleSource","android_media_session")}
   if(shared==null&&nativeUrl!=null)out.put("url",nativeUrl).put("urlSource","android_media_session_identifier")
   // Never attach an unrelated background session's position to a shared video.
   if(nativeUrl!=null&&(shared==null||shared==nativeUrl)&&state!=null){
    MediaHandoffRules.position(state.position,state.lastPositionUpdateTime,SystemClock.elapsedRealtime(),state.playbackSpeed,state.state==PlaybackState.STATE_PLAYING,metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION)?:0)?.let{out.put("positionMs",it).put("positionSource","android_media_session")}
   }
  }
  return out
 }
}
