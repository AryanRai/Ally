package dev.ally.watch

import android.app.role.RoleManager
import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.Text
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

/** Android owns the selection; opening Ally never changes it silently. */
@Composable
internal fun AssistantSetting() {
    val context = LocalContext.current
    val manager = remember { context.getSystemService(RoleManager::class.java) }
    val available = manager?.isRoleAvailable(RoleManager.ROLE_ASSISTANT) == true
    var held by remember { mutableStateOf(available && manager!!.isRoleHeld(RoleManager.ROLE_ASSISTANT)) }
    var detail by remember { mutableStateOf("") }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, manager) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                held = available && manager!!.isRoleHeld(RoleManager.ROLE_ASSISTANT)
                if (held) detail = "Ally is your default assistant"
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        held = available && manager!!.isRoleHeld(RoleManager.ROLE_ASSISTANT)
        detail = if(held) "Ally is your default assistant" else "Assistant selection unchanged"
    }
    Button(onClick = {
        // Samsung exposes this role in Settings but marks direct role requests unrequestable.
        try { launcher.launch(Intent(Settings.ACTION_VOICE_INPUT_SETTINGS)) }
        catch (_: Exception) { detail = "Open watch Settings → Apps → Default apps → Digital assistant. If Ally is unavailable, assign Ally to a side-button shortcut instead." }
    }, enabled = !held) { Text(if(held) "Ally is your assistant" else "Use Ally as assistant",fontSize=11.sp) }
    if(!available) Text("This watch does not expose assistant selection to apps. Check system Default apps, or assign Ally to a side-button shortcut.",color=Muted,fontSize=10.sp)
    if(detail.isNotBlank()) Text(detail,color=Muted,fontSize=10.sp)
}
