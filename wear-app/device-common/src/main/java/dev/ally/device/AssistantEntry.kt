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
    val level: Float = 0f, val busy: Boolean = false, val choices: List<AssistantChoice> = emptyList(), val screenNotice: String = "", val selected: String? = null)

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
    private var picker: AssistantRoutePicker.Picker? = null
    private var selected: String? = null
    private var limit = AssistantRoutePicker.PAGE
    private var query = ""
    private var hits = emptyList<AssistantChoice>()
    // Next /v1/chats page per engine; null once that engine has no more.
    private var offsets = mapOf<String, Int?>()
    private var lookup: Job? = null
    private var loadingMore = false
    private class Kept(val text: String, val requestId: String, val picker: AssistantRoutePicker.Picker?, val selected: String?, val offsets: Map<String, Int?>)
    // Words replaced by a re-record return if nothing new is heard.
    private var kept: Kept? = null
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
        if ((text.isNotBlank() || state.value?.busy == true) && canReplace()) resetUnsent(keep = true)
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
        if (text.isNotBlank() && canReplace()) resetUnsent(keep = true)
        if (recorder != null || state.value?.busy == true || text.isNotBlank()) return
        automatic = auto; policy = silencePolicy()
        val capture = VoiceRecorder(); recorder = capture
        host.prepareVoice(); AssistantVisibility.recording = true
        state.value = AssistantEntryState(if (auto) "Listening…" else "Listening · release to send", recording = true)
        try {
            capture.start(scope, { if(recorder === capture) finish() }, { if(recorder === capture) { fail(it); cancelCapture() } }, { level, seconds ->
                if(recorder !== capture) return@start
                state.value = state.value?.copy(level = level)
                if (automatic && policy.sample(level, seconds)) { if (policy.heard) finish() else quiet() }
            })
        } catch (e: Exception) { cancelCapture(); fail(e.message ?: "Microphone unavailable") }
    }
    val automaticRecording get() = automatic && recorder != null
    fun release() { if (!automatic) finish() }
    fun cancelCapture() {
        recorder?.cancel(); recorder = null; AssistantVisibility.recording = false
        if (state.value?.recording == true) { state.value = null; restoreKept() }
    }
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
    private fun quiet() { cancelCapture(); releaseScreen(); state.value = null; restoreKept() }
    private fun restoreKept(): Boolean {
        val previous = kept?.takeIf { text.isBlank() && recorder == null } ?: return false
        kept = null; entry = true
        text = previous.text; requestId = previous.requestId; picker = previous.picker; selected = previous.selected; offsets = previous.offsets
        runCatching { save() }
        if (picker != null) showPicker("Nothing new heard · earlier words kept") else fail("Nothing new heard · earlier words kept")
        return true
    }
    fun finish() {
        val capture = recorder ?: return; recorder = null
        state.value = AssistantEntryState("Finishing your words…", busy = true)
        job = scope.launch {
            try {
                val audio = capture.stop()
                AssistantVisibility.recording = false
                val transcript = request("/v1/speech/transcribe", audio = audio).optString("text").trim()
                if (transcript.isBlank()) { releaseScreen(); state.value = null; restoreKept(); return@launch }
                text = transcript; kept = null; save(); route()
            } catch (e: CancellationException) { throw e } catch (e: Exception) { if (!restoreKept()) fail(e.message ?: "Voice unavailable") }
            finally { capture.cancel(); AssistantVisibility.recording = recorder != null }
        }
    }
    fun typed(value: String) {
        if (value.isBlank() || state.value?.busy == true || text.isNotBlank()) return
        cancelCapture(); text = value.trim(); kept = null; job = scope.launch { try { save(); route() } catch(e: CancellationException) { throw e } catch(e: Exception) { fail(e.message ?: "Chat matching unavailable") } }
    }
    private suspend fun route() {
        state.value = AssistantEntryState("Finding the right conversation…", text, busy = true,choices=listOf(AssistantChoice("__rerecord","Try again")))
        // Detached so a slow list never delays the suggestion; it only shortens the list.
        val recent = scope.async { recentChats() }
        val result = try { withTimeoutOrNull(10000) { request("/v1/assistant/route", JSONObject().put("text", text)) } ?: error("Chat matching timed out · try again") }
            catch (e: Throwable) { recent.cancel(); throw e }
        val others = withTimeoutOrNull(2500) { recent.await() } ?: emptyList<Triple<String, List<JSONObject>, Int?>>().also { recent.cancel() }
        val options = AssistantRoutePicker.options(result, others.flatMap { it.second }, host.provider)
        picker = options; selected = options.suggested; offsets = others.associate { it.first to it.third }
        limit = AssistantRoutePicker.PAGE; query = ""; hits = emptyList()
        showPicker(if (result.optBoolean("limited")) "No clear match · pick a chat, then Send" else "Suggested chat · Send or pick another")
    }
    /** Recent chats fill the compact list; failures only shorten it. */
    private suspend fun recentChats(from: Map<String, Int?> = mapOf("codex" to 0, "claude" to 0)): List<Triple<String, List<JSONObject>, Int?>> = coroutineScope {
        from.filterValues { it != null }.map { (engine, offset) -> async {
            try {
                val page = request("/v1/chats?provider=$engine&offset=$offset")
                Triple(engine, page.optJSONArray("chats")?.let { a -> (0 until a.length()).map { a.getJSONObject(it) } }.orEmpty(), if (page.isNull("nextOffset")) null else page.optInt("nextOffset"))
            } catch (e: CancellationException) { throw e } catch (_: Exception) { Triple(engine, emptyList<JSONObject>(), offset) }
        } }.awaitAll()
    }
    private fun rows() = picker?.let { AssistantRoutePicker.rows(it, limit, query, hits) }.orEmpty()
    private fun showPicker(status: String) {
        val current = picker ?: return
        val searching = query.isNotBlank()
        val more = !searching && (current.chats.size > limit || offsets.values.any { it != null })
        val controls = (if (more) listOf(AssistantChoice(AssistantRoutePicker.MORE, if (loadingMore) "Loading more chats…" else "More chats")) else emptyList()) +
            listOf(AssistantChoice(AssistantRoutePicker.SEARCH, if (searching) "Clear search" else "Search chats"), AssistantChoice(AssistantRoutePicker.RERECORD, "Try again"))
        val shown = rows()
        state.value = AssistantEntryState(if (searching && shown.isEmpty()) "No chats match “${query.trim()}”" else status, text, choices = shown + controls, selected = selected)
    }
    private fun pickerStatus() = if (selected == picker?.suggested) "Suggested chat · Send or pick another" else "Chat changed · tap Send"
    /** Filters loaded chats at once, then adds desktop search hits. Never sends. */
    fun search(value: String) {
        if (picker == null || target != null || state.value?.busy == true) return
        query = value.take(200); lookup?.cancel()
        if (query.isBlank()) hits = emptyList()
        showPicker(pickerStatus())
        val q = query.trim(); if (q.length < 2) return
        lookup = scope.launch {
            delay(300)
            val found = try { AssistantRoutePicker.hits(request("/v1/chat-search?q=" + java.net.URLEncoder.encode(q, "UTF-8"))) }
                catch (e: CancellationException) { throw e } catch (_: Exception) { return@launch }
            if (query.trim() == q && picker != null) { hits = found; showPicker(pickerStatus()) }
        }
    }
    private fun loadMore() {
        val current = picker ?: return
        if (loadingMore) return
        if (current.chats.size > limit) { limit += AssistantRoutePicker.PAGE; showPicker(pickerStatus()); return }
        loadingMore = true; showPicker(pickerStatus())
        lookup = scope.launch {
            try {
                val pages = recentChats(offsets)
                picker = picker?.let { p -> pages.fold(p) { acc, page -> AssistantRoutePicker.more(acc, page.second) } }
                offsets = offsets + pages.associate { it.first to it.third }
                limit += AssistantRoutePicker.PAGE
            } finally { loadingMore = false; if (picker != null && target == null) showPicker(pickerStatus()) }
        }
    }
    fun choose(id: String) {
        if(id == AssistantRoutePicker.RERECORD) { if(canReplace()) { resetUnsent(keep = true); entry=true;start(true) };return }
        if (state.value?.busy == true) return
        if (id == "__retry") {
            if (target == null && selected != null && picker != null) { showPicker("Check the chat, then Send"); return }
            job = scope.launch { try { if (target != null) deliver(target) else route() } catch(e: CancellationException) { throw e } catch(e: Exception) { fail(e.message ?: "Request unavailable") } }; return
        }
        if (id == AssistantRoutePicker.SEND) {
            val pick = selected ?: return
            val destination = if (pick == AssistantRoutePicker.NEW) null else (picker?.chats.orEmpty() + hits).find { it.id == pick } ?: return
            lookup?.cancel()
            job = scope.launch { try { deliver(destination) } catch(e: CancellationException) { throw e } catch(e: Exception) { fail(e.message ?: "Message not confirmed") } }
            return
        }
        if (id == AssistantRoutePicker.MORE) { if (target == null) loadMore(); return }
        if (id == AssistantRoutePicker.SEARCH) { search(""); return }
        // Selecting a destination never sends; the words wait for Send.
        val choice = rows().find { it.id == id } ?: return
        if (target != null) return
        // A search hit joins the known chats so Send and later views still find it.
        picker = picker?.let { p -> if (id == AssistantRoutePicker.NEW || p.chats.any { it.id == id }) p else p.copy(chats = p.chats + choice) }
        selected = id
        showPicker(pickerStatus())
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
        entry = false; text = ""; picker = null; this.selected = null; query = ""; hits = emptyList(); lookup?.cancel(); kept = null; target = null; acceptedTurn = null; screen.clear(); screenAttachment = null; submissionText = null; screenNotice = ""; state.value = null
    }
    private fun fail(message: String) {
        state.value = AssistantEntryState(message, text, choices = if (text.isBlank()) emptyList() else (if(canReplace()) listOf(AssistantChoice("__rerecord","Try again")) else emptyList()) + listOf(AssistantChoice("__retry", "Retry")))
    }
    private fun canReplace() = AssistantEntryPolicy.canReplace(target?.id,submissionText,acceptedTurn,state.value?.busy==true,state.value?.status.orEmpty())
    private fun resetUnsent(keep: Boolean = false) {
        check(canReplace())
        job?.cancel();job=null;cancelCapture()
        kept = if (keep && text.isNotBlank()) Kept(text, requestId, picker, selected, offsets) else null
        lookup?.cancel();loadingMore=false
        text="";picker=null;selected=null;query="";hits=emptyList();limit=AssistantRoutePicker.PAGE;screen.clear();screenAttachment=null;screenNotice=""
        requestId=UUID.randomUUID().toString();state.value=null
        // Kept words stay saved until a new transcript replaces them.
        if (kept == null) prefs.edit().remove("assistantEntryDraft").commit()
    }
    fun overlay(base: AssistantSnapshot): AssistantSnapshot = state.value?.let { s ->
        base.copy(title = "New request", status = s.status + if (screenNotice.isNotBlank()) " · $screenNotice" else "", text = s.text, recording = s.recording, working = s.busy,
            level = s.level, needsAttention = s.choices.isNotEmpty(), readReceipt = null, choices = s.choices, selected = s.selected)
    } ?: base

    private suspend fun request(path: String, body: JSONObject? = null, audio: ByteArray? = null, image: ByteArray? = null): JSONObject = withContext(Dispatchers.IO) {
        val prefs = DeviceLink.prefs(context)
        val url = URL(prefs.getString("endpoint", "https://ally.prxptn.com")!!.trimEnd('/') + path)
        require(url.protocol == "https" || (url.protocol == "http" && url.host in setOf("127.0.0.1", "localhost"))) { "Use an HTTPS bridge" }
        val c = url.openConnection() as HttpURLConnection
        try {
            val quick = path == "/v1/assistant/route" || path.startsWith("/v1/chats?")
            c.connectTimeout = if(quick) 4000 else 8000; c.readTimeout = if (audio != null) 120000 else if(quick) 8000 else 30000; c.instanceFollowRedirects = false
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
