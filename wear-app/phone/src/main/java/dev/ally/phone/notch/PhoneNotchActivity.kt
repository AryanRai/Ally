package dev.ally.phone.notch

import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.os.Bundle
import android.view.*
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.ally.device.*
import dev.ally.phone.*
import kotlinx.coroutines.delay

/** Native floating panel: normal input/IME, same request cards and broker as the phone chat. */
class PhoneNotchActivity:ComponentActivity() {
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        if(getSystemService(KeyguardManager::class.java).isDeviceLocked){finish();return}
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        window.setBackgroundDrawableResource(android.R.color.transparent)
        setFinishOnTouchOutside(true)
        setContent {
            val app=application as AllyPhoneApplication;val model=app.model
            val phone by model.state.collectAsStateWithLifecycle()
            val status by PhoneNotch.state.collectAsStateWithLifecycle()
            val inbox by DeviceLink.inbox.collectAsStateWithLifecycle()
            val control by ControlBridge.visual.collectAsStateWithLifecycle()
            val look=PhoneLook.load(DeviceLink.prefs(this))
            var now by remember{mutableLongStateOf(System.currentTimeMillis())}
            LaunchedEffect(Unit){while(true){now=System.currentTimeMillis();if(getSystemService(KeyguardManager::class.java).isDeviceLocked)finish();delay(500)}}
            NotchTheme(look){
                Column(Modifier.fillMaxWidth().background(Ink,androidx.compose.foundation.shape.RoundedCornerShape(24.dp)).padding(18.dp).heightIn(max=(resources.displayMetrics.heightPixels/resources.displayMetrics.density*.6f).coerceAtMost(520f).dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp)){
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text("ALLY",fontFamily=Tanker,fontSize=24.sp);IconControl("close","Collapse to camera"){finish()}}
                    MicroLabel("${status.active} active · ${status.unread} unread · ${status.attention} need you")
                    Text(status.lead?.title ?: "Ally",fontSize=17.sp)
                    if(!status.connected) Text("Reconnecting · saved previews may be stale",color=Warm)
                    val requests=DeviceInteractions.pending(inbox,now).filterNot{it.optBoolean("desktopOnly")}.distinctBy{it.optString("id")}
                    requests.forEach{item->key(item.optString("id")){DeviceInteractionCard(item)}}
                    if(phone.approval!=null && requests.none{it.optString("id")==phone.approval?.optString("id")}){
                        ChatApproval(phone.approval!!,phone.loading){action,values->model.answer(action,values)}
                    }
                    if(status.lead?.kind in setOf("notification","timer")) {
                        Text(status.lead?.detail.orEmpty(),fontSize=14.sp)
                        NotchButton("Open notification"){NotchEvents.open(this@PhoneNotchActivity,status.lead?.key.orEmpty());finish()}
                    }else if(status.lead?.kind=="media"){
                        Text(status.lead?.detail.orEmpty(),fontSize=14.sp)
                        NotchButton("Play / pause"){NotchEvents.togglePlayback(status.lead?.key.orEmpty())}
                    }else{
                        if(status.lead?.detail?.isNotBlank()==true)Text(status.lead!!.detail.take(1200),fontSize=14.sp,color=Muted)
                        Text(phone.selected?.title ?: "Choose a conversation",fontSize=14.sp,color=Muted)
                        val text=phone.liveText.ifBlank{phone.progress.lastOrNull()?.text.orEmpty()}.ifBlank{phone.messages.lastOrNull{it.role=="assistant"}?.text.orEmpty()}
                        if(text.isNotBlank()) NotchGroup { MessageBody(text.takeLast(1800)) }
                    }
                    if(control.visible(now,status.connected,false,true))NotchButton("Stop phone control"){ControlBridge.end(this@PhoneNotchActivity,"Stopped from Ally notch.")}
                    if(phone.speaking)NotchButton("Stop reply audio"){model.stopSpeaking()}
                    if(phone.canStop)NotchButton("Stop response"){model.stop()}
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                        NotchButton("Open chat",Modifier.weight(1f)){openChat(status.lead?.chatId ?: phone.selected?.id)}
                        NotchButton("Ask Ally",Modifier.weight(1f)){startActivity(SurfaceActions.intent(this@PhoneNotchActivity,"voice"));finish()}
                    }
                    Text("Use the full chat for voice, queue/steer, attachments and reply playback.",color=Muted,fontSize=11.sp)
                }
            }
        }
    }
    override fun onResume(){super.onResume();PhoneNotch.expanded=true;DeviceLink.resume(this);window.setLayout(minOf(resources.displayMetrics.widthPixels-32*resources.displayMetrics.density,360*resources.displayMetrics.density).toInt(),WindowManager.LayoutParams.WRAP_CONTENT);window.setGravity(Gravity.TOP or Gravity.CENTER_HORIZONTAL);window.attributes=window.attributes.apply{y=(56*resources.displayMetrics.density).toInt()}}
    override fun onPause(){PhoneNotch.expanded=false;super.onPause()}
    override fun onDestroy(){PhoneNotch.expanded=false;super.onDestroy()}
    private fun openChat(id:String?){startActivity(if(id!=null && SurfaceActions.validChat(id))SurfaceActions.intent(this,"chat",id)else DeviceLink.inboxIntent(this,"Chat"));finish()}
}
