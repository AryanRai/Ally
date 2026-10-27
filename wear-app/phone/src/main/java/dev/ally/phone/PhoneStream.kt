package dev.ally.phone
import android.app.*
import android.content.*
import android.os.SystemClock
import dev.ally.device.DeviceLink
import org.json.JSONObject

internal object PhoneStream {
 val lease=NativeViewerLease(SystemClock::elapsedRealtime)
 fun install(){DeviceLink.viewerHandler=handler@ {context,m->when(m.optString("type")){
  "viewer_offer"->{
   if(lease.valid())return@handler
   val ttl=(m.optLong("expiresAt")-System.currentTimeMillis()).coerceAtMost(900000)
   if(runCatching{lease.offer(m.optString("id"),m.optString("token"),ttl)}.isFailure)return@handler
   val manager=context.getSystemService(NotificationManager::class.java)
   manager.createNotificationChannel(NotificationChannel("ally-phone-viewer","Local phone viewer",NotificationManager.IMPORTANCE_DEFAULT))
   val open=PendingIntent.getActivity(context,65,Intent(context,PhoneStreamActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
   runCatching{manager.notify(65,Notification.Builder(context,"ally-phone-viewer").setSmallIcon(R.drawable.ic_ally).setContentTitle("Ally local phone viewer")
    .setContentText("Open to review Android screen sharing. Nothing captured yet.").setContentIntent(open).setAutoCancel(true).build())}
  }
  "viewer_stop"->if(lease.valid(m.optString("id"),m.optString("token")))stop(context)
  "viewer_disconnected"->stop(context)
 }}}
 fun stop(context:Context){
  if(lease.id.isNotBlank())DeviceLink.sendControl(JSONObject().put("type","viewer_end").put("id",lease.id).put("token",lease.token))
  lease.clear();context.stopService(Intent(context,PhoneStreamService::class.java));context.getSystemService(NotificationManager::class.java).cancel(65)
 }
}
