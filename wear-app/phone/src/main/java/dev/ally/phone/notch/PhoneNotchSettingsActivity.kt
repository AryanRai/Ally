package dev.ally.phone.notch

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Settings
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ally.device.DeviceLink
import dev.ally.phone.*

/** All Ally controls use its existing Compose design. OS permission screens remain Android-owned. */
class PhoneNotchSettingsActivity:ComponentActivity(){
    private val prefs by lazy{DeviceLink.prefs(this)}
    private var revision by mutableIntStateOf(0)
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        setContent {
            @Suppress("UNUSED_VARIABLE") val refresh=revision
            NotchTheme(PhoneLook.load(prefs)) {
                Column(Modifier.fillMaxSize().background(Ink).windowInsetsPadding(WindowInsets.safeDrawing).verticalScroll(rememberScrollState()).padding(horizontal=20.dp).padding(bottom=28.dp),verticalArrangement=Arrangement.spacedBy(18.dp)) {
                    Row(verticalAlignment=Alignment.CenterVertically){IconControl("back","Back"){finish()};Text("ALLY",fontFamily=Tanker,fontSize=28.sp);Spacer(Modifier.width(14.dp));MicroLabel("Phone notch")}
                    Text("Small around your camera. More when you tap.",fontSize=23.sp,fontFamily=Geist)
                    Text("Tap the camera halo or status pill to open floating Ally. Only its Expand button opens full chat. Swipe to hide briefly or hold for settings.",color=Muted)
                    NotchGroup {
                        Toggle("notch.enabled","Phone notch","Keep the camera indicator available"){PhoneNotch.enable(this@PhoneNotchSettingsActivity,it)}
                        Toggle("notch.liveStatus","Live status row","One line below the status bar; tap to cycle, arrow to preview",true)
                        MicroLabel("Idle layout")
                        val mode=prefs.getString("notch.layout","camera")
                        Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){
                            FilterChip(mode!="pill",{save("notch.layout","camera")},{Text("Camera ring")},modifier=Modifier.notchAccent(mode!="pill",8f),colors=FilterChipDefaults.filterChipColors(selectedContainerColor=androidx.compose.ui.graphics.Color.Transparent),border=null)
                            FilterChip(mode=="pill",{save("notch.layout","pill")},{Text("Status pill")},modifier=Modifier.notchAccent(mode=="pill",8f),colors=FilterChipDefaults.filterChipColors(selectedContainerColor=androidx.compose.ui.graphics.Color.Transparent),border=null)
                        }
                        Text("Camera ring leaves the rest of the status bar and screen clear. Status pill stays below the camera.",color=Muted)
                        Adjustment("notch.scale","Size",1f,.8f..1.3f){"${(it*100).toInt()}%"}
                        Adjustment("notch.offsetX","Camera alignment · horizontal",0f,-32f..32f){"${it.toInt()} dp"}
                        Adjustment("notch.offsetY","Camera alignment · vertical",0f,-32f..32f){"${it.toInt()} dp"}
                        NotchButton("Reset size and alignment"){prefs.edit().remove("notch.scale").remove("notch.offsetX").remove("notch.offsetY").apply();changed()}
                        if(PhoneNotch.enabled(this@PhoneNotchSettingsActivity) && PhoneNotch.permission(this@PhoneNotchSettingsActivity)) NotchButton("Show status preview"){PhoneNotchService.instance?.preview();finish()}
                    }
                    NotchGroup {
                        MicroLabel("Setup")
                        Text(if(PhoneNotch.permission(this@PhoneNotchSettingsActivity)) "Overlay ready" else "Allow display over other apps, or use your existing Ally Accessibility service.",color=Muted)
                        NotchButton("Android overlay access"){startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:$packageName")))}
                        if(android.os.Build.VERSION.SDK_INT>=33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
                            NotchButton("Allow ongoing notification"){requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),91)}
                        Toggle("control.edgeGlow","Phone-control edge glow","Only during an approved control session",true)
                        Toggle("control.touchMarker","Show where Ally touches","A dot and ripple at each tap or swipe while Ally controls the phone",true)
                    }
                    NotchGroup {
                        MicroLabel("Phone events · optional")
                        Toggle("notch.charging","Charging","Show battery status while plugged in")
                        Toggle("notch.events","App notifications","Only from apps selected below"){if(!it)PhoneNotch.clearNotifications()}
                        Toggle("notch.media","Media controls","Now-playing from selected apps"){if(!it)PhoneNotch.clearNotifications();NotchEvents.listener?.refreshMedia()}
                        Toggle("notch.notificationText","Notification titles","Show potentially private titles locally")
                        Text("No notification data leaves your phone. Authentication notices and Ally notifications are excluded. Access is optional and separate from existing media handoff.",color=Muted)
                        NotchButton("Android notification access"){startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))}
                    }
                    NotchGroup {
                        MicroLabel("Included apps")
                        Text("None included until you select them.",color=Muted)
                        val apps=remember { packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),0).distinctBy{it.activityInfo.packageName}.filter{it.activityInfo.packageName!=packageName}.sortedBy{it.loadLabel(packageManager).toString()} }
                        val selected=prefs.getStringSet("notch.apps",emptySet()).orEmpty()
                        apps.forEach{app->val pkg=app.activityInfo.packageName
                            Row(Modifier.fillMaxWidth().clickable{selectApp(pkg,pkg !in selected)}.heightIn(min=48.dp),verticalAlignment=Alignment.CenterVertically){Text(app.loadLabel(packageManager).toString(),Modifier.weight(1f));Checkbox(pkg in selected,{selectApp(pkg,it)})}
                        }
                    }
                }
            }
        }
    }
    private fun changed(){revision++;PhoneNotchService.instance?.visibilityChanged()}
    private fun save(key:String,value:String){prefs.edit().putString(key,value).apply();changed()}
    private fun selectApp(pkg:String,on:Boolean){val next=prefs.getStringSet("notch.apps",emptySet()).orEmpty().toMutableSet();if(on)next.add(pkg)else next.remove(pkg);prefs.edit().putStringSet("notch.apps",next).apply();PhoneNotch.clearNotifications();changed()}
    @Composable private fun Toggle(key:String,title:String,detail:String,default:Boolean=false,action:(Boolean)->Unit={}){
        val checked=remember(key,revision){prefs.getBoolean(key,default)}
        Row(Modifier.fillMaxWidth().clickable{prefs.edit().putBoolean(key,!checked).apply();action(!checked);changed()},verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)){
            Column(Modifier.weight(1f)){Text(title);Text(detail,color=Muted,style=MaterialTheme.typography.bodySmall)}
            Switch(checked,{prefs.edit().putBoolean(key,it).apply();action(it);changed()},modifier=Modifier.notchAccent(checked,28f),colors=SwitchDefaults.colors(checkedTrackColor=androidx.compose.ui.graphics.Color.Transparent,checkedBorderColor=androidx.compose.ui.graphics.Color.Transparent,checkedThumbColor=White))
        }
    }
    @Composable private fun Adjustment(key:String,title:String,default:Float,range:ClosedFloatingPointRange<Float>,format:(Float)->String){
        var value by remember(key,revision){mutableFloatStateOf(prefs.getFloat(key,default).coerceIn(range))}
        Row{Text(title,Modifier.weight(1f));Text(format(value),color=Muted)}
        Slider(value,{value=it;prefs.edit().putFloat(key,it).apply();PhoneNotchService.instance?.visibilityChanged()},valueRange=range)
    }
    override fun onResume(){super.onResume();revision++;PhoneNotch.resume(this)}
    override fun onRequestPermissionsResult(code:Int,permissions:Array<String>,results:IntArray){super.onRequestPermissionsResult(code,permissions,results);changed();PhoneNotch.resume(this)}
}
