package dev.ally.phone

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.ally.device.DeviceLink

/** Explicit opt-ins and native Android permission decisions; never grants permissions itself. */
class PhysicalTapSettingsActivity : ComponentActivity() {
    companion object { var visible = false; private set }
    override fun onResume() { super.onResume(); visible = true }
    override fun onPause() { visible = false; super.onPause() }
    private var permissionNote by mutableStateOf("")
    private val permission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        permissionNote = if (required().all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) "Permissions ready. Tap Start to begin." else "Permission was not granted. Physical tap stays off; manual assistant review is available."
        if(required().all { checkSelfPermission(it)==PackageManager.PERMISSION_GRANTED }&&DeviceLink.prefs(this).getBoolean("hold.enabled",false))startHold()
    }
    private fun startHold(){
        when{
            Build.VERSION.SDK_INT<31->permissionNote="Hold-close requires Android 12 or newer."
            required().any{checkSelfPermission(it)!=PackageManager.PERMISSION_GRANTED}->permission.launch(required())
            DeviceLink.status.value!="Connected"->permissionNote="Connect to your paired PC first, then Resume handoff."
            AllyControlService.instance==null->permissionNote="Enable Ally control in Android Accessibility first."
            else->runCatching{startForegroundService(Intent(this,PhysicalTapService::class.java))}.onFailure{permissionNote=it.message?:"Cannot start handoff"}
        }
    }
    private fun required(): Array<String> = buildList {
        if (Build.VERSION.SDK_INT >= 31) { add(Manifest.permission.BLUETOOTH_SCAN); add(Manifest.permission.BLUETOOTH_CONNECT) }
        if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
    }.toTypedArray()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = DeviceLink.prefs(this)
        setContent {
            var enabled by remember { mutableStateOf(prefs.getBoolean("hold.enabled", false)) }
            var capture by remember { mutableStateOf(prefs.getBoolean("tap.capture", false)) }
            var control by remember { mutableStateOf(prefs.getBoolean("hold.control",true)) }
            var viewer by remember { mutableStateOf(prefs.getBoolean("hold.viewer",true)) }
            var nearCalibration by remember { mutableStateOf(if (prefs.contains("tap.rssi")) prefs.getInt("tap.rssi", -55) else null) }
            DisposableEffect(prefs) {
                val listener = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
                    if (key == "tap.rssi") nearCalibration = prefs.getInt("tap.rssi", -55)
                    if(key=="hold.enabled")enabled=prefs.getBoolean("hold.enabled",false)
                }
                prefs.registerOnSharedPreferenceChangeListener(listener)
                onDispose { prefs.unregisterOnSharedPreferenceChangeListener(listener) }
            }
            val active by PhysicalTapService.active.collectAsState()
            val status by PhysicalTapService.status.collectAsState()
            val gestureStatus by PhysicalTapService.gestureStatus.collectAsState()
            MaterialTheme(colorScheme = darkColorScheme()) { Surface {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text("Hold-close handoff", style = MaterialTheme.typography.headlineMedium)
                    Text("Hold your unlocked phone close to your paired PC for 3 seconds. A bottom card fills over the app you are using. Move away to cancel and retract the card. A completed hold opens local review; choose a chat and tap Send.")
                    Text("Bluetooth signal strength estimates nearness; it cannot prove physical contact. Brief signal loss resets progress. Move away after a completed hold to start another.")
                    Row { Text("Hold-close · on until switched off", Modifier.weight(1f)); Switch(enabled, { enabled = it; prefs.edit().putBoolean("hold.enabled", it).apply(); if (it)startHold() else stopService(Intent(this@PhysicalTapSettingsActivity, PhysicalTapService::class.java)) }) }
                    Row { Text("Allow one local screenshot after a completed hold", Modifier.weight(1f)); Switch(capture, { capture = it; prefs.edit().putBoolean("tap.capture", it).apply(); if (!it) stopService(Intent(this@PhysicalTapSettingsActivity, PhysicalTapService::class.java)) }) }
                    Text("The bottom card works above other apps. It is removed before capture. The PC's current chat is preselected; swipe up to Send or choose another chat. Nothing sends just from holding close.")
                    Row{Text("Request 15-minute phone control on handoff",Modifier.weight(1f));Switch(control,{control=it;prefs.edit().putBoolean("hold.control",it).apply()})}
                    Row{Text("Request local scrcpy viewer on handoff",Modifier.weight(1f));Switch(viewer,{viewer=it;prefs.edit().putBoolean("hold.viewer",it).apply()})}
                    Text("Control and raw live viewing use their normal, separate approval requests. Viewing requires an authorized ADB connection and configured scrcpy. No microphone, remote input or clipboard synchronization in the viewer. Hold-close stays on; these grants expire after 15 minutes and have Stop controls.")
                    Button({ startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }) { Text("Open Android Accessibility settings") }
                    Button({ permission.launch(required()) }) { Text("Allow nearby devices & notifications") }
                    if (permissionNote.isNotBlank()) Text(permissionNote)
                    Text(status, style = MaterialTheme.typography.titleMedium)
                    Text("Last hold: $gestureStatus")
                    Text("Near-PC calibration: " + (nearCalibration?.let { "saved ($it dBm)" } ?: "not calibrated"))
                    if (nearCalibration != null) Text("Near-PC calibration is saved. Leave Ally and hold close while another app is open.")
                    Button({
                        when {
                            Build.VERSION.SDK_INT < 31 -> permissionNote = "This hold-close scanner requires Android 12 or newer. Use manual assistant screen review."
                            required().any { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED } -> permission.launch(required())
                            DeviceLink.status.value != "Connected" -> permissionNote = "Connect to your paired PC in Ally Settings first."
                            AllyControlService.instance == null -> permissionNote = "Enable Ally control in Android Accessibility first."
                            else -> runCatching { startForegroundService(Intent(this@PhysicalTapSettingsActivity, PhysicalTapService::class.java)) }.onFailure { permissionNote = it.message ?: "Cannot start session" }
                        }
                    }, enabled = enabled && capture && !active) { Text("Resume handoff") }
                    if (active) {
                        Button({ enabled=false;prefs.edit().putBoolean("hold.enabled",false).apply();stopService(Intent(this@PhysicalTapSettingsActivity, PhysicalTapService::class.java)) }) { Text("Turn off hold-close") }
                        OutlinedButton({ startService(Intent(this@PhysicalTapSettingsActivity, PhysicalTapService::class.java).setAction(PhysicalTapService.CALIBRATE_NEAR)) }) { Text("Calibrate near PC · 4 seconds") }
                    }
                    Text("Calibration stays on this phone. Handoff remains enabled until you turn it off. It pauses while locked or disconnected, then resumes. Android may stop background services; Resume restores it without changing permissions.")
                    TextButton({ finish() }) { Text("Back to Ally") }
                }
            } }
        }
    }
}

