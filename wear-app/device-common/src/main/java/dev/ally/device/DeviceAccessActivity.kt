package dev.ally.device

import android.app.*
import android.content.Intent
import android.graphics.*
import android.os.*
import android.util.Base64
import android.view.*
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.*

/** First-party, secure QR/maintenance surface. No background activity launch or settings automation. */
class DeviceAccessActivity:ComponentActivity(){
    private var qrBitmap:Bitmap?=null
    private var qrKey=""
    private var resumed=false
    private lateinit var box:LinearLayout
    private lateinit var status:TextView
    private lateinit var countdown:TextView
    private lateinit var image:ImageView
    private lateinit var pair:Button
    private lateinit var maintenance:Button
    private fun dp(v:Int)=(v*resources.displayMetrics.density).toInt()
    private fun label(text:String,size:Float=13f)=TextView(this).apply{this.text=text;textSize=size;setTextColor(Color.LTGRAY);gravity=Gravity.CENTER;setPadding(0,dp(5),0,dp(5))}
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState);window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        val watch=DeviceLink.kind(this)=="watch"
        box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL;setPadding(dp(if(watch)24 else 20),dp(25),dp(if(watch)24 else 20),dp(24));setBackgroundColor(Color.BLACK)}
        setContentView(ScrollView(this).apply{addView(box)})
        box.addView(label("Device access",19f));status=label("");box.addView(status)
        image=ImageView(this).apply{contentDescription="Native Android phone ADB pairing QR";adjustViewBounds=true;setBackgroundColor(Color.WHITE);visibility=View.GONE};box.addView(image,LinearLayout.LayoutParams(-1,-2))
        countdown=label("");box.addView(countdown)
        pair=Button(this).apply{text="Pair phone with PC";setOnClickListener{if(!DeviceAccess.requestPair())status.text="Connect updated Ally on PC and watch first"}};if(watch)box.addView(pair)
        maintenance=Button(this).apply{text="Start 10-minute maintenance";setOnClickListener{
            if(DeviceMaintenanceService.active.value)stopService(Intent(this@DeviceAccessActivity,DeviceMaintenanceService::class.java))
            else runCatching{startForegroundService(Intent(this@DeviceAccessActivity,DeviceMaintenanceService::class.java).setAction("maintenance.start"))}.onFailure{status.text="Android did not start maintenance. Open Ally and try again."}
        }};if(watch)box.addView(maintenance)
        box.addView(Button(this).apply{text="Stop access preparation";setOnClickListener{DeviceAccess.stop();if(watch)stopService(Intent(this@DeviceAccessActivity,DeviceMaintenanceService::class.java));render()}})
        box.addView(label("Accessibility phone control works through Ally on any network. Scrcpy and installation require authorized ADB. QR needs reachable local Wi-Fi; scan in the phone's Wireless debugging QR scanner."))
        box.addView(label("Maintenance keeps this Ally screen dim and awake while visible, and requests CPU/Wi-Fi temporarily. It cannot keep the system Settings screen awake or force Android debugging to stay on."))
        lifecycleScope.launch{while(isActive){render();delay(1000)}}
    }
    private fun render(){
        if(!::status.isInitialized||!resumed)return
        DeviceAccess.clearExpiredQr()
        val value=DeviceAccess.state.value
        val qr=value.optString("qrData").takeIf{it.startsWith("data:image/png;base64,")&&DeviceAccess.qrRemaining()>0}.orEmpty()
        if(qr!=qrKey){
            image.setImageDrawable(null);qrBitmap?.recycle();qrBitmap=null;qrKey=qr
            if(qr.isNotEmpty())runCatching{
                val bytes=Base64.decode(qr.substringAfter(','),Base64.DEFAULT)
                val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
                check(bounds.outWidth in 64..512&&bounds.outHeight in 64..512)
                qrBitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.size);image.setImageBitmap(qrBitmap)
            }
            image.visibility=if(qrBitmap==null)View.GONE else View.VISIBLE
        }
        val lease=(DeviceMaintenanceService.deadlineElapsed-SystemClock.elapsedRealtime()).coerceAtLeast(0)
        val awake=qr.isNotEmpty()||lease>0
        if(awake)window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.attributes=window.attributes.apply{screenBrightness=if(qr.isNotEmpty()).65f else if(lease>0).08f else -1f}
        pair.isEnabled=DeviceAccess.protocol.value&&DeviceLink.status.value=="Connected"&&qr.isEmpty()&&value.optString("state")!="requesting"
        status.text=if(!DeviceAccess.protocol.value)"${DeviceLink.status.value} · update/restart PC Ally for native QR pairing" else value.optString("detail","Ready for device access")
        countdown.text=if(qr.isNotEmpty())"QR expires in ${DeviceAccess.qrRemaining()/1000}s" else if(lease>0)"Maintenance ${lease/1000}s\n${DeviceMaintenanceService.detail.value}" else "Maintenance is off"
        maintenance.text=if(lease>0)"Stop maintenance" else "Start 10-minute maintenance"
    }
    override fun onResume(){super.onResume();resumed=true;render()}
    override fun onPause(){resumed=false;window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);super.onPause()}
    override fun onDestroy(){image.setImageDrawable(null);qrBitmap?.recycle();qrBitmap=null;super.onDestroy()}
}
