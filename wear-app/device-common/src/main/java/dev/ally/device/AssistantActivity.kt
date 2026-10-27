package dev.ally.device

import android.content.Context
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject

data class AssistantAgent(val id: String, val title: String, val provider: String, val status: String,
    val detail: String, val unread: Boolean, val updatedAt: Long, val text: String = "", val sessionId: String = "") {
    val key get() = if(sessionId.isNotBlank()) "$provider:$sessionId" else id
    val active get() = status == "running" || status == "needs_input"
    val label get() = when(status) { "running" -> "Working"; "needs_input" -> "Needs input"; "unread" -> "Unread"; "completed" -> "Completed"; "stopped" -> "Stopped"; "error" -> "Error"; else -> "Unknown" }
}
data class AssistantActivityState(val chats: List<AssistantAgent> = emptyList(), val stale: Boolean = false, val checked: Boolean = false) {
    val summary: String get() {
        if (stale) return if(chats.isEmpty()) "Agents · reconnecting" else "Agents · status unavailable"
        if (!checked) return "Agents · checking…"
        val running = chats.count { it.active }; val ready = chats.count { it.status == "completed" }
        val waiting=chats.count { it.status=="needs_input" }; val errors=chats.count { it.status=="error" }
        val unread=chats.count { it.unread }
        return if(chats.isEmpty()) "No active agents" else "$running active · ${if(waiting>0) "$waiting need you" else if(errors>0) "$errors errors" else if(unread>0) "$unread unread" else "$ready completed"}"
    }
}

object AssistantActivityParser {
    fun parse(json: JSONObject): AssistantActivityState {
        val array = json.getJSONArray("chats")
        val chats = (0 until array.length()).mapNotNull { i ->
            val c = array.optJSONObject(i) ?: return@mapNotNull null
            val id = c.optString("id"); val provider = c.optString("provider"); val status = c.optString("status")
            if(id.isBlank() || provider !in setOf("codex", "claude") || status !in setOf("running", "needs_input", "unread", "completed", "stopped", "error")) return@mapNotNull null
            AssistantAgent(id, c.optString("title", "Conversation").take(160), provider, status, c.optString("detail").take(160), c.optBoolean("unread"), c.optLong("updatedAt"),c.optString("text").takeLast(500),c.optString("sessionId"))
        }.distinctBy { it.id }
        return AssistantActivityState(chats, checked = true)
    }
}

/** Poll only while the assistant preview is visible; failures keep explicitly stale rows. */
internal class AssistantActivity(private val context: Context, private val scope: CoroutineScope) {
    val state = MutableStateFlow(AssistantActivityState())
    private var job: Job? = null
    fun start() {
        stop()
        if(state.value.checked) state.value=state.value.copy(stale=true)
        job = scope.launch {
            while(isActive) {
                try { val json=SurfaceStatus.fetch(context); SurfaceStatus.save(context,json); state.value = AssistantActivityParser.parse(json) }
                catch(e: CancellationException) { throw e }
                catch(_: Exception) { SurfaceStatus.failed(context); state.value = state.value.copy(stale = true) }
                delay(4000)
            }
        }
    }
    fun stop() { job?.cancel(); job = null }
}
