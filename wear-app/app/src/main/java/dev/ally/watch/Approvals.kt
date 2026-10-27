package dev.ally.watch

import org.json.JSONObject
import dev.ally.device.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Button

data class ApprovalOption(val value: String, val label: String)
data class ApprovalField(val id: String, val label: String, val required: Boolean, val secret: Boolean, val freeText: Boolean, val options: List<ApprovalOption>)
data class WatchApproval(val id: String, val title: String, val detail: String, val fields: List<ApprovalField>, val actions: List<ApprovalOption>, val attachments: List<DeviceAttachment> = emptyList())
object ApprovalParser {
    private fun options(json: JSONObject, key: String): List<ApprovalOption> {
        val rows = json.optJSONArray(key) ?: return emptyList()
        return (0 until rows.length()).map { val o = rows.getJSONObject(it); ApprovalOption(o.getString("value"), o.getString("label")) }
    }
    fun parse(json: JSONObject): WatchApproval? {
        val request = json.optJSONArray("approvals")?.optJSONObject(0) ?: return null
        val rows = request.optJSONArray("fields")
        val fields = if (rows == null) emptyList() else (0 until rows.length()).map {
            val f = rows.getJSONObject(it)
            ApprovalField(f.getString("id"), f.getString("label"), f.optBoolean("required"), f.optBoolean("secret"), f.optBoolean("freeText"), options(f, "options"))
        }
        return WatchApproval(request.getString("id"), request.getString("title"), request.optString("detail"), fields, options(request, "actions"), AttachmentParser.list(request))
    }
    fun complete(request: WatchApproval, values: Map<String, String>) = request.fields.all { !it.required || !values[it.id].isNullOrBlank() }
}

@Composable
internal fun ApprovalScreen(request: WatchApproval, sending: Boolean, error: String, submit: (String, Map<String, String>) -> Unit, embedded: Boolean = false, access: (() -> Unit)? = null) {
    // Every approval starts unanswered. No recommended option is implicitly granted.
    var values by remember(request.id) { mutableStateOf<Map<String, String>>(emptyMap()) }
    val scroll = key(request.id) { rememberScrollState() }
    val layout = if(embedded) Modifier.fillMaxWidth().background(Panel,androidx.compose.foundation.shape.RoundedCornerShape(12.dp)).padding(12.dp) else Modifier.fillMaxSize().background(Ink).bezelScroll(scroll).verticalScroll(scroll).padding(horizontal = 27.dp, vertical = 32.dp)
    Column(layout,
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(request.title, fontSize = 16.sp)
        if (request.detail.isNotBlank()) Text(request.detail, color = Muted, fontSize = 12.sp)
        AttachmentView(request.attachments, compact = true)
        request.fields.forEach { field ->
            Text(field.label, fontSize = 12.sp)
            field.options.forEach { option ->
                Button(onClick = { values = values + (field.id to option.value) }, enabled = !sending) {
                    Text((if (values[field.id] == option.value) "✓ " else "") + option.label, fontSize = 12.sp)
                }
            }
            if (field.freeText) Field(values[field.id] ?: "", { values = values + (field.id to it.take(4000)) }, "Your answer", field.secret)
        }
        if (error.isNotBlank()) Text(error, color = Amber, fontSize = 11.sp)
        if (sending) Text("Sending your decision…", color = Muted, fontSize = 11.sp)
        request.actions.forEach { action ->
            Button(onClick = { submit(action.value, values) }, enabled = !sending && (action.value != "submit" || ApprovalParser.complete(request, values))) { Text(action.label) }
        }
        access?.let { open -> Button(onClick = open, enabled = !sending) { Text("Chat access", fontSize = 12.sp) } }
    }
}
