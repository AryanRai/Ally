package dev.ally.phone

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.ui.Alignment
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.ally.device.*
import kotlinx.coroutines.delay

private fun activityTime(ms: Long): String {
    val seconds = (ms / 1000).coerceAtLeast(1)
    return if (seconds >= 60) "${seconds / 60}m ${seconds % 60}s" else "${seconds}s"
}

@Composable
internal fun ChatActivity(steps: List<ChatStep>, commentary: List<String>, timeline: List<ChatActivityEntry> = emptyList(), running: Boolean = false, durationMs: Long = 0, startedAt: Long = 0, activity: String = "Working…", requests: List<org.json.JSONObject> = emptyList()) {
    val blocks = remember(steps, commentary, timeline, requests) { chatActivityBlocks(steps, commentary, timeline, requests) }
    if (blocks.isEmpty() && !running) return
    var expanded by rememberSaveable(running) { mutableStateOf(false) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(running, startedAt) { while (running && startedAt > 0) { now = System.currentTimeMillis(); delay(1000) } }
    val elapsed = if (running && startedAt > 0) (now - startedAt).coerceAtLeast(0) else durationMs
    val count = blocks.sumOf { it.steps.size }
    val updates = blocks.count { it.update.isNotBlank() }
    Column(Modifier.fillMaxWidth().padding(bottom=12.dp)) {
        if (!running) Text("${if(expanded) "⌄" else "›"} Activity · $count steps · $updates updates${if(elapsed > 0) " · ${activityTime(elapsed)}" else ""}",
            color=Muted, fontSize=12.sp, modifier=Modifier.fillMaxWidth().clickable { expanded=!expanded }.padding(vertical=10.dp))
        if (running || expanded || requests.any { DeviceInteractions.awaiting(it) }) blocks.forEach { block -> key(block.id) {
            if (block.request != null) DeviceInteractionCard(block.request)
            else if (block.update.isNotBlank()) { MessageBody(block.update); Spacer(Modifier.height(12.dp)) }
            else {
                var groupOpen by rememberSaveable(block.id) { mutableStateOf(false) }
                val active = block.steps.any { it.status == "running" }
                val errors = block.steps.count { it.status == "error" }
                val start = block.steps.map { it.startedAt }.filter { it > 0 }.minOrNull() ?: 0
                val end = block.steps.maxOfOrNull { it.endedAt } ?: 0
                val time = if (start > 0 && end >= start && !active) " · ${activityTime(end-start)}" else ""
                val liveGroup = running && block.id == blocks.lastOrNull()?.id
                Row(verticalAlignment=Alignment.CenterVertically, horizontalArrangement=Arrangement.spacedBy(8.dp),
                    modifier=Modifier.fillMaxWidth().clickable { groupOpen=!groupOpen }.padding(vertical=10.dp)) {
                if(liveGroup) CircularProgressIndicator(Modifier.size(14.dp), color=Muted, strokeWidth=2.dp)
                Text("${if(groupOpen) "⌄" else "›"} ${if(liveGroup) activity.ifBlank { "Working…" } else if(active) "Working…" else "Thinking"} · ${block.steps.size} steps${if(liveGroup && elapsed > 0) " · ${activityTime(elapsed)}" else time}${if(errors > 0) " · $errors failed" else ""}",
                    color=Muted, fontSize=12.sp)
                }
                if (groupOpen) Column(Modifier.padding(start=12.dp)) { block.steps.forEach { step -> key(step.id) {
                    var detail by rememberSaveable(step.id) { mutableStateOf(false) }
                    Text("${when(step.status) { "running" -> "◌"; "error" -> "!"; "interrupted" -> "−"; else -> "✓" }} ${step.label} ${if(detail) "−" else "+"}",
                        color=Muted, fontSize=12.sp, modifier=Modifier.fillMaxWidth().clickable { detail=!detail }.padding(vertical=8.dp))
                    if (detail) androidx.compose.foundation.text.selection.SelectionContainer {
                        Text(step.detail.ifBlank { "No additional detail" }, fontFamily=Mono, color=Muted, fontSize=11.sp,
                            modifier=Modifier.fillMaxWidth().background(Panel).padding(12.dp))
                    }
                    AttachmentView(step.attachments)
                } } }
            }
        } }
        if (running && blocks.lastOrNull()?.steps.isNullOrEmpty()) Row(
            verticalAlignment=Alignment.CenterVertically, horizontalArrangement=Arrangement.spacedBy(8.dp), modifier=Modifier.padding(vertical=10.dp)) {
            CircularProgressIndicator(Modifier.size(14.dp), color=Muted, strokeWidth=2.dp)
            Text("${activity.ifBlank { "Working…" }}${if(elapsed > 0) " · ${activityTime(elapsed)}" else ""}", color=Muted, fontSize=12.sp)
        }
    }
}
