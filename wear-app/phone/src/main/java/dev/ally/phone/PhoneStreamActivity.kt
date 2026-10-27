package dev.ally.phone
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.view.WindowManager
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import dev.ally.device.DeviceLink

class PhoneStreamActivity:ComponentActivity(){
 private var approved=false
 private val capture=registerForActivityResult(ActivityResultContracts.StartActivityForResult()){result->
  if(result.resultCode==Activity.RESULT_OK&&result.data!=null&&DeviceLink.status.value=="Connected"&&PhoneStream.lease.consume()){
   approved=true
   runCatching{startForegroundService(Intent(this,PhoneStreamService::class.java).putExtra("resultCode",result.resultCode).putExtra("data",result.data)
       .putExtra("id",PhoneStream.lease.id).putExtra("token",PhoneStream.lease.token))}.onFailure{PhoneStream.stop(this)}
   moveTaskToBack(true);finish()
  }else{PhoneStream.stop(this);finish()}
 }
 override fun onCreate(savedInstanceState:Bundle?){
  super.onCreate(savedInstanceState);window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
  if(!PhoneStream.lease.valid()){Toast.makeText(this,"Request the local phone viewer from your PC chat first.",Toast.LENGTH_LONG).show();finish();return}
  setContentView(LinearLayout(this).apply{
   orientation=LinearLayout.VERTICAL;setPadding(32,64,32,32);setBackgroundColor(Color.rgb(12,18,20))
   addView(TextView(this@PhoneStreamActivity).apply{text="Show phone in Ally\n\nRead-only local preview on your PC, up to 15 minutes. No audio, input, clipboard or recording. Frames are not sent to your agent. Android will ask which screen/app to share. Secure content may stay black. Stop from the phone notification, Android sharing indicator or PC viewer.";setTextColor(Color.WHITE);textSize=17f})
   addView(Button(this@PhoneStreamActivity).apply{text="Review Android screen sharing";setOnClickListener{isEnabled=false;capture.launch(getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent())}})
   addView(Button(this@PhoneStreamActivity).apply{text="Decline";setOnClickListener{PhoneStream.stop(this@PhoneStreamActivity);finish()}})
  })
 }
 override fun onDestroy(){if(isFinishing&&!approved)PhoneStream.stop(this);super.onDestroy()}
}
