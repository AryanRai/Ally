package dev.ally.device

import android.app.*
import android.content.*
import android.os.*
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import java.util.UUID

/** Ephemeral private QR display only; no QR/pairing secret in saved preferences or notifications. */
internal object DeviceAccess {
    val protocol=MutableStateFlow(false)
    val state=MutableStateFlow(JSONObject())
    private var qrDeadline=0L
    fun disconnected(){protocol.value=false;state.value=JSONObject().put("state","disconnected").put("detail","PC disconnected. QR cleared.");qrDeadline=0}
    fun ready(value:Boolean){protocol.value=value}
    fun receive(context:Context,message:JSONObject){
        val value=JSONObject(message.toString())
        val qr=value.optString("qrData")
        if(qr.isNotBlank()&&qr!="null"){
            if(!qr.startsWith("data:image/png;base64,")||qr.length>16000||value.optString("state")!="waiting_for_scan")return
            val ttl=(value.optLong("expiresAt")-System.currentTimeMillis()).coerceIn(0,360000)
            if(ttl<=0)return
            qrDeadline=SystemClock.elapsedRealtime()+ttl
        }else qrDeadline=0
        state.value=value
        if(value.optString("state") in listOf("waiting_for_scan","maintenance_offer")){
            val manager=context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel("ally-device-access","Device access",NotificationManager.IMPORTANCE_DEFAULT))
            val open=PendingIntent.getActivity(context,62,Intent(context,DeviceAccessActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            runCatching{manager.notify(62,Notification.Builder(context,"ally-device-access").setSmallIcon(context.applicationInfo.icon)
                .setContentTitle("Ally device access").setContentText("Open to review pairing or watch maintenance.").setContentIntent(open).setAutoCancel(true).build())}
        }
    }
    fun qrRemaining():Long=(qrDeadline-SystemClock.elapsedRealtime()).coerceAtLeast(0)
    fun requestPair():Boolean {
        if(!protocol.value||DeviceLink.status.value!="Connected")return false
        state.value=JSONObject().put("state","requesting").put("detail","Preparing a native phone-pairing QR…")
        val sent=DeviceLink.sendControl(JSONObject().put("type","device_access_request").put("action","pair_phone").put("requestId",UUID.randomUUID().toString()))
        if(!sent)state.value=JSONObject().put("state","failed").put("detail","PC disconnected. No pairing started.")
        return sent
    }
    fun stop(){
        val id=state.value.optString("id")
        if(protocol.value&&DeviceLink.status.value=="Connected"&&id.matches(Regex("[\\w-]{8,80}")))DeviceLink.sendControl(JSONObject().put("type","device_access_request").put("action","stop").put("sessionId",id))
        state.value=JSONObject().put("state","stopped").put("detail","Stopped. Android pairing trust is managed on the phone.");qrDeadline=0
    }
    fun clearExpiredQr(){if(state.value.optString("qrData").startsWith("data:")&&qrRemaining()==0L){state.value=JSONObject(state.value.toString()).put("qrData",JSONObject.NULL).put("detail","QR expired. Start a new pairing request.")}}
    fun reportMaintenance(){
        if(!protocol.value||DeviceLink.status.value!="Connected")return
        DeviceLink.sendControl(JSONObject().put("type","device_access_request").put("action","maintenance_status")
            .put("active",DeviceMaintenanceService.active.value).put("remainingMs",(DeviceMaintenanceService.deadlineElapsed-SystemClock.elapsedRealtime()).coerceIn(0,600000))
            .put("detail",DeviceMaintenanceService.detail.value.take(240)))
    }
}
