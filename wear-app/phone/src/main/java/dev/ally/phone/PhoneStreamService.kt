package dev.ally.phone
import android.app.*
import android.content.*
import android.graphics.*
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.*
import android.os.*
import dev.ally.device.DeviceLink
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/** User-consented raw preview over Ally; no mic, controls, files, restart replay or agent frame access. */
class PhoneStreamService:Service(){
 private var projection:MediaProjection?=null
 private var display:VirtualDisplay?=null
 private var reader:ImageReader?=null
 private var worker:HandlerThread?=null
 private var last=0L
 private val main=Handler(Looper.getMainLooper())
 private var identity="";private var token=""
 private val expire=Runnable{stopSelf()}
 override fun onBind(intent:Intent?):IBinder?=null
 @Suppress("DEPRECATION") override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
  if(intent?.action=="viewer.stop"){PhoneStream.stop(this);stopSelf();return START_NOT_STICKY}
  if(intent==null||projection!=null||!PhoneStream.lease.valid(intent.getStringExtra("id").orEmpty(),intent.getStringExtra("token").orEmpty())){stopSelf();return START_NOT_STICKY}
  identity=PhoneStream.lease.id;token=PhoneStream.lease.token
  val data=intent.getParcelableExtra<Intent>("data")?:run{stopSelf();return START_NOT_STICKY}
  val manager=getSystemService(NotificationManager::class.java)
  val stop=PendingIntent.getService(this,66,Intent(this,PhoneStreamService::class.java).setAction("viewer.stop"),PendingIntent.FLAG_IMMUTABLE)
  startForeground(65,Notification.Builder(this,"ally-phone-viewer").setSmallIcon(R.drawable.ic_ally).setContentTitle("Sharing phone with your local Ally viewer")
   .setContentText("Read-only preview · no audio or recording").setOngoing(true).addAction(Notification.Action.Builder(null,"Stop",stop).build()).build())
  try{
   val p=getSystemService(MediaProjectionManager::class.java).getMediaProjection(intent.getIntExtra("resultCode",Activity.RESULT_CANCELED),data)?:error("Native capture not approved")
   projection=p
   p.registerCallback(object:MediaProjection.Callback(){override fun onStop(){stopSelf()}},main)
   val metrics=resources.displayMetrics;val ratio=minOf(720f/metrics.widthPixels,1280f/metrics.heightPixels,1f)
   val width=(metrics.widthPixels*ratio).toInt().coerceAtLeast(2);val height=(metrics.heightPixels*ratio).toInt().coerceAtLeast(2)
   worker=HandlerThread("AllyLocalViewer").apply{start()};val handler=Handler(worker!!.looper)
   reader=ImageReader.newInstance(width,height,PixelFormat.RGBA_8888,2).apply{
    setOnImageAvailableListener({source->source.acquireLatestImage()?.use{image->
     if(SystemClock.elapsedRealtime()-last<1000||!PhoneStream.lease.valid(identity,token)||DeviceLink.status.value!="Connected")return@use
     last=SystemClock.elapsedRealtime()
     runCatching{
      val plane=image.planes[0];check(plane.pixelStride==4)
      val packed=ByteArray(width*height*4);val buffer=plane.buffer
      for(y in 0 until height){buffer.position(y*plane.rowStride);buffer.get(packed,y*width*4,width*4)}
      val bitmap=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888)
      try{bitmap.copyPixelsFromBuffer(ByteBuffer.wrap(packed));val bytes=ByteArrayOutputStream().also{bitmap.compress(Bitmap.CompressFormat.JPEG,55,it)}.toByteArray()
       if(bytes.size<=180000&&PhoneStream.lease.valid(identity,token))DeviceLink.sendControl(JSONObject().put("type","viewer_frame").put("id",identity).put("token",token).put("jpeg",android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP)))
       bytes.fill(0)
      }finally{bitmap.recycle();packed.fill(0)}
     }.onFailure{stopSelf()}
    }},handler)
   }
   display=p.createVirtualDisplay("Ally local read-only viewer",width,height,metrics.densityDpi,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,reader!!.surface,null,handler)
   main.postDelayed(expire,PhoneStream.lease.remaining())
  }catch(_:Exception){stopSelf()}
  return START_NOT_STICKY
 }
 override fun onDestroy(){
  main.removeCallbacks(expire);reader?.setOnImageAvailableListener(null,null);display?.release();reader?.close();projection?.stop();worker?.quitSafely()
  if(identity.isNotBlank())DeviceLink.sendControl(JSONObject().put("type","viewer_end").put("id",identity).put("token",token))
  if(PhoneStream.lease.id==identity)PhoneStream.lease.clear();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()
 }
}
