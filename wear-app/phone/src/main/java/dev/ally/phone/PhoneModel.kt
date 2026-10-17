package dev.ally.phone

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.ally.device.DeviceLink
import dev.ally.device.BridgeHttpError
import dev.ally.device.reconnectingTurnRead
import dev.ally.device.ReplyCard
import dev.ally.device.ReplyContentParser
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
data class PhoneMessage(val id: String, val role: String, val text: String, val cards: List<ReplyCard> = emptyList())
data class PhoneState(val chats: List<PhoneChat> = emptyList(), val messages: List<PhoneMessage> = emptyList(), val selected: PhoneChat? = null,
    val running: List<PhoneChat> = emptyList(), val runningStatus: String = "Checking live status…", val liveText: String = "",
    val provider: String = "codex", val permission: String = "readonly", val busy: Boolean = false, val loading: Boolean = false, val error: String = "", val activity: String = "", val approval: JSONObject? = null,
    val inputStatus: String = "", val more: Int? = null, val before: Int? = null, val recording: Boolean = false, val transcribing: Boolean = false,
    val microphoneLevel: Float = 0f, val recordingSeconds: Float = 0f, val liveTranscript: String = "", val voiceDraft: String = "")
private typealias BridgeError = BridgeHttpError

class PhoneModel(app: Application) : AndroidViewModel(app) {
    val state = MutableStateFlow(PhoneState())
    private val prefs = DeviceLink.prefs(app)
    private var turn: String? = prefs.getString("phoneTurn", null)
    private var pendingText: String? = prefs.getString("phonePendingText", null)
    private var requestId: String? = prefs.getString("phoneRequestId", null)
    private var inputText: String? = prefs.getString("phoneInputText", null)
    private var inputId: String? = prefs.getString("phoneInputId", null)
    private var inputTurn: String? = prefs.getString("phoneInputTurn", null)
    private fun pulse(strong: Boolean = false) = PhoneHaptics.pulse(getApplication(), strong)
    private var pollJob: Job? = null
    private var voice: PhoneVoice? = null
    private var voiceJob: Job? = null
    private var voiceTurn: String? = null
    private val voiceActive get() = state.value.recording || state.value.transcribing
    init {
        prefs.getString("phoneChat", null)?.let { id -> select(id) }
        inputText?.let { text -> state.update { it.copy(voiceDraft = text, inputStatus = "Previous input delivery unconfirmed. Use Retry before sending again.") } }
    }
    private fun enc(value: String) = URLEncoder.encode(value, "UTF-8")
    suspend fun request(path: String, body: JSONObject? = null, audio: ByteArray? = null): JSONObject = withContext(Dispatchers.IO) {
        val url = URL(prefs.getString("endpoint", "https://ally.prxptn.com")!!.trimEnd('/') + path)
        require(url.protocol == "https") { "Use an HTTPS bridge" }
        val c = url.openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 8000; c.readTimeout = if (audio != null) 120000 else 20000; c.instanceFollowRedirects = false
            c.setRequestProperty("Authorization", "Bearer ${prefs.getString("token", "")}")
            if (audio != null) { c.requestMethod = "POST"; c.doOutput = true; c.setRequestProperty("Content-Type", "audio/wav"); c.outputStream.use { it.write(audio) } }
            else if (body != null) { c.requestMethod = "POST"; c.doOutput = true; c.setRequestProperty("Content-Type", "application/json"); c.outputStream.use { it.write(body.toString().toByteArray()) } }
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
    fun voiceError(message: String) { state.update { it.copy(error = message) } }
    fun startRecording() {
        if (voiceActive || state.value.loading || pendingText != null || inputText != null) return
        if (state.value.selected == null) { voiceError("Choose a conversation before talking."); return }
        try {
            voiceTurn = turn
            voice = PhoneVoice(viewModelScope, prefs.getString("endpoint", "https://ally.prxptn.com")!!, prefs.getString("token", "")!!,
                { audio -> request("/v1/speech/transcribe", audio = audio).optString("text") },
                { text -> state.update { it.copy(liveTranscript = text) } })
            state.update { it.copy(recording = true, liveTranscript = "", voiceDraft = "", error = "", recordingSeconds = 0f) }
            pulse()
            voice!!.start(::finishRecording, { error -> cancelRecording(); voiceError(error) },
                { level, seconds -> state.update { it.copy(microphoneLevel = level, recordingSeconds = seconds) } })
        } catch (e: Exception) { cancelRecording(); voiceError(e.message ?: "Microphone unavailable") }
    }
    fun finishRecording() {
        if (!state.value.recording) return
        val capture = voice ?: return
        pulse()
        state.update { it.copy(recording = false, transcribing = true, microphoneLevel = 0f) }
        voiceJob = viewModelScope.launch {
            try {
                val text = capture.finish()
                state.update { it.copy(transcribing = false, liveTranscript = "") }
                voice = null
                when (voiceDelivery(voiceTurn, turn, prefs.getBoolean("phone.voice.review",false))) {
                    VoiceDelivery.REVIEW -> state.update { it.copy(voiceDraft = text) }
                    VoiceDelivery.FINISHED -> state.update { it.copy(voiceDraft = text, inputStatus = "The response finished while you were talking. Review your words and send when ready.") }
                    VoiceDelivery.SEND -> send(text)
                }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                state.update { it.copy(transcribing = false, voiceDraft = it.liveTranscript, error = "Voice was not sent. ${e.message ?: "Transcription failed."} Review any captured words before sending.") }
            } finally { capture.cancel(); if (voice === capture) voice = null }
        }
    }
    fun cancelRecording() {
        if (voiceActive) pulse()
        voice?.cancel(); voice = null; voiceJob?.cancel(); voiceJob = null
        state.update { it.copy(recording = false, transcribing = false, microphoneLevel = 0f, liveTranscript = "") }
    }
    fun voiceDraftRead() { state.update { it.copy(voiceDraft = "") } }
    fun catalog(provider: String = state.value.provider, more: Boolean = false) {
        if (voiceActive || state.value.loading) return
        val offset = if (more) state.value.more ?: return else 0
        task { val r = request("/v1/chats?provider=$provider&offset=$offset"); val a = r.optJSONArray("chats") ?: JSONArray()
            state.update { it.copy(provider = provider, chats = ((if (more) it.chats else emptyList()) + (0 until a.length()).map { i -> chat(a.getJSONObject(i)) }).distinctBy { c -> c.id }, more = if (r.isNull("nextOffset")) null else r.optInt("nextOffset")) }
        }
    }
    fun select(id: String) {
        if (voiceActive || state.value.busy || state.value.loading || (state.value.selected != null && (turn != null || pendingText != null || inputText != null))) return
        task { history(id); if (turn != null) poll() }
    }
    private suspend fun history(id: String, older: Boolean = false) {
        val before = if (older) "?before=${state.value.before ?: return}" else ""
        val r = request("/v1/chats/${enc(id)}$before"); val selected = chat(r.getJSONObject("chat")); val a = r.optJSONArray("messages") ?: JSONArray()
        val messages = (0 until a.length()).map { val m = a.getJSONObject(it); val reply = ReplyContentParser.parse(m); PhoneMessage(m.optString("id"), m.optString("role"), reply.text, reply.cards) }
        prefs.edit().putString("phoneChat", selected.id).apply()
        state.update { it.copy(selected = selected, provider = selected.provider, liveText = if (it.selected?.id == selected.id) it.liveText else "", messages = if (older) (messages + it.messages).distinctBy { m -> m.id } else messages, before = if (r.isNull("before")) null else r.optInt("before"), permission = prefs.getString("phonePermission:${selected.id}", "readonly")!!) }
        r.optString("activeTurnId").takeIf { it.isNotBlank() && it != "null" }?.let { turn = it; prefs.edit().putString("phoneTurn", it).apply() }
    }
    fun older() { if(voiceActive) return; val id = state.value.selected?.id ?: return; task { history(id, true) } }
    fun newChat() { if (voiceActive || state.value.busy || state.value.loading || turn != null || pendingText != null || inputText != null) return; task {
        val id = prefs.getString("phoneNewRequest", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("phoneNewRequest", it).commit() }
        val r = request("/v1/chats", JSONObject().put("provider", state.value.provider).put("requestId", id)); history(r.getJSONObject("chat").getString("id")); prefs.edit().remove("phoneNewRequest").apply()
    } }
    fun permission(value: String) { if (voiceActive || state.value.busy || value !in setOf("readonly", "edit", "full")) return; prefs.edit().putString("phonePermission:${state.value.selected?.id}", value).apply(); state.update { it.copy(permission = value) } }
    fun send(text: String) {
        val chat = state.value.selected ?: return
        if (voiceActive || state.value.loading || text.isBlank()) return
        if (state.value.busy || turn != null) { addInput(text); return }
        if (inputText != null) { state.update { it.copy(error = "Retry the unconfirmed input first.", voiceDraft = text) }; return }
        if (pendingText != null && text != pendingText) { state.update { it.copy(error = "Retry the previous message first; its delivery is uncertain.") }; return }
        pendingText = text; requestId = requestId ?: UUID.randomUUID().toString()
        prefs.edit().putString("phonePendingText", text).putString("phoneRequestId", requestId).commit()
        task {
            val r = request("/v1/messages", JSONObject().put("provider", chat.provider).put("chatId", chat.id).put("permission", state.value.permission).put("requestId", requestId).put("text", text))
            turn = r.getString("id"); prefs.edit().putString("phoneTurn", turn).remove("phonePendingText").remove("phoneRequestId").commit(); pendingText = null; requestId = null
            pulse()
            state.update { it.copy(liveText = "", messages = it.messages + PhoneMessage("local-${turn}", "user", text)) }; poll()
        }
    }
    private fun addInput(text: String) {
        if (state.value.loading) return
        if (inputText != null && inputText != text) { state.update { it.copy(error = "Retry the previous input first; its delivery is uncertain.", voiceDraft = text) }; return }
        val target = inputTurn ?: turn ?: return
        inputText = text; inputTurn = target; inputId = inputId ?: UUID.randomUUID().toString()
        prefs.edit().putString("phoneInputText", text).putString("phoneInputTurn", target).putString("phoneInputId", inputId).commit()
        task {
            try {
                val result = request("/v1/turns/${enc(target)}/input", JSONObject().put("text", text).put("requestId", inputId))
                state.update { it.copy(inputStatus = if (result.optString("mode") == "steered") "Added to current work" else "Queued after this response",
                    messages = it.messages + PhoneMessage("input-$inputId", "user", text)) }
                inputText = null; inputId = null; inputTurn = null
                prefs.edit().remove("phoneInputText").remove("phoneInputId").remove("phoneInputTurn").apply()
                pulse()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                state.update { it.copy(voiceDraft = text) }
                throw e
            }
        }
    }
    fun dismissInput() {
        if (state.value.loading) return
        inputText = null; inputId = null; inputTurn = null
        prefs.edit().remove("phoneInputText").remove("phoneInputId").remove("phoneInputTurn").apply()
        state.update { it.copy(error = "", inputStatus = "Check chat history before resending unconfirmed input") }
    }
    fun retry() { if (inputText != null) addInput(inputText!!) else if (turn != null) poll() else pendingText?.let(::send) ?: state.value.selected?.let { select(it.id) } ?: catalog() }
    private fun poll() {
        if (pollJob?.isActive == true) return
        val current = turn ?: return
        state.update { it.copy(busy = true, error = "", activity = "Working…") }
        pollJob = viewModelScope.launch {
            try {
                while (isActive) {
                    val r = reconnectingTurnRead({ state.update { it.copy(activity = "Reconnecting… Your task is still on the desktop", approval = null) } }) {
                        request("/v1/turns/${enc(current)}")
                    }
                    val nextApproval = r.optJSONArray("approvals")?.optJSONObject(0)
                    if (nextApproval != null && nextApproval.optString("id") != state.value.approval?.optString("id")) pulse(true)
                    state.update { it.copy(liveText = r.optString("liveText").take(12000), activity = r.optString("activity", "Working…"), approval = nextApproval) }
                    if (r.optString("status") in setOf("done", "error")) {
                        pulse(true)
                        turn = null; prefs.edit().remove("phoneTurn").apply()
                        // Keep the answer visible even if the separate history read loses the network.
                        val finalReply = r.optJSONObject("reply")?.let(ReplyContentParser::parse)
                        val finalText = finalReply?.text
                        state.update { it.copy(liveText = finalText ?: it.liveText) }
                        try {
                            state.value.selected?.let { history(it.id) }
                        } catch (e: CancellationException) { throw e } catch (_: Exception) { /* Final text remains readable. */ }
                        if (finalReply != null) state.update { it.copy(liveText = "", messages = if (it.messages.lastOrNull()?.let { m -> m.role == "assistant" && m.text == finalReply.text && m.cards == finalReply.cards } == true) it.messages else it.messages + PhoneMessage("$current-assistant", "assistant", finalReply.text, finalReply.cards)) }
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
    override fun onCleared() { cancelRecording(); super.onCleared() }
    fun stop() { val id = turn ?: return; task { request("/v1/turns/${enc(id)}/stop", JSONObject()) } }
    fun answer(action: String, values: Map<String, String>) { val id = turn ?: return; val approval = state.value.approval ?: return
        task { request("/v1/turns/${enc(id)}/approvals/${enc(approval.getString("id"))}", JSONObject().put("action", action).put("values", JSONObject(values))); pulse() }
    }
}
