package dev.ally.watch

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject
import java.util.UUID

class WatchViewModel(application: Application) : AndroidViewModel(application) {
    private val prefs = application.getSharedPreferences("ally-watch", 0)
    private val mutable = MutableStateFlow(WatchState(provider = prefs.getString("provider", "codex")!!, muted = prefs.getBoolean("muted", false)))
    val state = mutable.asStateFlow()
    var endpoint: String
        get() = prefs.getString("endpoint", "http://127.0.0.1:18765")!!
        set(value) { prefs.edit().putString("endpoint", value.trim()).apply() }
    var token: String
        get() = prefs.getString("token", "")!!
        set(value) { prefs.edit().putString("token", value.trim()).apply() }
    private val api = WatchApi({ endpoint }, { token })
    private val voice = VoiceRecorder()
    private var work: Job? = null
    private var lastText: String? = null
    private var lastAudio: ByteArray? = null
    private var requestId: String? = null
    var foreground = false
    val busy get() = mutable.value.phase in setOf(Phase.RECORDING, Phase.UPLOADING, Phase.THINKING)

    init {
        runCatching { JSONObject(prefs.getString("reply", "{}")!!) }.getOrNull()?.let { saved ->
            mutable.update { it.copy(reply = CardParser.parse(saved)) }
        }
        runCatching { JSONObject(prefs.getString("activity", "{}")!!) }.getOrNull()?.let { saved ->
            mutable.update { it.copy(steps = ActivityParser.steps(saved), usage = ActivityParser.usage(saved), transcript = saved.optString("transcript")) }
        }
        val savedTurn = prefs.getString("turn", null)
        if (savedTurn != null) work = viewModelScope.launch { poll(savedTurn) } else refresh()
    }
    fun configure(url: String, secret: String) {
        if (busy) return
        work?.cancel(); work = null
        endpoint = url; token = secret
        mutable.update { it.copy(phase = Phase.OFFLINE) }; refresh()
    }
    fun refresh() {
        if (busy || work?.isActive == true) return
        val pending = prefs.getString("turn", null)
        if (pending != null) { work = viewModelScope.launch { poll(pending) }; return }
        if (mutable.value.phase == Phase.ERROR) return
        work = viewModelScope.launch {
            try {
                val status = api.request("/v1/status")
                mutable.update { it.copy(phase = if (it.reply.text.isBlank()) Phase.IDLE else Phase.READY,
                    context = "Watch · ${if (it.provider == "codex") "Codex" else "Claude"}",
                    voiceReady = status.optBoolean("voiceAvailable"),
                    voiceState = status.optString("voiceState", "offline"),
                    detail = if (status.optBoolean("voiceAvailable")) "Hold to talk" else status.optString("voiceDetail", "Voice unavailable · text ready")) }
            } catch (e: Exception) { fail(e, Phase.OFFLINE) }
        }
    }
    fun provider(value: String) {
        if (busy || prefs.contains("turn")) return
        lastText = null; lastAudio = null; requestId = null
        prefs.edit().putString("provider", value).remove("reply").remove("activity").apply()
        mutable.update { it.copy(provider = value, context = "Watch · ${if (value == "codex") "Codex" else "Claude"}",
            reply = WatchReply("", emptyList()), steps = emptyList(), usage = "", transcript = "", turnId = null, phase = Phase.IDLE, detail = "Hold to talk") }
    }
    fun mute() {
        val muted = !mutable.value.muted
        prefs.edit().putBoolean("muted", muted).apply()
        mutable.update { it.copy(muted = muted) }
        if (muted) cancelRecording()
    }
    fun startRecording() {
        if (busy || mutable.value.muted || mutable.value.phase == Phase.OFFLINE) return
        if (!mutable.value.voiceReady) { refresh(); return }
        try {
            voice.start(viewModelScope, { finishRecording() }, { error -> cancelRecording(); mutable.update { it.copy(phase = Phase.ERROR, detail = error) } },
                { level, seconds -> mutable.update { if (it.phase == Phase.RECORDING) it.copy(microphoneLevel = level, recordingSeconds = seconds) else it } })
            mutable.update { it.copy(phase = Phase.RECORDING, detail = "Listening · release to send", microphoneLevel = 0f, recordingSeconds = 0f) }
        } catch (e: Exception) { voice.cancel(); fail(e) }
    }
    fun finishRecording() {
        if (mutable.value.phase != Phase.RECORDING) return
        clearReply()
        mutable.update { it.copy(phase = Phase.UPLOADING, transcript = "", microphoneLevel = 0f, detail = "Sending your voice…") }
        work = viewModelScope.launch {
            try {
                val audio = voice.stop()
                lastText = null; lastAudio = audio; requestId = UUID.randomUUID().toString()
                submit(null, audio)
            } catch (e: Exception) { fail(e) }
        }
    }
    fun cancelRecording() {
        if (mutable.value.phase != Phase.RECORDING) return
        voice.cancel()
        mutable.update { it.copy(phase = Phase.IDLE, microphoneLevel = 0f, recordingSeconds = 0f, detail = "Recording cancelled") }
    }
    fun send(text: String) {
        if (busy || text.isBlank()) return
        clearReply()
        lastText = text.take(4000); lastAudio = null; requestId = UUID.randomUUID().toString()
        mutable.update { it.copy(phase = Phase.UPLOADING, transcript = text, detail = "Sending…") }
        work = viewModelScope.launch { try { submit(lastText, null) } catch (e: Exception) { fail(e) } }
    }
    fun retry() {
        if (busy) return
        val pending = prefs.getString("turn", null)
        if (pending != null) { work = viewModelScope.launch { poll(pending) }; return }
        if (lastText == null && lastAudio == null) { mutable.update { it.copy(phase = Phase.OFFLINE) }; refresh(); return }
        mutable.update { it.copy(phase = Phase.UPLOADING, detail = "Retrying…") }
        work = viewModelScope.launch { try { submit(lastText, lastAudio) } catch (e: Exception) { fail(e) } }
    }
    private fun clearReply() {
        prefs.edit().remove("reply").remove("activity").apply()
        mutable.update { it.copy(reply = WatchReply("", emptyList()), steps = emptyList(), usage = "", turnId = null) }
    }
    private suspend fun submit(text: String?, audio: ByteArray?) {
        val provider = mutable.value.provider
        val result = if (audio != null) api.request("/v1/audio?provider=$provider&requestId=$requestId", audio, "audio/wav")
        else api.request("/v1/messages", JSONObject().put("provider", provider).put("requestId", requestId).put("text", text).toString().toByteArray())
        val id = result.getString("id")
        prefs.edit().putString("turn", id).apply()
        lastAudio = null
        poll(id)
    }
    private suspend fun poll(id: String) {
        mutable.update { it.copy(phase = Phase.THINKING, turnId = id, detail = "Thinking…") }
        try {
            repeat(240) {
                val result = api.request("/v1/turns/$id")
                result.optString("transcript").takeIf { it.isNotBlank() }?.let { lastText = it }
                mutable.update { it.copy(transcript = result.optString("transcript", it.transcript), detail = result.optString("activity", "Thinking…"), steps = ActivityParser.steps(result), usage = ActivityParser.usage(result)) }
                when (result.optString("status")) {
                    "done" -> {
                        val json = result.getJSONObject("reply")
                        prefs.edit().remove("turn").putString("reply", json.toString()).putString("activity", JSONObject().put("steps", result.optJSONArray("steps")).put("usage", result.optJSONObject("usage")).put("transcript", result.optString("transcript")).toString()).apply()
                        mutable.update { it.copy(phase = Phase.READY, reply = CardParser.parse(json), detail = "Response ready", readySequence = it.readySequence + 1) }
                        if (!foreground && !mutable.value.muted) WatchNotifications.show(getApplication(), "Ally has your answer", json.optString("text"))
                        return
                    }
                    "error" -> { prefs.edit().remove("turn").apply(); requestId = UUID.randomUUID().toString(); error(result.optString("error", "Agent unavailable")) }
                }
                delay(1500)
            }
            error("Still working. Tap Retry to check again.")
        } catch (e: Exception) {
            if (e.message?.contains("expired") == true) prefs.edit().remove("turn").apply()
            fail(e)
        }
    }
    private fun fail(e: Exception, phase: Phase = Phase.ERROR) {
        if (e is CancellationException) throw e
        mutable.update { it.copy(phase = phase, detail = e.message?.take(180) ?: "Connection interrupted. Retry when ready.") }
    }
    override fun onCleared() { voice.cancel(); super.onCleared() }
}
