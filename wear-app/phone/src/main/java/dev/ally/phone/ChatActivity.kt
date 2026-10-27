package dev.ally.phone

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ally.device.ChatStep

@Composable
internal fun ChatActivity(steps: List<ChatStep>, commentary: List<String>) {
    if (steps.isEmpty() && commentary.isEmpty()) return
    var expanded by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(bottom=12.dp)) {
        val running = steps.count { it.status == "running" }
        Text("${if(expanded) "⌄" else "›"} ${if(running>0) "Working · $running active" else "Activity · ${steps.size} steps"}${if(commentary.isNotEmpty()) " · ${commentary.size} updates" else ""}",
            color=Muted, fontSize=12.sp, modifier=Modifier.fillMaxWidth().clickable { expanded=!expanded }.padding(vertical=12.dp))
        if (expanded) {
            commentary.forEach { MessageBody(it); Spacer(Modifier.height(12.dp)) }
            steps.forEach { step ->
                var detail by rememberSaveable(step.id) { mutableStateOf(false) }
                Text("${when(step.status) { "running" -> "◌"; "error" -> "!"; "interrupted" -> "−"; else -> "✓" }} ${step.label} ${if(detail) "−" else "+"}",
                    color=Muted, fontSize=12.sp, modifier=Modifier.fillMaxWidth().clickable { detail=!detail }.padding(vertical=12.dp))
                if (detail) Text(step.detail.ifBlank { "No additional detail" }, fontFamily=Mono, color=Muted, fontSize=11.sp,
                    modifier=Modifier.fillMaxWidth().background(Panel).padding(12.dp))
            }
        }
    }
}
