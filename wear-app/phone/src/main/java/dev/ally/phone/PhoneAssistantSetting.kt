package dev.ally.phone

import android.app.role.RoleManager
import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

@Composable
internal fun PhoneAssistantSetting() {
    val context = LocalContext.current
    val roles = remember { context.getSystemService(RoleManager::class.java) }
    var held by remember { mutableStateOf(roles?.isRoleHeld(RoleManager.ROLE_ASSISTANT) == true) }
    var error by remember { mutableStateOf("") }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        held = roles?.isRoleHeld(RoleManager.ROLE_ASSISTANT) == true
    }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if(event == Lifecycle.Event.ON_RESUME) held = roles?.isRoleHeld(RoleManager.ROLE_ASSISTANT) == true }
        lifecycle.addObserver(observer); onDispose { lifecycle.removeObserver(observer) }
    }
    MicroLabel("Phone assistant")
    Text(if(held) "Ally is your default assistant" else "Launch Ally with your Android assistant gesture or button", fontSize=14.sp)
    TextButton({
        error = ""
        try { launcher.launch(if (!held && roles?.isRoleAvailable(RoleManager.ROLE_ASSISTANT) == true) roles.createRequestRoleIntent(RoleManager.ROLE_ASSISTANT) else Intent(Settings.ACTION_VOICE_INPUT_SETTINGS)) }
        catch (_: Exception) { error = "Open Android Settings → Apps → Default apps → Digital assistant app → Ally." }
    }) { Text(if(held) "Assistant settings" else "Use Ally as assistant") }
    TextButton({
        try { launcher.launch(Intent("android.settings.GESTURE_SETTINGS")) }
        catch (_: Exception) { error = "Open Android Settings → System → Gestures → Press and hold power button → Digital assistant." }
    }) { Text("Power button settings") }
    Text("Ask Ally to open an app, open a link or prepare a timer. Approve phone actions in Inbox. Android’s system app confirms timers and alarms. Voice starts when you hold the orb.", color=Muted, fontSize=12.sp)
    if(error.isNotBlank()) Text(error,color=Warm,fontSize=12.sp)
}
