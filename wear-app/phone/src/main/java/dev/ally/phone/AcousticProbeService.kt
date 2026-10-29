package dev.ally.phone
import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.*
import android.os.*
import dev.ally.device.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import java.util.UUID

/** User-started ongoing toggle; every microphone check is bounded. PCM is discarded. */
class AcousticProbeService:Service(){
 companion object {
  var instance:AcousticProbeService?=null;private set
  val active=MutableStateFlow(false);val status=MutableStateFlow("Acoustic confirmation is off")
  private var level:Double?=null;private var measuredAt=0L
  fun install(){AcousticLink.handler={instance?.message(it)}}
  fun readiness(c:Context):String{
   val p=DeviceLink.prefs(c)
   if(p.getBoolean("acoustic.calibrated",false)&&p.contains("acoustic.threshold"))return "Audio calibration saved"
   fun count(key:String)=p.getString(key,"").orEmpty().split(',').count{it.toDoubleOrNull()?.isFinite()==true}.coerceAtMost(3)
   return "Audio calibration NOT saved: near ${count("acoustic.nearLevels")}/3, far ${count("acoustic.farLevels")}/3. Handoff is blocked while audio is required."
  }
  // Covers the 3s hold + 8s explicit swipe offer + bounded PC confirmation, without another chirp.
  fun near(c:Context)=active.value&&level?.let{SystemClock.elapsedRealtime()-measuredAt in 0..15000&&it>=DeviceLink.prefs(c).getFloat("acoustic.threshold",0f)}==true
  fun far(c:Context)=active.value&&level?.let{SystemClock.elapsedRealtime()-measuredAt in 0..5000&&it<DeviceLink.prefs(c).getFloat("acoustic.threshold",0f)-2f}==true
 }
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
 @Volatile private var pending:String?=null
 @Volatile private var challenge:IntArray?=null
 private var job:Job?=null
 @Volatile private var record:AudioRecord?=null
 val checking get()=job?.isCompleted==false
 private val nearSamples=mutableListOf<Double>();private val farSamples=mutableListOf<Double>()
 private val locked=object:BroadcastReceiver(){override fun onReceive(c:Context,i:Intent){pauseChecks("Phone locked; audio proximity stays enabled and pauses checks until unlocked")}}
 override fun onCreate(){super.onCreate();
  fun restore(key:String)=DeviceLink.prefs(this).getString(key,"").orEmpty().split(',').mapNotNull{it.toDoubleOrNull()?.takeIf{v->v.isFinite()}}.takeLast(3)
  nearSamples.addAll(restore("acoustic.nearLevels"));farSamples.addAll(restore("acoustic.farLevels"))
  if(Build.VERSION.SDK_INT>=33)registerReceiver(locked,IntentFilter(Intent.ACTION_SCREEN_OFF),RECEIVER_NOT_EXPORTED)else registerReceiver(locked,IntentFilter(Intent.ACTION_SCREEN_OFF))}
 override fun onBind(intent:Intent?)=null
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
  if(intent?.action=="stop"){DeviceLink.prefs(this).edit().putBoolean("acoustic.enabled",false).apply();status.value="Audio proximity stopped";stopSelf();return START_NOT_STICKY}
  if(active.value)return START_NOT_STICKY
  if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED||!AcousticLink.available||!getSystemService(NotificationManager::class.java).areNotificationsEnabled()){status.value="Allow microphone/notifications normally and activate the acoustic PC build first";stopSelf();return START_NOT_STICKY}
  val manager=getSystemService(NotificationManager::class.java);manager.createNotificationChannel(NotificationChannel("ally-acoustic","Acoustic proximity session",NotificationManager.IMPORTANCE_LOW))
  val stop=PendingIntent.getService(this,71,Intent(this,AcousticProbeService::class.java).setAction("stop"),PendingIntent.FLAG_IMMUTABLE)
  val open=PendingIntent.getActivity(this,72,Intent(this,AcousticSettingsActivity::class.java),PendingIntent.FLAG_IMMUTABLE)
  try{startForeground(71,Notification.Builder(this,"ally-acoustic").setSmallIcon(R.drawable.ic_ally).setContentTitle("Ally audio proximity is on").setContentText("On until Stop · bounded local chirp checks · paused while locked").setContentIntent(open).setOngoing(true).addAction(Notification.Action.Builder(null,"Stop",stop).build()).build(),ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)}catch(e:Exception){status.value="Android refused microphone session. Start again while Ally is visible: ${e.message?.take(100)}";stopSelf();return START_NOT_STICKY}
  DeviceLink.prefs(this).edit().putBoolean("acoustic.enabled",true).apply()
  instance=this;active.value=true
  DeviceLink.sendControl(JSONObject().put("type","acoustic_enable").put("enabled",true))
  status.value=readiness(this)+". Session ready; keep volume/orientation unchanged."
  return START_NOT_STICKY
 }
 fun message(m:JSONObject){
  if(m.optString("type")=="acoustic_disconnected"){pauseChecks("Disconnected; audio proximity stays enabled and waits for paired PC");return}
  if(m.optString("requestId")!=pending)return
  if(m.optString("type")=="acoustic_error"){status.value=m.optString("message");job?.cancel();return}
  val values=m.optJSONArray("symbols")?:return
  if(values.length()==8){val code=IntArray(8){values.optInt(it,-1)};if(code.all{it in 0..3})challenge=code}
 }
 fun probe(calibration:String?=null){
  if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){status.value="Microphone permission is not granted";stopSelf();return}
  if(checking||!active.value)return
  if(!AcousticLink.available||DeviceLink.status.value!="Connected"){status.value="Waiting for paired PC; no microphone check started";return}
  if((application as AllyPhoneApplication).model.state.value.recording){status.value="Finish voice recording before an acoustic check";return}
  if(!getSystemService(PowerManager::class.java).isInteractive||getSystemService(KeyguardManager::class.java).isDeviceLocked)return
  level=null;pending=UUID.randomUUID().toString();challenge=null
  job=scope.launch{
   try{
    val value=withContext(Dispatchers.IO){
     if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw SecurityException("Microphone permission was revoked")
     val pcm=ShortArray(67200)
     val mic=AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.UNPROCESSED).setAudioFormat(AudioFormat.Builder().setSampleRate(16000).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build()).setBufferSizeInBytes(32768).build()
     record=mic
     try{
      check(mic.state==AudioRecord.STATE_INITIALIZED){"Microphone unavailable"};mic.startRecording()
      // Renew only from this explicitly started foreground service. Socket/PC lock still revoke grants.
      check(DeviceLink.sendControl(JSONObject().put("type","acoustic_enable").put("enabled",true))){"PC disconnected"}
      check(DeviceLink.sendControl(JSONObject().put("type","acoustic_probe").put("requestId",pending))){"PC disconnected"}
      var count=0;val start=SystemClock.elapsedRealtime()
      while(count<pcm.size&&SystemClock.elapsedRealtime()-start<4200){ensureActive();if(getSystemService(KeyguardManager::class.java).isDeviceLocked||!getSystemService(PowerManager::class.java).isInteractive)error("Phone locked; acoustic check cancelled");val n=mic.read(pcm,count,pcm.size-count,AudioRecord.READ_NON_BLOCKING);if(n<0)error("Microphone read failed");count+=n;delay(10)}
      mic.stop() // Do not keep recording while the local matcher processes the bounded buffer.
      val samples=pcm.copyOf(count)
      try{challenge?.let{AcousticSignal.detect(samples,it)}}finally{samples.fill(0)}
     }finally{runCatching{mic.stop()};runCatching{mic.release()};record=null;pcm.fill(0)}
    }
    if(value==null){status.value="Fresh PC chirp not verified. No proximity confirmation; check audio output/permissions.";return@launch}
    if(calibration!=null){
     val samples=if(calibration=="near")nearSamples else farSamples
     val retained=AcousticSignal.retained(samples,value);samples.clear();samples.addAll(retained)
     DeviceLink.prefs(this@AcousticProbeService).edit().putString("acoustic.nearLevels",nearSamples.joinToString(",")).putString("acoustic.farLevels",farSamples.joinToString(",")).apply()
     val threshold=AcousticSignal.threshold(nearSamples,farSamples)
     if(threshold!=null)DeviceLink.prefs(this@AcousticProbeService).edit().putFloat("acoustic.threshold",threshold.toFloat()).putBoolean("acoustic.calibrated",true).apply()
     status.value=when{
      threshold!=null->"Audio near/far SAVED. Move away, then approach with YouTube open; hold and swipe to review."
      nearSamples.size>=3&&farSamples.size>=3->"Calibration NOT saved: audio levels overlap. Near ${nearSamples.min().toInt()}..${nearSamples.max().toInt()} dBFS; far ${farSamples.min().toInt()}..${farSamples.max().toInt()} dBFS. Need 6 dB separation. Retry FAR farther away, same volume/orientation."
      else->"Chirp heard, but calibration NOT saved yet. Near ${nearSamples.size}/3, far ${farSamples.size}/3. Collect remaining checks, 8 seconds apart."
     }
     DeviceLink.prefs(this@AcousticProbeService).edit().putString("acoustic.lastCalibration",status.value).apply()
    }else{level=value;measuredAt=SystemClock.elapsedRealtime();status.value=if(near(this@AcousticProbeService))"Fresh nearby chirp verified" else "Chirp heard outside calibrated near level; no review card"}
   }catch(e:Exception){if(e is CancellationException)throw e;status.value=e.message?:"Acoustic check failed"}
   finally{pending=null;challenge=null}
  }
 }
 private fun pauseChecks(reason:String){job?.cancel();runCatching{record?.stop()};level=null;status.value=reason}
 fun cancelForVoice(){pauseChecks("Acoustic check cancelled for voice recording")}
 override fun onDestroy(){if(AcousticLink.available)DeviceLink.sendControl(JSONObject().put("type","acoustic_enable").put("enabled",false));scope.cancel();runCatching{record?.stop()};unregisterReceiver(locked);instance=null;active.value=false;level=null;super.onDestroy()}
}
