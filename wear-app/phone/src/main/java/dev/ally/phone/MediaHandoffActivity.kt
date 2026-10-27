package dev.ally.phone
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import dev.ally.device.DeviceLink
import dev.ally.device.MediaContinuation
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import org.json.JSONObject
import java.util.UUID

/** Private local preview. The explicit button is the only playback-launch authorization. */
class MediaHandoffActivity:ComponentActivity(){
 private val prefs get()=DeviceLink.prefs(this)
 private lateinit var notice:TextView
 private lateinit var url:EditText
 private lateinit var seconds:EditText
 private lateinit var go:Button
 override fun onCreate(savedInstanceState:Bundle?){
  super.onCreate(savedInstanceState);window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
  if(getSystemService(KeyguardManager::class.java).isDeviceLocked){finish();return}
  val media=intent.getStringExtra("media")?.takeIf{it.length<=6000}?.let{runCatching{JSONObject(it)}.getOrNull()}
    ?:NativeMedia.snapshot(this,null,null)?:JSONObject()
  val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(32,64,32,32);setBackgroundColor(Color.rgb(12,18,20))}
  fun label(text:String)=TextView(this).apply{this.text=text;textSize=17f;setTextColor(Color.WHITE);setPadding(0,12,0,12)}
  box.addView(label("Continue video on PC"))
  media.optString("title").takeIf{it.isNotBlank()}?.let{box.addView(label(it))}
  box.addView(label("Review the exact YouTube link and position. Continue opens your PC's default browser at this time; site login, autoplay and protected-content rules still apply. No screenshot, chat message or agent is sent. Phone playback is not paused automatically."))
  url=EditText(this).apply{hint="Original YouTube URL";setText(media.optString("url"));inputType=android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI;setTextColor(Color.WHITE);setHintTextColor(Color.LTGRAY)};box.addView(url)
  seconds=EditText(this).apply{hint="Playback position in seconds";inputType=android.text.InputType.TYPE_CLASS_NUMBER;setTextColor(Color.WHITE);setHintTextColor(Color.LTGRAY);if(media.has("positionMs"))setText((media.optLong("positionMs")/1000).toString())};box.addView(seconds)
  notice=label(if(media.has("positionMs"))"Position observed from Android now playing. Adjust it if needed." else media.optString("reason","Enter the original video link and playback position."));box.addView(notice)
  val enabled=Switch(this).apply{text="Allow local now-playing metadata";setTextColor(Color.WHITE);isChecked=prefs.getBoolean("media.enabled",false);setOnCheckedChangeListener{_,value->prefs.edit().putBoolean("media.enabled",value).apply()}};box.addView(enabled)
  box.addView(Button(this).apply{text="Enable Android media notification access";setOnClickListener{startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))}})
  box.addView(Button(this).apply{text="Refresh current video";setOnClickListener{
   val refreshed=NativeMedia.snapshot(this@MediaHandoffActivity,null,null)
   if(refreshed!=null){
    if(refreshed.has("url"))url.setText(refreshed.optString("url"))
    if(refreshed.has("positionMs"))seconds.setText((refreshed.optLong("positionMs")/1000).toString())
    notice.text=if(refreshed.has("positionMs"))"Updated from Android now playing. Review the link and position." else refreshed.optString("reason")
   }else notice.text="No supported active video. Share its original YouTube link to Ally and enter the position."
  }})
  go=Button(this).apply{text="Continue on PC";setOnClickListener{continueVideo()}};box.addView(go)
  box.addView(Button(this).apply{text="Check previous continuation";setOnClickListener{checkPrevious()}})
  box.addView(Button(this).apply{text="Back";setOnClickListener{finish()}})
  setContentView(ScrollView(this).apply{addView(box)})
  if(!MediaContinuation.protocol.value)notice.text="PC media continuation is unavailable in the connected PC build. Activate the updated PC build first. Nothing has been opened."
 }
 private suspend fun response(id:String):JSONObject=withTimeout(10000){MediaContinuation.result.filterNotNull().first{it.optString("requestId")==id}}
 private fun available():Boolean{
  if(!MediaContinuation.protocol.value||DeviceLink.status.value!="Connected"){notice.text="Connect to the updated paired PC first.";return false}
  if(getSystemService(KeyguardManager::class.java).isDeviceLocked)return false
  return true
 }
 private fun continueVideo(){
  if(!available())return
  if(prefs.contains("media.pending")){notice.text="A previous continuation is unconfirmed. Check its status first; it will not be opened again automatically.";return}
  val link=MediaHandoffRules.youtube(url.text.toString());val s=seconds.text.toString().toLongOrNull()
  if(link==null||s==null||s !in 0..604800){notice.text="Enter a supported YouTube video URL and its position in seconds.";return}
  val id=UUID.randomUUID().toString();go.isEnabled=false
  lifecycleScope.launch{
   try{
    MediaContinuation.result.value=null
    check(MediaContinuation.send(JSONObject().put("type","media_prepare").put("requestId",id).put("url",link).put("positionMs",s*1000))){"PC disconnected"}
    val ready=response(id);check(ready.optString("status")=="ready"){ready.optString("message","PC did not prepare this video")}
    check(available()){"Phone unavailable"}
    check(prefs.edit().putString("media.pending",id).commit()){"Could not save continuation receipt"}
    MediaContinuation.result.value=null
    check(MediaContinuation.send(JSONObject().put("type","media_continue").put("requestId",id).put("token",ready.getString("token")).put("explicit",true))){"Connection lost; check previous continuation before retrying"}
    showResult(response(id))
   }catch(e:Exception){if(e is CancellationException && e !is TimeoutCancellationException)throw e;notice.text=(e.message?:"No response")+". If the request was sent, check previous continuation; no automatic retry."}
   finally{go.isEnabled=true}
  }
 }
 private fun showResult(value:JSONObject){
  val status=value.optString("status")
  notice.text=when(status){"opened"->"Video opened on PC at the reviewed position. Check the browser; playback itself has not been confirmed.";"not_attempted"->"PC has no launch receipt. You may explicitly choose Continue again.";"opening_uncertain"->"PC launch was attempted but its result is uncertain. Check the PC browser; Ally will not replay it.";else->value.optString("message","Continuation unavailable")}
  if(status in listOf("opened","not_attempted"))prefs.edit().remove("media.pending").apply()
 }
 private fun checkPrevious(){
  if(!available())return
  val id=prefs.getString("media.pending",null)?:run{notice.text="No unconfirmed continuation.";return}
  lifecycleScope.launch{try{MediaContinuation.result.value=null;check(MediaContinuation.send(JSONObject().put("type","media_status").put("requestId",id)));showResult(response(id))}catch(e:Exception){if(e is CancellationException&&e !is TimeoutCancellationException)throw e;notice.text="Status unavailable. Keep this pending receipt and check the PC browser."}}
 }
}
