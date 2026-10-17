package dev.ally.phone

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.ally.device.DeviceLink
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject
import org.json.JSONArray
import java.net.URL
import java.net.HttpURLConnection
import java.net.URLEncoder
import java.util.UUID

data class PhoneChat(val id: String, val title: String, val provider: String, val cwd: String)
data class PhoneMessage(val id: String, val role: String, val text: String)
data class PhoneState(val chats: List<PhoneChat> = emptyList(), val messages: List<PhoneMessage> = emptyList(), val selected: PhoneChat? = null,
    val running: List<PhoneChat> = emptyList(), val runningStatus: String = "Checking live status…",
    val provider: String = "codex", val permission: String = "readonly", val busy: Boolean = false, val loading: Boolean = false, val error: String = "", val activity: String = "", val approval: JSONObject? = null,
    val more: Int? = null, val before: Int? = null)
private class BridgeError(val status: Int, message: String) : Exception(message)

class PhoneModel(app: Application) : AndroidViewModel(app) {
    val state = MutableStateFlow(PhoneState())
    private val prefs = DeviceLink.prefs(app)
    private var turn: String? = prefs.getString("phoneTurn", null)
    private var pendingText: String? = prefs.getString("phonePendingText", null)
    private var requestId: String? = prefs.getString("phoneRequestId", null)
    private var pollJob: Job? = null
    init { prefs.getString("phoneChat", null)?.let { id -> select(id) } }
    private fun enc(value: String) = URLEncoder.encode(value, "UTF-8")
    suspend fun request(path: String, body: JSONObject? = null): JSONObject = withContext(Dispatchers.IO) {
        val url = URL(prefs.getString("endpoint", "https://ally.prxptn.com")!!.trimEnd('/') + path)
        require(url.protocol == "https") { "Use an HTTPS bridge" }
        val c = url.openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 8000; c.readTimeout = 20000; c.instanceFollowRedirects = false
            c.setRequestProperty("Authorization", "Bearer ${prefs.getString("token", "")}")
            if (body != null) { c.requestMethod = "POST"; c.doOutput = true; c.setRequestProperty("Content-Type", "application/json"); c.outputStream.use { it.write(body.toString().toByteArray()) } }
            val status = c.responseCode
            val text = (if (status in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: "{}"
            val json = runCatching { JSONObject(text) }.getOrElse { throw BridgeError(status, "Desktop connection unavailable (HTTP $status). Try again shortly.") }
            if (status !in 200..299) throw BridgeError(status, json.optString("error", "Bridge unavailable"))
            json
        } finally { c.disconnect() }
    }
    private fun task(block: suspend () -> Unit) = viewModelScope.launch {
        state.update { it.copy(loading = true, error = "") }
        try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { state.update { it.copy(error = e.message ?: "Connection unavailable") } }
        finally { state.update { it.copy(loading = false) } }
    }
    private fun chat(j: JSONObject) = PhoneChat(j.getString("id"), j.optString("title", "Chat"), j.optString("provider", "codex"), j.optString("cwd"))
    suspend fun refreshRunning() {
        try {
            val a = request("/v1/running").optJSONArray("chats") ?: JSONArray()
            val rows = (0 until a.length()).map { chat(a.getJSONObject(it)) }.distinctBy { it.id }
            state.update { it.copy(running = rows, runningStatus = if (rows.isEmpty()) "No active chats" else "") }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            state.update { it.copy(running = emptyList(), runningStatus = "Live status unavailable · reconnect to desktop") }
        }
    }
    fun catalog(provider: String = state.value.provider, more: Boolean = false) {
        if (state.value.loading) return
        val offset = if (more) state.value.more ?: return else 0
        task { val r = request("/v1/chats?provider=$provider&offset=$offset"); val a = r.optJSONArray("chats") ?: JSONArray()
            state.update { it.copy(provider = provider, chats = ((if (more) it.chats else emptyList()) + (0 until a.length()).map { i -> chat(a.getJSONObject(i)) }).distinctBy { c -> c.id }, more = if (r.isNull("nextOffset")) null else r.optInt("nextOffset")) }
        }
    }
    fun select(id: String) {
        if (state.value.busy || state.value.loading || (state.value.selected != null && (turn != null || pendingText != null))) return
        task { history(id); if (turn != null) poll() }
    }
    private suspend fun history(id: String, older: Boolean = false) {
        val before = if (older) "?before=${state.value.before ?: return}" else ""
        val r = request("/v1/chats/${enc(id)}$before"); val selected = chat(r.getJSONObject("chat")); val a = r.optJSONArray("messages") ?: JSONArray()
        val messages = (0 until a.length()).map { val m = a.getJSONObject(it); PhoneMessage(m.optString("id"), m.optString("role"), m.optString("text")) }
        prefs.edit().putString("phoneChat", selected.id).apply()
        state.update { it.copy(selected = selected, provider = selected.provider, messages = if (older) (messages + it.messages).distinctBy { m -> m.id } else messages, before = if (r.isNull("before")) null else r.optInt("before"), permission = prefs.getString("phonePermission:${selected.id}", "readonly")!!) }
        r.optString("activeTurnId").takeIf { it.isNotBlank() && it != "null" }?.let { turn = it; prefs.edit().putString("phoneTurn", it).apply() }
    }
    fun older() { val id = state.value.selected?.id ?: return; task { history(id, true) } }
    fun newChat() { if (state.value.busy || state.value.loading || turn != null || pendingText != null) return; task {
        val id = prefs.getString("phoneNewRequest", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("phoneNewRequest", it).commit() }
        val r = request("/v1/chats", JSONObject().put("provider", state.value.provider).put("requestId", id)); history(r.getJSONObject("chat").getString("id")); prefs.edit().remove("phoneNewRequest").apply()
    } }
    fun permission(value: String) { if (state.value.busy || value !in setOf("readonly", "edit", "full")) return; prefs.edit().putString("phonePermission:${state.value.selected?.id}", value).apply(); state.update { it.copy(permission = value) } }
    fun send(text: String) {
        val chat = state.value.selected ?: return
        if (state.value.busy || state.value.loading || turn != null || text.isBlank()) return
        if (pendingText != null && text != pendingText) { state.update { it.copy(error = "Retry the previous message first; its delivery is uncertain.") }; return }
        pendingText = text; requestId = requestId ?: UUID.randomUUID().toString()
        prefs.edit().putString("phonePendingText", text).putString("phoneRequestId", requestId).commit()
        task {
            val r = request("/v1/messages", JSONObject().put("provider", chat.provider).put("chatId", chat.id).put("permission", state.value.permission).put("requestId", requestId).put("text", text))
            turn = r.getString("id"); prefs.edit().putString("phoneTurn", turn).remove("phonePendingText").remove("phoneRequestId").commit(); pendingText = null; requestId = null
            state.update { it.copy(messages = it.messages + PhoneMessage("local-${turn}", "user", text)) }; poll()
        }
    }
    fun retry() { if (turn != null) poll() else pendingText?.let(::send) ?: state.value.selected?.let { select(it.id) } ?: catalog() }
    private fun poll() {
        if (pollJob?.isActive == true) return
        val current = turn ?: return
        state.update { it.copy(busy = true, error = "", activity = "Workingâ€¦") }
        pollJob = viewModelScope.launch {
            try {
                while (isActive) {
                    val r = request("/v1/turns/${enc(current)}")
                    state.update { it.copy(activity = r.optString("activity", "Workingâ€¦"), approval = r.optJSONArray("approvals")?.optJSONObject(0)) }
                    if (r.optString("status") in setOf("done", "error")) {
                        turn = null; prefs.edit().remove("phoneTurn").apply()
                        state.value.selected?.let { history(it.id) }
                        state.update { it.copy(error = r.optString("error").takeIf { e -> e != "null" } ?: "") }; break
                    }
                    delay(2000)
                }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                if (e is BridgeError && e.status == 404) { turn = null; prefs.edit().remove("phoneTurn").apply() }
                state.update { it.copy(error = e.message ?: "Reconnect to continue") }
            } finally { state.update { it.copy(busy = turn != null, approval = null) } }
        }
    }
    fun stop() { val id = turn ?: return; task { request("/v1/turns/${enc(id)}/stop", JSONObject()) } }
    fun answer(action: String, values: Map<String, String>) { val id = turn ?: return; val approval = state.value.approval ?: return
        task { request("/v1/turns/${enc(id)}/approvals/${enc(approval.getString("id"))}", JSONObject().put("action", action).put("values", JSONObject(values))) }
    }
}
