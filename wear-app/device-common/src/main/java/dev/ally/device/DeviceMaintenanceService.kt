package dev.ally.device

import android.app.*
import android.content.*
import android.net.*
import android.os.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow

/** Watch-only, user-started CPU/Wi-Fi lease. Never toggles Bluetooth, Wi-Fi, debugging or settings. */
class DeviceMaintenanceService:Service(){
    companion object {
        const val STOP="maintenance.stop"
        val active=MutableStateFlow(false)
        val detail=MutableStateFlow("Maintenance is off")
        var deadlineElapsed=0L;private set
    }
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
    private val lease=MaintenanceLease(SystemClock::elapsedRealtime)
    private var wake:PowerManager.WakeLock?=null
    private var network:ConnectivityManager.NetworkCallback?=null
    private fun update(text:String){detail.value=text;DeviceAccess.reportMaintenance()}
    override fun onBind(intent:Intent?):IBinder?=null
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        if(intent==null||intent.action==STOP||DeviceLink.kind(this)!="watch"){stopSelf();return START_NOT_STICKY}
        if(active.value)return START_NOT_STICKY
        val manager=getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("ally-maintenance","Watch maintenance",NotificationManager.IMPORTANCE_LOW))
        val open=PendingIntent.getActivity(this,63,Intent(this,DeviceAccessActivity::class.java),PendingIntent.FLAG_IMMUTABLE)
        val stop=PendingIntent.getService(this,64,Intent(this,DeviceMaintenanceService::class.java).setAction(STOP),PendingIntent.FLAG_IMMUTABLE)
        startForeground(63,Notification.Builder(this,"ally-maintenance").setSmallIcon(applicationInfo.icon).setContentTitle("Ally watch maintenance")
            .setContentText("Up to 10 minutes · open Ally for dim awake screen").setContentIntent(open).setOngoing(true)
            .addAction(Notification.Action.Builder(null,"Stop",stop).build()).build())
        lease.start();active.value=true;deadlineElapsed=SystemClock.elapsedRealtime()+lease.remaining()
        wake=getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Ally:maintenance").apply{setReferenceCounted(false);acquire(600000)}
        update("Requesting Wi-Fi. Android controls debugging; leave it enabled manually.")
        val connectivity=getSystemService(ConnectivityManager::class.java)
        val callback=object:ConnectivityManager.NetworkCallback(){
            override fun onAvailable(n:Network){update("Wi-Fi available. Debugging availability is still controlled by Android.")}
            override fun onLost(n:Network){update("Wi-Fi lost. Reconnect manually; no access operation is replayed.")}
            override fun onUnavailable(){update("Wi-Fi request unavailable. Keep watch awake and check its connection manually.")}
        }
        network=callback
        runCatching{connectivity.requestNetwork(NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),callback)}
            .onFailure{network=null;update("Wi-Fi request unavailable; only bounded CPU/Ally screen support is active.")}
        scope.launch{while(lease.active()){delay(1000)};stopSelf()}
        return START_NOT_STICKY
    }
    override fun onDestroy(){
        lease.stop();scope.cancel();network?.let{runCatching{getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it)}};network=null
        wake?.let{if(it.isHeld)it.release()};wake=null;active.value=false;deadlineElapsed=0
        update("Maintenance stopped; CPU/Wi-Fi request released");stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()
    }
}
