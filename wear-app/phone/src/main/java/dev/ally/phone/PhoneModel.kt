package dev.ally.phone

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import android.net.Uri
import android.content.Intent
import java.io.File
import dev.ally.device.*
import dev.ally.device.DeviceLink
import dev.ally.device.BridgeHttpError
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

data class PhoneChat(val id: String, val title: String, val provider: String, val cwd: String, val unread: Boolean = false, val sessionKey: String = "", val createdAt: Long = 0)
data class PhoneMessage(val id: String, val role: String, val text: String, val cards: List<ReplyCard> = emptyList(), val attachments: List<DeviceAttachment> = emptyList(), val timestamp: Long = System.currentTimeMillis(), val steps: List<ChatStep> = emptyList(), val commentary: List<String> = emptyList(), val timeline: List<ChatActivityEntry> = emptyList(), val durationMs: Long = 0)
data class PhoneState(val timeline: List<ChatActivityEntry> = emptyList(), val activityStartedAt: Long = 0, val activityDurationMs: Long = 0, val progress: List<LiveProgress> = emptyList(), val progressTurnId: String = "", val speaking: Boolean = false, val speakerLevel: Float = 0f, val speechError: String = "",val resumeToken: String? = null, val canStop: Boolean = false,val readReceipt: ChatReadReceipt? = null, val chats: List<PhoneChat> = emptyList(), val messages: List<PhoneMessage> = emptyList(), val selected: PhoneChat? = null,
    val permissionChanging: Boolean = false, val permissionStatus: String = "",
    val queue: MessageQueue = MessageQueue(), val queueChanging: Boolean = false, val queueError: String = "",
    val running: List<PhoneChat> = emptyList(), val runningStatus: String = "Checking live status…", val liveText: String = "", val steps: List<ChatStep> = emptyList(),
    val attentionChats: List<PhoneChat> = emptyList(),
    val share: ShareDraft = ShareDraft(), val importingShare: Boolean = false, val pendingSend: Boolean = false, val sentSequence: Int = 0, val sentText: String = "", val liveAttachments: List<DeviceAttachment> = emptyList(),
    val externalRunning: Boolean = false, val syncStatus: String = "", val provider: String = "codex", val permission: String = "readonly", val busy: Boolean = false, val loading: Boolean = false, val error: String = "", val activity: String = "", val approval: JSONObject? = null,
    val inputMode: String = "queue", val inputStatus: String = "", val more: Int? = null, val before: Int? = null, val recording: Boolean = false, val transcribing: Boolean = false,
    val microphoneLevel: Float = 0f, val recordingSeconds: Float = 0f, val liveTranscript: String = "", val voiceDraft: String = "")
private typealias BridgeError = BridgeHttpError

internal class PhoneConversation(private val app: Application, private val chatKey: String, private val viewModelScope: CoroutineScope, migrate: Boolean, storageKey: String = chatKey) {
    private fun getApplication(): Application = app
    private val shares = ShareDraftStore(File(app.filesDir, DeviceLink.prefs(app).getString("phoneShareFolder:$storageKey", null) ?: (if (migrate) "share-draft" else "share-draft-${UUID.nameUUIDFromBytes(storageKey.toByteArray())}").also { DeviceLink.prefs(app).edit().putString("phoneShareFolder:$storageKey", it).commit() }))
    private var shared = shares.read()
    val state = MutableStateFlow(PhoneState(share = shared, selected = chatKey.takeIf { it.isNotBlank() }?.let { PhoneChat(it, "Opening chat…", it.substringBefore(':'), "") }))
    private val prefs = ChatPreferences(DeviceLink.prefs(app), storageKey, setOf("phoneTurn", "phonePendingText", "phonePendingChat", "phoneRequestId", "phoneInputText", "phoneInputId", "phoneInputTurn", "phoneInputMode", "phoneInputShare", "phoneNewRequest", "phonePendingQueue"), migrate)
    private var turn: String? = prefs.getString("phoneTurn", null)
    private var pendingText: String? = prefs.getString("phonePendingText", null)
    private var pendingQueue: Boolean? = prefs.getString("phonePendingQueue", null)?.toBooleanStrictOrNull()
    private var pendingChat: String? = prefs.getString("phonePendingChat", null)
    private var requestId: String? = prefs.getString("phoneRequestId", null)
    private var inputText: String? = prefs.getString("phoneInputText", null)
    private var inputId: String? = prefs.getString("phoneInputId", null)
    private var inputTurn: String? = prefs.getString("phoneInputTurn", null)
    private var inputShare = prefs.getString("phoneInputShare", null) == "true"
    private var inputMode: String? = prefs.getString("phoneInputMode", null)
    private fun pulse(strong: Boolean = false) = PhoneHaptics.pulse(getApplication(), strong)
    private var pollJob: Job? = null
    private var voice: PhoneVoice? = null
    private var voiceJob: Job? = null
    private var voiceTurn: String? = null
    var foreground = false
    private val progressRead = ProgressReadCursor()
    private val speaker = dev.ally.device.voice.ReplySpeech(app, viewModelScope, { playing, error -> state.update { it.copy(speaking = playing, speechError = error) } }, level = { volume -> state.update { it.copy(speakerLevel = volume) } })
    fun stopSpeaking() { progressRead.stop(state.value.progressTurnId); speaker.stop() }
    /** Leaving Ally silences it, except a reply that is driving (or drove) the phone: it keeps talking to the end. */
    fun backgrounded() { if (!drivingPhone(state.value.progressTurnId.takeIf { it.isNotBlank() } ?: turn)) stopSpeaking() }
    private fun progress(result: JSONObject, id: String) {
        val rows = LiveProgressParser.read(result)
        state.update { it.copy(progress = rows, progressTurnId = id) }
        if (ControlBridge.visual.value.grantId.isNotBlank()) droveTurn = id
        val enabled = (foreground || drivingPhone(id)) && !DeviceLink.prefs(app).getBoolean("muted", false) && !state.value.recording && !state.value.transcribing && !AssistantVisibility.recording
        progressRead.updates(id, rows, enabled).forEach { speakQueued(it) }
    }
    /** While Ally is driving the phone the user is usually in another app, so its status is spoken there too. */
    private var droveTurn: String? = null
    /** Control usually ends just before the final reply, so a turn that drove the phone keeps its voice to the end. */
    private fun drivingPhone(turn: String? = null) = ControlBridge.visual.value.grantId.isNotBlank() || (turn != null && turn == droveTurn)
    private fun speakQueued(text: String) = speaker.enqueue(text, prefs.getString("endpoint", "https://ally.prxptn.com")!!, prefs.getString("token", "")!!, true)
    fun acceptAssistantTurn(id: String) {
        turn = id; prefs.edit().putString("phoneTurn", id).commit()
        state.update { it.copy(busy = true, error = "", activity = "Thinking…") }
        poll()
    }
    private val voiceActive get() = state.value.recording || state.value.transcribing
    init {
        state.update { it.copy(pendingSend = pendingText != null, inputMode = inputMode ?: "queue") }
        (pendingChat ?: chatKey.takeIf { it.isNotBlank() })?.let { id -> task {
            try { history(id) } finally { if (turn != null) poll() }
        } }
        inputText?.let { text -> state.update { it.copy(voiceDraft = text, inputStatus = "Previous input delivery unconfirmed. Use Retry before sending again.") } }
    }
    private fun enc(value: String) = URLEncoder.encode(value, "UTF-8")
    suspend fun request(path: String, body: JSONObject? = null, audio: ByteArray? = null): JSONObject = withContext(Dispatchers.IO) {
        if(audio==null) {
            if(state.value.selected?.id?.let(dev.ally.phone.codex.PhoneCodex::owns)==true && path=="/v1/status")return@withContext JSONObject().put("messageQueue",true).put("inputAttachments",false)
            dev.ally.phone.codex.PhoneCodex.request(path,body)?.let { return@withContext it }
        }
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
    private fun chat(j: JSONObject) = PhoneChat(j.getString("id"), j.optString("title", "Chat"), j.optString("provider", "codex"), j.optString("cwd"), j.optBoolean("unread"), j.optString("provider", "codex") + ":" + j.optString("sessionId").takeIf { it.isNotBlank() && it != "null" }.orEmpty().ifBlank { j.getString("id").substringAfter(':') }, j.optLong("createdAt"))
    suspend fun refreshRunning() {
        try {
            val a = request("/v1/running").optJSONArray("chats") ?: JSONArray()
            val rows = (0 until a.length()).map { chat(a.getJSONObject(it)) }.distinctBy { it.id }
            state.update { it.copy(running = rows, runningStatus = if (rows.isEmpty()) "No active chats" else "") }
            try {
                val feed=request("/v1/assistant/activity").optJSONArray("chats") ?: JSONArray()
                val attention=(0 until feed.length()).map { chat(feed.getJSONObject(it)) }.filter { it.unread }
                state.update { it.copy(attentionChats=attention) }
            } catch(e: CancellationException) { throw e } catch(_: Exception) { /* Retain last known unread rows until the coordinated bridge update is live. */ }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            state.update { it.copy(runningStatus = "Reconnecting · showing last known active chats") }
        }
    }
    fun runningSnapshot(rows: List<PhoneChat>, status: String, attention: List<PhoneChat> = state.value.attentionChats) {
        state.update { it.copy(running = rows, runningStatus = status,attentionChats=attention) }
    }
    private var refreshingSelected = false
    suspend fun refreshSelected() {
        val id = state.value.selected?.id ?: return
        // A saved receipt can outlive the desktop process, including when the
        // initial history request failed. Always restart its read-only recovery.
        if (turn != null) { poll(); return }
        refreshQueue()
        if (refreshingSelected || voiceActive || state.value.loading || state.value.busy || turn != null || pendingText != null) return
        refreshingSelected = true
        try {
            history(id, expectedSelection = id)
            if (turn != null) poll()
        } catch (e: CancellationException) { throw e } catch (_: Exception) {
            if (state.value.selected?.id == id) state.update { it.copy(externalRunning = false, syncStatus = "Live status unavailable · reconnecting…") }
        } finally { refreshingSelected = false }
    }
    suspend fun refreshQueue() {
        val id = state.value.selected?.id ?: return
        try {
            val q = MessageQueue.parse(request("/v1/queue/${enc(id)}")) ?: return
            if (state.value.selected?.id == id && !state.value.queueChanging && (state.value.queue.chatId!=q.chatId || q.revision>=state.value.queue.revision)) state.update { it.copy(queue=q,queueError="") }
        } catch (e: CancellationException) { throw e } catch (_: Exception) {
            if(state.value.queue.items.isNotEmpty()) state.update { it.copy(queueError="Queue unavailable · reconnect to manage messages") }
        }
    }
    fun queueChange(change: JSONObject) {
        val id=state.value.selected?.id ?: return
        if(state.value.queueChanging) return
        state.update { it.copy(queueChanging=true,queueError="") }
        viewModelScope.launch {
            try {
                val q=MessageQueue.parse(request("/v1/queue/${enc(id)}",change)) ?: return@launch
                state.update { it.copy(queue=q) }
            } catch(e: CancellationException) { throw e } catch(e: Exception) { state.update { it.copy(queueError=e.message ?: "Queue change failed") } }
            finally { state.update { it.copy(queueChanging=false) } }
        }
    }
    fun voiceError(message: String) { state.update { it.copy(error = message) } }
    fun startRecording() {
        AcousticProbeService.instance?.cancelForVoice()
        stopSpeaking()
        if (state.value.importingShare || voiceActive || state.value.loading || pendingText != null || inputText != null) return
        if (state.value.selected == null) { voiceError("Choose a conversation before talking."); return }
        try {
            voiceTurn = turn
            voice = PhoneVoice(viewModelScope, prefs.getString("endpoint", "https://ally.prxptn.com")!!, prefs.getString("token", "")!!,
                { audio -> request("/v1/speech/transcribe", audio = audio).optString("text") },
                { text -> state.update { it.copy(liveTranscript = text) } })
            state.update { it.copy(recording = true, liveTranscript = "", voiceDraft = "", error = "", recordingSeconds = 0f) }
            pulse()
            voice!!.start({ finishRecording() }, { error -> cancelRecording(); voiceError(error) },
                { level, seconds -> state.update { it.copy(microphoneLevel = level, recordingSeconds = seconds) } })
        } catch (e: Exception) { cancelRecording(); voiceError(e.message ?: "Microphone unavailable") }
    }
    fun finishRecording(review: Boolean = prefs.getBoolean("phone.voice.review",false)) {
        if (!state.value.recording) return
        val capture = voice ?: return
        pulse()
        state.update { it.copy(recording = false, transcribing = true, microphoneLevel = 0f) }
        voiceJob = viewModelScope.launch {
            try {
                val text = capture.finish()
                state.update { it.copy(transcribing = false, liveTranscript = "") }
                voice = null
                when (voiceDelivery(voiceTurn, turn, review)) {
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
        task { val r = try { request("/v1/chats?provider=$provider&offset=$offset") } catch(e: Exception) { if(e is CancellationException)throw e; if(provider!="codex" || dev.ally.phone.codex.PhoneCodex.chats().length()==0)throw e;JSONObject().put("chats",JSONArray()) }; val a = r.optJSONArray("chats") ?: JSONArray()
            if(provider=="codex" && !more) {val local=dev.ally.phone.codex.PhoneCodex.chats();for(i in 0 until local.length())a.put(local.getJSONObject(i))}
            state.update { it.copy(provider = provider, chats = ((if (more) it.chats else emptyList()) + (0 until a.length()).map { i -> chat(a.getJSONObject(i)) }).distinctBy { c -> c.id }, more = if (r.isNull("nextOffset")) null else r.optInt("nextOffset")) }
        }
    }
    fun select(id: String) {
        if (state.value.importingShare || voiceActive || state.value.busy || state.value.loading || (state.value.selected != null && (turn != null || pendingText != null || inputText != null))) return
        task { history(id); if (turn != null) poll() }
    }
    private suspend fun history(id: String, older: Boolean = false, expectedSelection: String? = null) {
        val before = if (older) "?before=${state.value.before ?: return}" else ""
        val r = request("/v1/chats/${enc(id)}$before")
        if (expectedSelection != null && (state.value.selected?.id != expectedSelection || state.value.loading || state.value.busy || voiceActive || turn != null)) return
        val selected = chat(r.getJSONObject("chat")); val a = r.optJSONArray("messages") ?: JSONArray()
        val messages = (0 until a.length()).map { val m = a.getJSONObject(it); val reply = ReplyContentParser.parse(m); PhoneMessage(m.optString("id"), m.optString("role"), reply.text, reply.cards, AttachmentParser.list(m), m.optLong("timestamp"), ChatActivityParser.steps(m), reply.commentary, ChatTimelineParser.read(m), ChatTimelineParser.duration(m)) }

        state.update { it.copy(resumeToken = if (older) it.resumeToken else r.optJSONObject("interrupted")?.optString("token")?.takeIf { t -> t.isNotBlank() }, canStop = r.optBoolean("canStop"), readReceipt = if (older) it.readReceipt else ChatReadReceipt.parse(r.optJSONObject("readState")), selected = selected, provider = selected.provider, externalRunning = r.optBoolean("running") && r.optString("activeTurnId").let { t -> t.isBlank() || t == "null" }, syncStatus = "", liveText = if (it.selected?.id == selected.id) it.liveText else "", messages = if (older) (messages + it.messages).distinctBy { m -> m.id } else if (expectedSelection != null) mergePhoneHistory(it.messages, messages) else messages, before = if (expectedSelection != null && it.messages.isNotEmpty()) it.before else if (r.isNull("before")) null else r.optInt("before"), permission = prefs.getString("phonePermission:${selected.id}", "readonly")!!) }
        r.optString("activeTurnId").takeIf { it.isNotBlank() && it != "null" }?.let { turn = it; prefs.edit().putString("phoneTurn", it).apply() }
        val progressTurn = r.optString("progressTurnId")
        if (!older && r.optString("activeTurnId").let { it.isBlank() || it == "null" } && (r.optBoolean("running") || progressRead.observed(progressTurn))) {
            progress(r, progressTurn)
            if (!r.optBoolean("running") && progressRead.claimFinal(progressTurn) && (foreground || drivingPhone(progressTurn)) && !DeviceLink.prefs(app).getBoolean("muted",false) && !state.value.recording && !state.value.transcribing && progressRead.canRead(progressTurn)) {
                messages.lastOrNull { it.role == "assistant" }?.let { speakQueued(progressRead.finalText(progressTurn,it.text)) }
            }
        }
    }
    suspend fun refreshUnread() {
        try {
            val response = request("/v1/read-states")
            val hidden = ChatReadReceipt.hidden(response)
            val flags = ChatReadReceipt.states(response)
            fun update(row: PhoneChat) = row.copy(unread = flags[row.sessionKey] ?: row.unread)
            state.update { it.copy(chats = it.chats.filter { row -> row.sessionKey !in hidden }.map(::update), running = it.running.filter { row -> row.sessionKey !in hidden }.map(::update),attentionChats=it.attentionChats.filter { row -> row.sessionKey !in hidden }.map(::update).filter { row->row.unread }) }
        } catch (e: CancellationException) { throw e } catch (_: Exception) { /* Keep badges through reconnect. */ }
    }
    suspend fun viewed(receipt: ChatReadReceipt) {
        if (!receipt.unread || state.value.readReceipt != receipt || state.value.busy || state.value.externalRunning) return
        try {
            if (request("/v1/read-state", receipt.json()).optBoolean("accepted")) {
                state.update { if (it.readReceipt == receipt) it.copy(readReceipt = receipt.copy(unread = false)) else it }
                refreshUnread()
            }
        } catch (e: CancellationException) { throw e } catch (_: Exception) { /* Retry only while still viewing this reply. */ }
    }
    fun older() { if(voiceActive) return; val id = state.value.selected?.id ?: return; task { history(id, true) } }
    fun newChat() { if (voiceActive || state.value.busy || state.value.loading || turn != null || pendingText != null || inputText != null) return; task {
        val id = prefs.getString("phoneNewRequest", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("phoneNewRequest", it).commit() }
        val r = request("/v1/chats", JSONObject().put("provider", state.value.provider).put("requestId", id)); history(r.getJSONObject("chat").getString("id")); prefs.edit().remove("phoneNewRequest").apply()
    } }
    fun permission(value: String) {
        if (voiceActive || state.value.permissionChanging || value !in setOf("readonly", "edit", "full")) return
        val chat = state.value.selected?.id ?: return
        state.update { it.copy(permissionChanging = true, permissionStatus = "Updating access…") }
        viewModelScope.launch {
            try {
                val result = request("/v1/chats/${enc(chat)}/access", JSONObject().put("permission", value))
                check(result.getString("permission") == value) { "Access change was not confirmed" }
                prefs.edit().putString("phonePermission:$chat", value).apply()
                state.update { if (it.selected?.id == chat) it.copy(permission = value, permissionStatus = result.getString("message")) else it }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { state.update { if (it.selected?.id == chat) it.copy(permissionStatus = e.message ?: "Access change could not be confirmed") else it } }
            finally { state.update { it.copy(permissionChanging = false) } }
        }
    }
    private val shareLocked get() = (state.value.loading && state.value.selected != null) || state.value.importingShare || pendingText != null || inputText != null || voiceActive
    fun receiveShare(intent: Intent) { importUris(intent.sharedUris(), intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty()) }
    fun importUris(uris: List<Uri>, text: String = "") {
        if (shareLocked) { voiceError("Finish or retry the current send before sharing more."); return }
        state.update { it.copy(importingShare = true, error = "") }
        viewModelScope.launch {
            try {
                shared = withContext(Dispatchers.IO) { shares.append(shared, text, shareSources(getApplication(), uris)) }
                state.update { it.copy(share = shared) }
            } catch (e: Exception) { if (e is CancellationException) throw e; voiceError(e.message ?: "Could not import shared content") }
            finally { state.update { it.copy(importingShare = false) } }
        }
    }
    fun shareText(text: String) { if (shareLocked) return; if (text.length > 12000) return
        shared = shared.copy(text = text); shares.save(shared); state.update { it.copy(share = shared) }
    }
    fun removeShared(key: String) { if (shareLocked) return; shared = shares.remove(shared, key); state.update { it.copy(share = shared) } }
    fun discardShare() { if (shareLocked) return; shares.clear(shared); shared = ShareDraft(); state.update { it.copy(share = shared) } }
    private suspend fun upload(item: SharedFile): DeviceAttachment = withContext(Dispatchers.IO) {
        check(state.value.selected?.id?.let(dev.ally.phone.codex.PhoneCodex::owns)!=true) { "Phone Codex file inputs are not enabled yet. Your attachment is kept on this phone; choose a PC chat to send it." }
        val url = URL(prefs.getString("endpoint", "https://ally.prxptn.com")!!.trimEnd('/') + "/v1/attachments")
        require(url.protocol == "https")
        val c = url.openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 8000; c.readTimeout = 120000; c.instanceFollowRedirects = false
            c.requestMethod = "POST"; c.doOutput = true; c.setFixedLengthStreamingMode(item.size)
            c.setRequestProperty("Authorization", "Bearer ${prefs.getString("token", "")}")
            c.setRequestProperty("Content-Type", item.mimeType); c.setRequestProperty("X-Ally-Filename", enc(item.name))
            shares.file(item).inputStream().use { input -> c.outputStream.use { input.copyTo(it) } }
            val status = c.responseCode
            val json = JSONObject((if (status in 200..299) c.inputStream else c.errorStream).bufferedReader().use { it.readText() })
            check(status in 200..299) { json.optString("error", "Attachment upload failed") }
            AttachmentParser.one(json.getJSONObject("attachment")) ?: error("Invalid attachment response")
        } finally { c.disconnect() }
    }
    fun inputMode(value: String) { if (inputText == null && value in setOf("queue", "steer")) state.update { it.copy(inputMode = value) } }
    fun send(text: String) {
        val chat = state.value.selected ?: return
        if (voiceActive || state.value.loading || state.value.importingShare) return
        val hasShare = shared.text.isNotBlank() || shared.files.isNotEmpty()
        val message = pendingText ?: listOf(shared.text, text).filter { it.isNotBlank() }.joinToString("\n\n")
        if (message.isBlank() && shared.files.isEmpty()) return
        if (message.length > 12000) { voiceError("Message exceeds 12,000 characters"); return }
        if (state.value.busy || turn != null || state.value.externalRunning) {
            addInput(message, hasShare); return
        }
        if (inputText != null) { voiceError("Retry the unconfirmed input first."); return }
        if (pendingText != null && text != pendingText) { voiceError("Retry the previous message first; its delivery is uncertain."); return }
        pendingChat = pendingChat ?: chat.id
        if (pendingChat != chat.id) { voiceError("Retry the message in its original chat."); return }
        pendingQueue = pendingQueue ?: state.value.externalRunning
        pendingText = message; requestId = requestId ?: UUID.randomUUID().toString()
        prefs.edit().putString("phonePendingText", message).putString("phonePendingChat", pendingChat).putString("phoneRequestId", requestId).putString("phonePendingQueue", pendingQueue.toString()).commit()
        state.update { it.copy(pendingSend = true) }
        task {
            val uploaded = try { shared.files.map { item ->
                item.uploaded ?: upload(item).also { asset ->
                    shared = shared.copy(files = shared.files.map { if (it.key == item.key) it.copy(uploaded = asset) else it })
                    shares.save(shared); state.update { it.copy(share = shared) }
                }
            } } catch (e: Exception) {
                // No message request has started: the draft is safe to edit after an upload failure.
                if (e is CancellationException) throw e
                pendingText = null; pendingChat = null; requestId = null; pendingQueue = null
                prefs.edit().remove("phonePendingText").remove("phonePendingChat").remove("phoneRequestId").remove("phonePendingQueue").commit()
                state.update { it.copy(pendingSend = false) }; throw e
            }
            val r = request("/v1/messages", JSONObject().put("provider", chat.provider).put("chatId", chat.id).put("permission", state.value.permission).put("requestId", requestId).put("text", message).put("attachments", JSONArray(uploaded.map { it.id })).put("queueAfterCurrent", pendingQueue == true))
            if(r.optBoolean("queued")) {
                prefs.edit().remove("phonePendingText").remove("phonePendingChat").remove("phoneRequestId").remove("phonePendingQueue").commit()
                pendingText=null; pendingChat=null; requestId=null; pendingQueue=null
                shares.clear(shared); shared=ShareDraft()
                state.update { it.copy(queue=MessageQueue.parse(r) ?: it.queue,share=shared,pendingSend=false,sentSequence=it.sentSequence+1,sentText=message,inputStatus="Queued after this response") }
                return@task
            }
            turn = r.getString("id"); prefs.edit().putString("phoneTurn", turn).remove("phonePendingText").remove("phonePendingChat").remove("phoneRequestId").remove("phonePendingQueue").commit(); pendingText = null; pendingChat = null; requestId = null; pendingQueue = null
            shares.hold(message); shared = ShareDraft()
            pulse()
            state.update { it.copy(share = shared, pendingSend = false, sentSequence = it.sentSequence + 1, sentText = message, liveText = "", liveAttachments = emptyList(), messages = it.messages + PhoneMessage("local-${turn}", "user", message.ifBlank { "Shared attachments" }, attachments = uploaded)) }; poll()
        }
    }
    private fun addInput(text: String, withShare: Boolean = inputShare) {
        if (state.value.loading) return
        if (inputText != null && inputText != text) { state.update { it.copy(error = "Retry the previous input first; its delivery is uncertain.", voiceDraft = text) }; return }
        var target = inputTurn ?: turn ?: state.value.selected?.id?.takeIf { state.value.externalRunning }?.let { "chat:$it" } ?: return
        inputMode = inputMode ?: state.value.inputMode
        // Queue belongs to the conversation, not an expiring desktop turn receipt.
        if(inputMode=="queue") target="chat:${state.value.selected?.id ?: return}"
        inputShare = withShare
        inputText = text; inputTurn = target; inputId = inputId ?: UUID.randomUUID().toString()
        prefs.edit().putString("phoneInputText", text).putString("phoneInputTurn", target).putString("phoneInputId", inputId).putString("phoneInputMode", inputMode).putString("phoneInputShare", inputShare.toString()).commit()
        task {
            try {
                if (inputShare && shared.files.isNotEmpty() && !request("/v1/status").optBoolean("inputAttachments")) {
                    error("The desktop attachment update is still activating. Your draft is saved; retry shortly.")
                }
                val uploaded = if (inputShare) shared.files.map { item ->
                    item.uploaded ?: upload(item).also { asset ->
                        shared = shared.copy(files = shared.files.map { if (it.key == item.key) it.copy(uploaded = asset) else it })
                        shares.save(shared); state.update { it.copy(share = shared) }
                    }
                } else emptyList()
                if(inputMode=="queue" && !request("/v1/status").optBoolean("messageQueue")) error("The shared queue update is still activating. Your draft is saved; retry shortly.")
                val result = request(if (target.startsWith("chat:")) "/v1/chats/${enc(target.removePrefix("chat:"))}/input" else "/v1/turns/${enc(target)}/input", JSONObject().put("text", text).put("requestId", inputId).put("mode", inputMode).put("permission",state.value.permission).put("attachments", JSONArray(uploaded.map { it.id })))
                if (inputShare) { shares.clear(shared); shared = ShareDraft() }
                state.update { it.copy(share = shared, sentSequence = it.sentSequence + 1, sentText = text, inputStatus = if (result.optString("mode") == "steered") "Added to current work" else "Queued after this response",
                    queue = MessageQueue.parse(result) ?: it.queue,
                    messages = if(result.optString("mode")=="queued") it.messages else it.messages + PhoneMessage("input-$inputId", "user", text.ifBlank { "Shared attachments" }, attachments = uploaded)) }
                inputText = null; inputId = null; inputTurn = null; inputMode = null; inputShare = false
                prefs.edit().remove("phoneInputText").remove("phoneInputId").remove("phoneInputTurn").remove("phoneInputMode").remove("phoneInputShare").apply()
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
        inputText = null; inputId = null; inputTurn = null; inputMode = null; inputShare = false
        prefs.edit().remove("phoneInputText").remove("phoneInputId").remove("phoneInputTurn").remove("phoneInputMode").remove("phoneInputShare").apply()
        state.update { it.copy(error = "", inputStatus = "Check chat history before resending unconfirmed input") }
    }
    fun retry() { if (inputText != null) addInput(inputText!!) else if (turn != null) poll() else pendingText?.let(::send) ?: state.value.selected?.let { select(it.id) } ?: catalog() }
    private fun poll() {
        if (pollJob?.isActive == true) return
        val current = turn ?: return
        state.update { it.copy(busy = true, timeline = emptyList(), steps = emptyList(), progress = emptyList(), activityStartedAt = 0, activityDurationMs = 0, error = "", activity = "Working…") }
        pollJob = viewModelScope.launch {
            try {
                while (isActive) {
                    val r = phoneTurnRead({ state.update { it.copy(activity = "Reconnecting… Checking the same chat", approval = null) } }, {
                        if (turn == current) {
                            turn = null; prefs.edit().remove("phoneTurn").apply()
                            state.update { it.copy(busy = false, approval = null, syncStatus = "Desktop restarted · refreshing this chat…") }
                            val id = state.value.selected?.id ?: chatKey
                            if (id.isNotBlank()) history(id)
                            state.update { it.copy(liveText = "", liveAttachments = emptyList(), activity = "", error = "") }
                        }
                    }) {
                        request("/v1/turns/${enc(current)}")
                    } ?: break
                    if (r.optString("delivery")=="accepted" || r.optString("status")=="done") shares.settle(false)
                    if (r.optString("status")=="error" && r.optString("delivery")=="not_sent") {
                        shares.settle(true)?.let { (text, draft) ->
                            shared=draft
                            val key="composer:${state.value.selected?.id}"
                            val old=DeviceLink.prefs(app).getString(key, "").orEmpty()
                            DeviceLink.prefs(app).edit().putString(key,listOf(old,text).filter { it.isNotBlank() }.distinct().joinToString("\n\n")).commit()
                            state.update { it.copy(share=shared,voiceDraft=text,inputStatus="Not sent · draft and attachments restored") }
                        }
                    }
                    val nextApproval = r.optJSONArray("approvals")?.optJSONObject(0)
                    progress(r, current)
                    MessageQueue.parse(r)?.let { q -> if(!state.value.queueChanging && (state.value.queue.chatId!=q.chatId || q.revision>=state.value.queue.revision)) state.update { it.copy(queue=q) } }
                    if (nextApproval != null && nextApproval.optString("id") != state.value.approval?.optString("id")) pulse(true)
                    state.update { it.copy(timeline = ChatTimelineParser.read(r), activityStartedAt = r.optLong("startedAt"), activityDurationMs = ChatTimelineParser.duration(r), steps = ChatActivityParser.steps(r), liveAttachments = AttachmentParser.list(r), liveText = r.optString("liveText").take(12000), activity = r.optString("activity", "Working…"), approval = nextApproval) }
                    if (r.optString("status") in setOf("done", "error")) {
                        pulse(true)
                        turn = null
                        prefs.edit().remove("phoneTurn").apply()
                        // Keep the answer visible even if the separate history read loses the network.
                        val finalReply = r.optJSONObject("reply")?.let(ReplyContentParser::parse)
                        val finalText = finalReply?.text
                        if (r.optString("status") == "done" && (foreground || drivingPhone(current)) && !DeviceLink.prefs(app).getBoolean("muted", false) && !state.value.recording && !state.value.transcribing && progressRead.canRead(current)) finalReply?.let { speakQueued(progressRead.finalText(current, it.text)) }
                        state.update { it.copy(liveText = finalText ?: it.liveText) }
                        try {
                            state.value.selected?.let { history(it.id) }
                        } catch (e: CancellationException) { throw e } catch (_: Exception) { /* Final text remains readable. */ }
                        if (finalReply != null) state.update { it.copy(liveText = "", liveAttachments = emptyList(), messages = if (it.messages.lastOrNull()?.let { m -> m.role == "assistant" && m.text == finalReply.text && m.cards == finalReply.cards } == true) it.messages.dropLast(1) + it.messages.last().copy(attachments = (it.messages.last().attachments + it.liveAttachments).distinctBy { a -> a.id }) else it.messages + PhoneMessage("$current-assistant", "assistant", finalReply.text, finalReply.cards, it.liveAttachments, steps = it.steps, commentary = finalReply.commentary, timeline = it.timeline, durationMs = it.activityDurationMs)) }
                        state.update { it.copy(error = r.optString("error").takeIf { e -> e != "null" } ?: "") }; break
                    }
                    delay(2000)
                }
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                if (e is BridgeError && e.status == 404) {
                    turn = null
                    prefs.edit().remove("phoneTurn").apply()
                }
                state.update { it.copy(error = e.message ?: "Reconnect to continue") }
            } finally { state.update { it.copy(busy = turn != null, approval = null) } }
        }
    }
    fun close() { cancelRecording(); speaker.close() }
    fun stop() {
        if (state.value.loading) return
        val id = state.value.selected?.id ?: return
        task { request("/v1/chats/${enc(id)}/stop", JSONObject()) }
    }
    fun resume() {
        val receipt = state.value.resumeToken ?: return
        val chat = state.value.selected ?: return
        if (state.value.busy || state.value.externalRunning || state.value.loading || voiceActive) return
        if (pendingText != null || inputText != null) { state.update { it.copy(error = "Resolve your unsent input before resuming.") }; return }
        task {
            val result = request("/v1/messages", ResumeChatRequest.build(chat.provider, chat.id, state.value.permission, receipt))
            turn = result.getString("id"); prefs.edit().putString("phoneTurn", turn).commit()
            state.update { it.copy(resumeToken = null, liveText = "", activity = "Resuming…") }; poll()
        }
    }
    fun answer(action: String, values: Map<String, String>) { val id = turn ?: return; val approval = state.value.approval ?: return
        task { request("/v1/turns/${enc(id)}/approvals/${enc(approval.getString("id"))}", JSONObject().put("action", action).put("values", JSONObject(values))); pulse() }
    }
}



