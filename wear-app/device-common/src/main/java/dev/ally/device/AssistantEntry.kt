package dev.ally.device

import android.content.Context
import android.content.pm.PackageManager
import dev.ally.device.voice.VoiceRecorder
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

data class AssistantChoice(val id: String, val title: String, val provider: String = "codex")
data class AssistantEntryState(val status: String, val text: String = "", val recording: Boolean = false,
    val level: Float = 0f, val busy: Boolean = false, val choices: List<AssistantChoice> = emptyList(), val screenNotice: String = "")

/** One assistant invocation. Existing chats are never sent to without a choice. */
internal class AssistantEntry(private val context: Context, private val scope: CoroutineScope, private val host: AssistantHost) {
    val state = MutableStateFlow<AssistantEntryState?>(null)
    var entry = false; private set
    private var recorder: VoiceRecorder? = null
    private fun silencePolicy() = if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_WATCH)) AssistantSilence() else AssistantSilence.phone()
    private var policy = silencePolicy()
    private var automatic = false
    private var job: Job? = null
    private var text = ""
    private var choices = emptyList<AssistantChoice>()
    private var requestId = UUID.randomUUID().toString()
    private var target: AssistantChoice? = null
    private var acceptedTurn: String? = null
    private var permission = "readonly"
    private val screen = AssistantScreenContext()
    private var screenAttachment: String? = null
    private var submissionText: String? = null
    private var screenNotice = ""
    fun beginScreen(allow: Boolean, screenshot: Boolean, assist: Boolean): Long {
        val fresh = text.isBlank() && state.value?.busy != true && recorder == null
        if (!fresh) { screen.seal(); return -1 }
        if (fresh && allow) entry = true
        val token = screen.begin(allow && fresh, screenshot, assist)
        if (fresh) screenNotice = screen.notice
        return token
    }
    fun screenAccepts(token: Long) = screen.accepts(token)
    fun screenshot(token: Long, bytes: ByteArray?) { screen.screenshot(token, bytes); refreshScreenNotice() }
    fun assist(token: Long, text: String, own: Boolean) { screen.assist(token, text, own); refreshScreenNotice() }
    private fun refreshScreenNotice() { if (screen.enabled) screenNotice = screen.notice; state.value = state.value?.copy(screenNotice = screenNotice) }
    fun releaseScreen() {
        val hadScreen = screen.enabled || screenNotice.isNotBlank()
        screen.clear()
        if (hadScreen && submissionText == null && screenAttachment == null) screenNotice = "Screen unavailable"
    }

    private val prefs = DeviceLink.prefs(context)
    init {
        runCatching { JSONObject(prefs.getString("assistantEntryDraft", "{}")!!) }.getOrNull()?.let { draft ->
            text = draft.optString("text").take(12000)
            if (text.isNotBlank()) {
                entry = true; requestId = draft.optString("requestId").takeIf { it.matches(Regex("[\\w-]{1,80}")) } ?: UUID.randomUUID().toString()
                draft.optJSONObject("target")?.let { c -> target = AssistantChoice(c.getString("id"), c.getString("title"), c.getString("provider")) }
                permission = draft.optString("permission", "readonly").takeIf { it in setOf("readonly", "edit", "full") } ?: "readonly"
                acceptedTurn = draft.optString("acceptedTurn").takeIf { it.isNotBlank() }
                screenAttachment = draft.optString("screenAttachment").takeIf { it.matches(Regex("[a-f0-9]{64}")) }
                submissionText = draft.optString("submissionText").takeIf { it.isNotBlank() }
                screenNotice = if (screenAttachment != null) "Screen attached" else if (draft.optBoolean("hadScreen")) "Screen unavailable · your words are kept" else ""
                fail("Unfinished request · tap Retry to check it")
            }
        }
    }
    private fun save() {
        val draft = JSONObject().put("text", text).put("requestId", requestId).put("permission", permission)
        target?.let { draft.put("target", JSONObject().put("id", it.id).put("title", it.title).put("provider", it.provider)) }
        acceptedTurn?.let { draft.put("acceptedTurn", it) }
        screenAttachment?.let { draft.put("screenAttachment", it) }
        submissionText?.let { draft.put("submissionText", it) }
        draft.put("hadScreen", screen.enabled || screenNotice.isNotBlank())
        check(prefs.edit().putString("assistantEntryDraft", draft.toString()).commit()) { "Could not keep your request; try again" }
    }

    fun activate() {
        // A lost response or unfinished choice retains the original send identity.
        if (text.isNotBlank() || state.value?.busy == true) {
            entry = true
            if (state.value == null) fail("Unfinished request · tap Retry to check it")
            return
        }
        entry = true; requestId = UUID.randomUUID().toString(); target = null; acceptedTurn = null; screenAttachment = null; submissionText = null
        start(true)
    }
    fun start(auto: Boolean = false) {
        if (recorder != null || state.value?.busy == true || text.isNotBlank()) return
        automatic = auto; policy = silencePolicy()
        val capture = VoiceRecorder(); recorder = capture
        host.prepareVoice(); AssistantVisibility.recording = true
        state.value = AssistantEntryState(if (auto) "Listening…" else "Listening · release to send", recording = true)
        try {
            capture.start(scope, { finish() }, { fail(it); cancelCapture() }, { level, seconds ->
                state.value = state.value?.copy(level = level)
                if (automatic && policy.sample(level, seconds)) { if (policy.heard) finish() else quiet() }
            })
        } catch (e: Exception) { cancelCapture(); fail(e.message ?: "Microphone unavailable") }
    }
    val automaticRecording get() = automatic && recorder != null
    fun release() { if (!automatic) finish() }
    fun cancelCapture() { recorder?.cancel(); recorder = null; AssistantVisibility.recording = false; if (state.value?.recording == true) state.value = null }
    fun pause() {
        cancelCapture()
        if (target == null && state.value?.busy == true) {
            job?.cancel()
            if (text.isBlank()) state.value = null else fail("Request paused · your words are kept")
        }
    }
    val canBrowse get() = !(state.value?.busy == true && target != null)
    fun browse() {
        pause()
        releaseScreen()
        entry = false; state.value = null
        // Pending words stay in private preferences for the next activation.
    }
    private fun quiet() { cancelCapture(); releaseScreen(); state.value = null }
    fun finish() {
        val capture = recorder ?: return; recorder = null
        state.value = AssistantEntryState("Finishing your words…", busy = true)
        job = scope.launch {
            try {
                val audio = capture.stop()
                AssistantVisibility.recording = false
                val transcript = request("/v1/speech/transcribe", audio = audio).optString("text").trim()
                if (transcript.isBlank()) { releaseScreen(); state.value = null; return@launch }
                text = transcript; save(); route()
            } catch (e: CancellationException) { throw e } catch (e: Exception) { fail(e.message ?: "Voice unavailable") }
            finally { capture.cancel(); AssistantVisibility.recording = false }
        }
    }
    fun typed(value: String) {
        if (value.isBlank() || state.value?.busy == true || text.isNotBlank()) return
        cancelCapture(); text = value.trim(); job = scope.launch { try { save(); route() } catch(e: CancellationException) { throw e } catch(e: Exception) { fail(e.message ?: "Chat matching unavailable") } }
    }
    private suspend fun route() {
        state.value = AssistantEntryState("Finding the right conversation…", text, busy = true)
        val result = request("/v1/assistant/route", JSONObject().put("text", text))
        choices = (0 until (result.optJSONArray("chats")?.length() ?: 0)).map { i ->
            val c = result.getJSONArray("chats").getJSONObject(i)
            AssistantChoice(c.getString("id"), c.getString("title"), c.getString("provider"))
        }.take(3)
        if (result.getString("kind") == "new") deliver(null)
        else state.value = AssistantEntryState(if (result.optBoolean("limited")) "Choose a conversation" else "Related conversations · choose one", text,
            choices = choices + AssistantChoice("__new", "New chat"))
    }
    fun choose(id: String) {
        if (state.value?.busy == true) return
        if (id == "__retry") {
            job = scope.launch { try { if (target != null) deliver(target) else route() } catch(e: CancellationException) { throw e } catch(e: Exception) { fail(e.message ?: "Request unavailable") } }; return
        }
        val selected = if (id == "__new") null else choices.find { it.id == id } ?: return
        job = scope.launch { try { deliver(selected) } catch(e: CancellationException) { throw e } catch(e: Exception) { fail(e.message ?: "Message not confirmed") } }
    }
    private suspend fun deliver(selected: AssistantChoice?) {
        state.value = AssistantEntryState("Opening conversation…", text, busy = true)
        if (target == null) {
            target = selected ?: request("/v1/chats", JSONObject().put("provider", host.provider).put("requestId", requestId)).getJSONObject("chat").let {
                AssistantChoice(it.getString("id"), it.getString("title"), it.getString("provider"))
            }
            permission = host.permissionFor(target!!.id)
            save()
        }
        val chat = target!!
        if (submissionText == null) {
            screen.settle(); refreshScreenNotice()
            val image = screen.image()
            if (image != null && screenAttachment == null) {
                state.value = AssistantEntryState("Attaching screen…", text, busy = true)
                try { screenAttachment = request("/v1/attachments", image = image).getJSONObject("attachment").getString("id") } finally { image.fill(0) }
                save()
            }
            val contextText = screen.text()
            submissionText = AssistantSubmission.text(text, contextText)
            save(); screen.clear()
        }
        if (acceptedTurn == null) acceptedTurn = request("/v1/messages", AssistantSubmission.message(chat.provider, chat.id, requestId, permission, submissionText!!, screenAttachment)).getString("id")
        save()
        // Adopting the exact receipt starts existing polling; it never resends words.
        host.acceptTurn(chat.id, acceptedTurn!!)
        prefs.edit().remove("assistantEntryDraft").commit()
        entry = false; text = ""; choices = emptyList(); target = null; acceptedTurn = null; screen.clear(); screenAttachment = null; submissionText = null; screenNotice = ""; state.value = null
    }
    private fun fail(message: String) {
        state.value = AssistantEntryState(message, text, choices = if (text.isBlank()) emptyList() else listOf(AssistantChoice("__retry", "Retry")))
    }
    fun overlay(base: AssistantSnapshot): AssistantSnapshot = state.value?.let { s ->
        base.copy(title = "New request", status = s.status + if (screenNotice.isNotBlank()) " · $screenNotice" else "", text = s.text, recording = s.recording, working = s.busy,
            level = s.level, needsAttention = s.choices.isNotEmpty(), readReceipt = null, choices = s.choices)
    } ?: base

    private suspend fun request(path: String, body: JSONObject? = null, audio: ByteArray? = null, image: ByteArray? = null): JSONObject = withContext(Dispatchers.IO) {
        val prefs = DeviceLink.prefs(context)
        val url = URL(prefs.getString("endpoint", "https://ally.prxptn.com")!!.trimEnd('/') + path)
        require(url.protocol == "https" || (url.protocol == "http" && url.host in setOf("127.0.0.1", "localhost"))) { "Use an HTTPS bridge" }
        val c = url.openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 8000; c.readTimeout = if (audio != null) 120000 else 30000; c.instanceFollowRedirects = false
            c.setRequestProperty("Authorization", "Bearer ${prefs.getString("token", "")}")
            val payload = image ?: audio ?: body?.toString()?.toByteArray()
            if (image != null) c.setRequestProperty("X-Ally-Filename", "Assistant-screen.png")
            if (payload != null) { c.requestMethod = "POST"; c.doOutput = true; c.setRequestProperty("Content-Type", if (image != null) "image/png" else if (audio != null) "audio/wav" else "application/json"); c.setFixedLengthStreamingMode(payload.size); c.outputStream.use { it.write(payload) } }
            val status = c.responseCode
            val result = runCatching { JSONObject((if (status in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: "{}") }.getOrElse { error("Desktop connection unavailable") }
            check(status in 200..299) { result.optString("error", "Desktop connection unavailable") }
            result
        } finally { c.disconnect() }
    }
}
