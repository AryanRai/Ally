package dev.ally.device

import android.content.Context
import android.content.pm.PackageManager
import dev.ally.device.voice.VoiceRecorder
import dev.ally.device.voice.LiveSpeech
import dev.ally.device.voice.SpeechSession
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import java.net.URL
import java.util.UUID
import java.util.concurrent.TimeUnit
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

data class AssistantChoice(val id: String, val title: String, val provider: String = "codex")
data class AssistantEntryState(val status: String, val text: String = "", val recording: Boolean = false,
    val level: Float = 0f, val busy: Boolean = false, val choices: List<AssistantChoice> = emptyList(), val screenNotice: String = "", val selected: String? = null)

/** One assistant invocation. Existing chats are never sent to without a choice. */
internal class AssistantEntry(private val context: Context, private val scope: CoroutineScope, private val host: AssistantHost,
    private val openExternal: (android.content.Intent) -> Unit = { context.startActivity(it) }) {
    val state = MutableStateFlow<AssistantEntryState?>(null)
    var entry = false; private set
    private var recorder: VoiceRecorder? = null
    private var liveSpeech: SpeechSession? = null
    private var voiceToken: Any? = null
    private fun silencePolicy() = if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_WATCH)) AssistantSilence() else AssistantSilence.phone()
    private var policy = silencePolicy()
    private var automatic = false
    private var speechDetectionAvailable = false
    private var job: Job? = null
    private var text = ""
    private var picker: AssistantRoutePicker.Picker? = null
    private var selected: String? = null
    private var executionLocation: String? = null
    private var executionOffer = AssistantExecutionDestination.Offer(true, "Your agent runs through Ally on your PC")
    private var limit = AssistantRoutePicker.PAGE
    private var query = ""
    private var hits = emptyList<AssistantChoice>()
    // Next /v1/chats page per engine; null once that engine has no more.
    private var offsets = mapOf<String, Int?>()
    private var lookup: Job? = null
    private var loadingMore = false
    private var catalogJob: Job? = null
    private var catalogGeneration = 0
    private var pendingProviders = emptySet<String>()
    private var failedProviders = emptySet<String>()
    private var providerFilter: String? = null
    private class Kept(val text: String, val requestId: String, val picker: AssistantRoutePicker.Picker?, val selected: String?, val offsets: Map<String, Int?>, val executionLocation: String?, val executionOffer: AssistantExecutionDestination.Offer)
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
                // Older partially submitted drafts already used the PC route. Keep
                // their exact receipt/retry path rather than asking for a new run.
                executionLocation = draft.optString("executionLocation").takeIf { it == "pc" } ?: if (target != null || acceptedTurn != null) "pc" else null
                screenAttachment = draft.optString("screenAttachment").takeIf { it.matches(Regex("[a-f0-9]{64}")) }
                submissionText = draft.optString("submissionText").takeIf { it.isNotBlank() }
                screenNotice = if (screenAttachment != null) "Screen attached" else if (draft.optBoolean("hadScreen")) "Screen unavailable · your words are kept" else ""
                fail("Unfinished request · tap Retry to check it")
            }
        }
    }
    private fun save() {
        val draft = JSONObject().put("text", text).put("requestId", requestId).put("permission", permission)
        executionLocation?.let { draft.put("executionLocation", it) }
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
        val speechEndpoint = auto && !context.packageManager.hasSystemFeature(PackageManager.FEATURE_WATCH)
        speechDetectionAvailable = speechEndpoint
        val capture = VoiceRecorder(detectorFactory = if (speechEndpoint) ({ host.speechDetector() }) else null,
            onSpeech = { voiced, seconds ->
                if (voiceToken != null && recorder != null && automatic && policy.sampleSpeech(voiced, seconds)) {
                    if (policy.heard) finish() else quiet()
                }
            }, onDetectorUnavailable = {
                speechDetectionAvailable = false
                if (state.value?.recording == true) state.value = state.value?.copy(status = "Auto-stop unavailable · tap Send when finished")
            })
        recorder = capture
        val token = Any(); voiceToken = token
        host.prepareVoice(); AssistantVisibility.recording = true
        state.value = AssistantEntryState(if (auto) "Listening · pause or tap Send when finished" else "Listening · release to review", recording = true)
        try {
            // Use the same streaming transport as in-app voice, with local audio
            // retained for final transcription if the live connection fails.
            liveSpeech = runCatching { LiveSpeech(prefs.getString("endpoint", "https://ally.prxptn.com")!!,
                prefs.getString("token", "")!!) { words -> scope.launch {
                    if (voiceToken === token && (state.value?.recording == true || state.value?.status == "Finishing your words…")) state.value = state.value?.copy(text = words)
                } } }.getOrNull()
            val speech = liveSpeech
            capture.start(scope, { if(recorder === capture) finish() }, { if(recorder === capture) { fail(it); cancelCapture() } }, { level, seconds ->
                if(recorder !== capture) return@start
                state.value = state.value?.copy(level = level)
                if (automatic && !speechEndpoint && policy.sample(level, seconds)) { if (policy.heard) finish() else quiet() }
            }, { bytes ->
                for (offset in bytes.indices step 16000) speech?.write(bytes.copyOfRange(offset, minOf(offset + 16000, bytes.size)))
            })
        } catch (e: Exception) { cancelCapture(); fail(e.message ?: "Microphone unavailable") }
    }
    val automaticRecording get() = automatic && recorder != null
    fun release() { finish() }
    fun cancelCapture() {
        voiceToken = null; liveSpeech?.cancel(); liveSpeech = null
        recorder?.cancel(); recorder = null; AssistantVisibility.recording = false
        if (state.value?.recording == true) { state.value = null; restoreKept() }
    }
    fun pause() {
        cancelCapture()
        catalogJob?.cancel(); catalogGeneration++; pendingProviders = emptySet()
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
    private fun quiet() { cancelCapture(); catalogJob?.cancel(); catalogGeneration++; pendingProviders = emptySet(); releaseScreen(); state.value = null; restoreKept() }
    private fun restoreKept(): Boolean {
        val previous = kept?.takeIf { text.isBlank() && recorder == null } ?: return false
        kept = null; entry = true
        text = previous.text; requestId = previous.requestId; picker = previous.picker; selected = previous.selected; offsets = previous.offsets
        executionLocation = previous.executionLocation; executionOffer = previous.executionOffer
        runCatching { save() }
        if (picker != null) showPicker("Nothing new heard · earlier words kept") else fail("Nothing new heard · earlier words kept")
        return true
    }
    fun finish() {
        if (recorder != null && AssistantSend.discardSilentCapture(automatic, speechDetectionAvailable, policy.heard)) { quiet(); return }
        val capture = recorder ?: return; recorder = null
        val speech = liveSpeech; liveSpeech = null
        val token = voiceToken
        state.value = AssistantEntryState("Finishing your words…", state.value?.text.orEmpty(), busy = true)
        job = scope.launch {
            try {
                val audio = capture.stop()
                AssistantVisibility.recording = false
                val transcript = (speech?.finish() ?: request("/v1/speech/transcribe", audio = audio).optString("text")).trim()
                if (voiceToken !== token) return@launch
                if (transcript.isBlank()) { releaseScreen(); state.value = null; restoreKept(); return@launch }
                text = transcript; kept = null; save(); route()
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                if (voiceToken === token) {
                    val partial = state.value?.text.orEmpty().trim()
                    if (partial.isNotBlank()) { text = partial; kept = null; runCatching { save() }; fail("Transcription interrupted · review your captured words before Retry") }
                    else if (!restoreKept()) fail(e.message ?: "Voice unavailable")
                }
            }
            finally { speech?.cancel(); if (voiceToken === token) voiceToken = null; capture.cancel(); AssistantVisibility.recording = recorder != null }
        }
    }
    /** Switching to text cancels voice work; stale previews/results cannot replace it. */
    fun keyboard() {
        if ((recorder == null && voiceToken == null) || !canReplace()) return
        voiceToken = null
        job?.cancel(); job = null
        cancelCapture()
        state.value = AssistantEntryState("Type your request", text)
    }
    fun typed(value: String) {
        if (value.isBlank() || !canReplace()) return
        keyboard()
        job?.cancel(); lookup?.cancel(); catalogJob?.cancel(); catalogGeneration++; pendingProviders = emptySet()
        cancelCapture(); text = value.trim(); kept = null; picker = null; selected = null; hits = emptyList()
        requestId = UUID.randomUUID().toString()
        job = scope.launch { try { save(); route() } catch(e: CancellationException) { throw e } catch(e: Exception) { fail(e.message ?: "Chat matching unavailable") } }
    }
    private suspend fun route() {
        // Phone handoff must not wait for desktop matching or its availability.
        if (executionLocation == null) {
            picker = picker ?: AssistantRoutePicker.Picker("", emptyList(), AssistantRoutePicker.newChat(host.provider))
            showPicker("Choose where to send")
            return
        }
        catalogJob?.cancel()
        val generation = ++catalogGeneration
        picker = null; providerFilter = null
        pendingProviders = setOf("codex", "claude"); failedProviders = emptySet()
        val pages = mutableMapOf<String, Triple<String, List<JSONObject>, Int?>>()
        catalogJob = scope.launch {
            recentChats(onPage = { page ->
                if (generation == catalogGeneration && target == null) {
                    pendingProviders = pendingProviders - page.provider
                    if (page.failed) failedProviders = failedProviders + page.provider
                    val row = Triple(page.provider, page.chats, page.next)
                    pages[page.provider] = row
                    offsets = offsets + (page.provider to page.next)
                    picker = picker?.let { AssistantRoutePicker.more(it, page.chats) }
                    if (picker != null && state.value != null && entry && state.value?.busy != true) showPicker(pickerStatus())
                }
            })
        }
        state.value = AssistantEntryState("Finding the right conversation…", text, busy = true,choices=listOf(AssistantChoice("__rerecord","Try again")))
        val recovered = AssistantRoutingRecovery.lookup(
            route = { request("/v1/assistant/route", JSONObject().put("text", text)) },
            recent = { delay(2200); pages.values.toList() })
        val result = recovered.route
        val others = pages.values.toList()
        val options = AssistantRoutePicker.options(result, others.flatMap { it.second }, host.provider)
        executionOffer = AssistantExecutionDestination.parse(result)
        if (recovered.fallback) executionOffer = executionOffer.copy(pcReason = "Matching unavailable · your words are kept. Choose PC, then pick a chat manually.")
        picker = if (recovered.fallback) options.copy(suggested = "") else options
        selected = if (recovered.fallback) null else options.suggested
        offsets = mapOf<String, Int?>("codex" to 0, "claude" to 0) + pages.values.associate { it.first to it.third }
        limit = AssistantRoutePicker.PAGE; query = ""; hits = emptyList()
        showPicker(if (recovered.fallback) "Matching unavailable · words kept. Choose a chat, then Send."
            else if (result.optBoolean("limited")) "No clear match · pick a chat, then Send" else "Suggested chat · Send or pick another")
    }
    /** Recent chats fill the compact list; failures only shorten it. */
    private suspend fun recentChats(from: Map<String, Int?> = mapOf("codex" to 0, "claude" to 0),
                                    onPage: (AssistantRecentChats.Page) -> Unit = {}): List<Triple<String, List<JSONObject>, Int?>> =
        AssistantRecentChats.load(from, { engine, offset ->
                val page = request("/v1/chats?provider=$engine&offset=$offset")
                AssistantRecentChats.Page(engine, page.optJSONArray("chats")?.let { a -> (0 until a.length()).map { a.getJSONObject(it) } }.orEmpty(), if (page.isNull("nextOffset")) null else page.optInt("nextOffset"))
        }, onPage).map { Triple(it.provider, it.chats, it.next) }
    private fun rows() = picker?.let { AssistantRoutePicker.rows(it, limit, query, hits, providerFilter) }.orEmpty()
    private fun handoffChoices() = if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_WATCH) && screen.enabled && canReplace())
        listOf(AssistantChoice("__handoff", "Review phone context on PC")) else emptyList()
    private fun showPicker(status: String) {
        val current = picker ?: return
        if (executionLocation == null) {
            state.value = AssistantEntryState("Choose where to send · Gemini opens with your words ready to review", text,
                choices = AssistantExecutionDestination.rows(executionOffer, GeminiHandoff.available(context)) + handoffChoices() + AssistantChoice(AssistantRoutePicker.RERECORD, "Try again"))
            return
        }
        val searching = query.isNotBlank()
        val more = !searching && (current.chats.size > limit || offsets.values.any { it != null })
        val filters = listOf(AssistantChoice("__provider_all", "All chats"), AssistantChoice("__provider_codex", "Codex chats"), AssistantChoice("__provider_claude", "Claude chats"))
        val controls = filters + handoffChoices() + (if (more) listOf(AssistantChoice(AssistantRoutePicker.MORE, if (loadingMore) "Loading more chats…" else "More chats")) else emptyList()) +
            listOf(AssistantChoice(AssistantRoutePicker.SEARCH, if (searching) "Clear search" else "Search chats"), AssistantChoice(AssistantExecutionDestination.CHANGE, "Execution: PC · change"), AssistantChoice(AssistantRoutePicker.RERECORD, "Try again"))
        val shown = rows()
        val progress = pendingProviders.takeIf { it.isNotEmpty() }?.joinToString(", ", " · Loading ", " chats…")
            ?: failedProviders.takeIf { it.isNotEmpty() }?.joinToString(", ", " · Could not load ", " · More chats retries").orEmpty()
        state.value = AssistantEntryState((if (searching && shown.isEmpty()) "No chats match “${query.trim()}”" else status) + progress, text, choices = shown + controls, selected = selected)
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
        if (current.chats.count { providerFilter == null || it.provider == providerFilter } > limit) { limit += AssistantRoutePicker.PAGE; showPicker(pickerStatus()); return }
        val from = offsets.filterKeys { it !in pendingProviders && (providerFilter == null || it == providerFilter) }
        if (from.values.none { it != null }) return
        val generation = catalogGeneration
        loadingMore = true; showPicker(pickerStatus())
        lookup = scope.launch {
            try {
                val pages = recentChats(from, onPage = { page ->
                    if (generation == catalogGeneration) {
                        failedProviders = if (page.failed) failedProviders + page.provider else failedProviders - page.provider
                    }
                })
                if (generation != catalogGeneration) return@launch
                picker = picker?.let { p -> pages.fold(p) { acc, page -> AssistantRoutePicker.more(acc, page.second) } }
                offsets = offsets + pages.associate { it.first to it.third }
                limit += AssistantRoutePicker.PAGE
            } finally { if (generation == catalogGeneration) { loadingMore = false; if (picker != null && target == null && state.value != null && entry) showPicker(pickerStatus()) } }
        }
    }
    fun choose(id: String) {
        if(id == AssistantRoutePicker.RERECORD) { if(canReplace()) { resetUnsent(keep = true); entry=true;start(true) };return }
        if (state.value?.busy == true) return
        if (id.startsWith("__provider_")) {
            if (target != null) return
            providerFilter = id.removePrefix("__provider_").takeIf { it in setOf("codex", "claude") }
            limit = AssistantRoutePicker.PAGE
            showPicker(pickerStatus()); return
        }
        if (id == "__handoff") {
            if (handoffChoices().isEmpty()) return
            lookup?.cancel()
            job = scope.launch {
                state.value = AssistantEntryState("Preparing context for review…", text, busy = true)
                try {
                    screen.settle()
                    val image = screen.image()
                    try {
                        check(image != null || screen.text().isNotBlank()) { "Screen context is unavailable · your words are kept" }
                        if (ContextHandoffLauncher.open(context, AssistantSubmission.text(text, screen.text()), image)) {
                            state.value = state.value?.copy(busy = false)
                            resetUnsent(); entry = false
                        }
                    } finally { image?.fill(0) }
                } catch (e: CancellationException) { throw e }
                catch (e: Exception) {
                    val message = e.message ?: "Context handoff unavailable · your words are kept"
                    state.value = state.value?.copy(busy = false)
                    showPicker(message)
                    state.value = state.value?.copy(status = message)
                }
            }
            return
        }
        if (id == AssistantExecutionDestination.PHONE) {
            if (!canReplace() || text.isBlank()) return
            if (!GeminiHandoff.available(context)) {
                state.value = state.value?.copy(status = "Gemini is not available on this device · your words are kept")
                return
            }
            try {
                openExternal(GeminiHandoff.intent(text))
                resetUnsent(); entry = false; state.value = null
            } catch (e: Exception) {
                state.value = state.value?.copy(status = "Could not open Gemini · your words are kept")
            }
            return
        }
        if (id == AssistantExecutionDestination.PC) {
            if (target != null || picker == null) return
            val location = AssistantExecutionDestination.select(id, executionOffer) ?: run {
                state.value = state.value?.copy(status = executionOffer.pcReason); return
            }
            executionLocation = location
            try { save(); job = scope.launch { try { route() } catch (e: CancellationException) { throw e } catch(e: Exception) { fail(e.message ?: "Chat matching unavailable") } } }
            catch (e: Exception) { executionLocation = null; fail(e.message ?: "Could not keep your choice") }
            return
        }
        if (id == AssistantExecutionDestination.CHANGE) {
            if (target != null || submissionText != null || acceptedTurn != null) return
            executionLocation = null
            try { save(); showPicker("Choose where to run") } catch (e: Exception) { fail(e.message ?: "Could not keep your choice") }
            return
        }
        if (id == "__retry") {
            if (target == null && selected != null && picker != null) { showPicker("Check the chat, then Send"); return }
            job = scope.launch { try { if (target != null) deliver(target) else route() } catch(e: CancellationException) { throw e } catch(e: Exception) { fail(e.message ?: "Request unavailable") } }; return
        }
        if (id == AssistantRoutePicker.SEND) {
            if (executionLocation != "pc") { showPicker("Choose where to run"); return }
            val pick = selected ?: return
            val destination = if (pick == AssistantRoutePicker.NEW) null else (picker?.chats.orEmpty() + hits).find { it.id == pick } ?: return
            lookup?.cancel(); catalogJob?.cancel(); catalogGeneration++; pendingProviders = emptySet()
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
        AssistantExecutionDestination.requirePc(executionLocation)
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
        entry = false; text = ""; picker = null; this.selected = null; executionLocation = null; query = ""; hits = emptyList(); lookup?.cancel(); catalogJob?.cancel(); catalogGeneration++; pendingProviders = emptySet(); kept = null; target = null; acceptedTurn = null; screen.clear(); screenAttachment = null; submissionText = null; screenNotice = ""; state.value = null
    }
    private fun fail(message: String) {
        val reason = AssistantRoutingRecovery.message(Exception(message), target != null)
        state.value = AssistantEntryState(reason, text, choices = if (text.isBlank()) emptyList() else (if(canReplace()) listOf(AssistantChoice("__rerecord","Record again")) else emptyList()) + listOf(AssistantChoice("__retry", "Retry")))
    }
    private fun canReplace() = AssistantEntryPolicy.canReplace(target?.id,submissionText,acceptedTurn,state.value?.busy==true,state.value?.status.orEmpty())
    private fun resetUnsent(keep: Boolean = false) {
        check(canReplace())
        job?.cancel();job=null;cancelCapture()
        kept = if (keep && text.isNotBlank()) Kept(text, requestId, picker, selected, offsets, executionLocation, executionOffer) else null
        lookup?.cancel();catalogJob?.cancel();catalogGeneration++;pendingProviders=emptySet();failedProviders=emptySet();loadingMore=false
        text="";picker=null;selected=null;executionLocation=null;query="";hits=emptyList();limit=AssistantRoutePicker.PAGE;screen.clear();screenAttachment=null;screenNotice=""
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
        val catalog = path.startsWith("/v1/chats?")
        val quick = path == "/v1/assistant/route" || path.startsWith("/v1/chat-search?")
        val client = AssistantHttp.client.newBuilder().connectTimeout(if (quick) 4 else 8, TimeUnit.SECONDS)
            .readTimeout(if (audio != null) 120 else if (catalog) 15 else if (quick) 8 else 30, TimeUnit.SECONDS)
            .callTimeout(if (audio != null) 130 else if (catalog) 18 else if (quick) 10 else 40, TimeUnit.SECONDS).build()
        val payload = image ?: audio ?: body?.toString()?.toByteArray()
        val builder = Request.Builder().url(url).header("Authorization", "Bearer ${prefs.getString("token", "")}")
        if (image != null) builder.header("X-Ally-Filename", "Assistant-screen.png")
        if (payload != null) builder.post(payload.toRequestBody((if (image != null) "image/png" else if (audio != null) "audio/wav" else "application/json").toMediaType()))
        val (status, content) = AssistantHttp.execute(client, builder.build())
        val result = runCatching { JSONObject(content.ifBlank { "{}" }) }.getOrElse { error("Desktop connection unavailable") }
        check(status in 200..299) { result.optString("error", "Desktop connection unavailable") }
        result
    }
}
