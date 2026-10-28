package dev.ally.phone
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import dev.ally.device.*
import kotlinx.coroutines.launch

class AcousticSettingsActivity:ComponentActivity(){
 private lateinit var status:TextView
 private lateinit var toggle:Switch
 private val permission=registerForActivityResult(ActivityResultContracts.RequestPermission()){if(it)startSession()else status.text="Microphone permission declined; acoustic checks remain off."}
 private fun startSession(){
  if(!AcousticLink.available){status.text="Activate the matching PC acoustic build first. No microphone started.";return}
  if(!getSystemService(android.app.NotificationManager::class.java).areNotificationsEnabled()){status.text="Enable Ally notifications normally so the microphone session has a visible Stop control.";return}
  if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){permission.launch(Manifest.permission.RECORD_AUDIO);return}
  runCatching{startForegroundService(Intent(this,AcousticProbeService::class.java))}.onFailure{status.text=it.message}
 }
 override fun onCreate(savedInstanceState:Bundle?){
  super.onCreate(savedInstanceState)
  val prefs=DeviceLink.prefs(this)
  val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(32,64,32,32);setBackgroundColor(Color.rgb(12,18,20))}
  fun label(text:String)=TextView(this).apply{this.text=text;setTextColor(Color.WHITE);textSize=17f;setPadding(0,12,0,12)}
  fun button(text:String,action:()->Unit){box.addView(Button(this).apply{this.text=text;setOnClickListener{action()}})}
  box.addView(label("Experimental acoustic proximity"))
  box.addView(label("The PC emits a brief audible coded chirp. During each check the phone listens locally for up to 4.2 seconds. Audio stays in memory and is discarded; it is never saved, uploaded or sent to an agent. This checks a fresh tone and its calibrated level, not centimetres or time-of-flight. Speaker volume, orientation, echoes and noise affect results. Keep volume unchanged; do not turn it up to force a match."))
  box.addView(label("Audio proximity stays enabled until you turn it off or tap Stop. Collect 3 FAR and 3 NEAR checks, at least 12 seconds apart. Lock/disconnect cancels the current check; the running foreground service waits for unlock/reconnection. If Android stops the app or after an update/reboot, open this page and Resume. The setting and calibration stay saved. The BLE toggle stays separate."))
  status=label(AcousticProbeService.readiness(this)+"\n"+AcousticProbeService.status.value);box.addView(status)
  toggle=Switch(this).apply{text="Audio proximity · on until stopped";setTextColor(Color.WHITE);isChecked=prefs.getBoolean("acoustic.enabled",false);setOnCheckedChangeListener{_,value->prefs.edit().putBoolean("acoustic.enabled",value).apply();if(value)startSession()else stopService(Intent(this@AcousticSettingsActivity,AcousticProbeService::class.java))}}
  box.addView(toggle)
  button("Enable / Resume audio proximity"){if(toggle.isChecked)startSession()else toggle.isChecked=true}
  button("Open notification settings for Stop controls"){startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,packageName))}
  button("Collect FAR chirp check"){AcousticProbeService.instance?.probe("far")?:run{status.text="Start the explicit session first"}}
  button("Collect NEAR chirp check"){AcousticProbeService.instance?.probe("near")?:run{status.text="Start the explicit session first"}}
  button("Check proximity now"){AcousticProbeService.instance?.probe()?:run{status.text="Resume audio proximity first"}}
  button("Stop audio proximity"){toggle.isChecked=false;stopService(Intent(this,AcousticProbeService::class.java));status.text="Audio proximity stopped. BLE hold-close remains a separate setting."}
  button("Back"){finish()}
  setContentView(ScrollView(this).apply{addView(box)})
  lifecycleScope.launch{AcousticProbeService.status.collect{status.text=AcousticProbeService.readiness(this@AcousticSettingsActivity)+"\n"+it}}
 }
}
