package dev.ally.watch

import dev.ally.device.ChatReadReceipt

import dev.ally.device.AttachmentParser

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject
import java.util.UUID
import java.net.URLEncoder
import dev.ally.device.reconnectingTurnRead

internal class WatchConversation(private val application: Application, initial: String, private val viewModelScope: CoroutineScope, migrate: Boolean, storageKey: String = initial) {
    private fun getApplication(): Application = application
    private val prefs = dev.ally.device.ChatPreferences(application.getSharedPreferences("ally-watch", 0), storageKey,
        setOf("turn", "inputTarget", "inputRequest", "inputText", "inputMode", "history", "reply", "activity", "chatId", "provider", "newChatRequest", "pendingText", "pendingRequest", "pendingQueue"), migrate)
    init { if (initial.isNotBlank() && !initial.startsWith("draft:")) prefs.edit().putString("chatId", initial).apply() }
    private val mutable = MutableStateFlow(WatchState(look = WatchLook.load(prefs), chatId = prefs.getString("chatId", null), permission = prefs.getString("permission:${prefs.getString("chatId", "")}", "readonly")!!, provider = prefs.getString("provider", "codex")!!, muted = prefs.getBoolean("muted", false)))
    val state = mutable.asStateFlow()
    var endpoint: String
        get() = prefs.getString("endpoint", "http://127.0.0.1:18765")!!
        set(value) { prefs.edit().putString("endpoint", value.trim()).apply() }
    var token: String
        get() = prefs.getString("token", "")!!
        set(value) { prefs.edit().putString("token", value.trim()).apply() }
    private val api = WatchApi({ endpoint }, { token })
    private val voice = VoiceRecorder()
    private var liveSpeech: LiveSpeech? = null
    private val speaker = ReplySpeaker(application, viewModelScope) { playing, error -> mutable.update { it.copy(speaking = playing, speechError = error) } }
    private var work: Job? = null
    private var inputWork: Job? = null
    private var inputTarget: String? = prefs.getString("inputTarget", null)
    private var inputRequest: String? = prefs.getString("inputRequest", null)
    private var inputText: String? = prefs.getString("inputText", null)
    private var catalogWork: Job? = null
    private var approvalWork: Job? = null
    private var pendingQueue: Boolean? = prefs.getString("pendingQueue", null)?.toBooleanStrictOrNull()
    private var lastText: String? = prefs.getString("pendingText", null)
    private val pendingAudio = java.io.File(application.filesDir, "pending-${UUID.nameUUIDFromBytes(storageKey.toByteArray())}.wav")
    private var lastAudio: ByteArray? = pendingAudio.takeIf { it.isFile }?.readBytes()
    private var requestId: String? = prefs.getString("pendingRequest", null)
    private var deliveryMode: String? = prefs.getString("inputMode", null)
    var foreground = false
    val busy get() = mutable.value.inputRecording || mutable.value.inputSending || mutable.value.loadingHistory || mutable.value.phase in setOf(Phase.RECORDING, Phase.UPLOADING, Phase.THINKING)
    val canSwitchChat get() = mutable.value.phase != Phase.RECORDING && !mutable.value.inputRecording

    init {
        inputText?.let { text -> mutable.update { it.copy(inputDraft = text, inputMode = deliveryMode ?: "queue", inputStatus = "Input delivery unconfirmed · retry") } }
        mutable.update { it.copy(autoRead = prefs.getBoolean("autoRead", false), replyAlerts = prefs.getBoolean("replyAlerts", true)) }
        runCatching {
            val cached = JSONObject(prefs.getString("history", "{}")!!)
            if (ChatParser.matchesSelection(cached, mutable.value.chatId)) applyHistory(cached)
        }
        val savedTurn = prefs.getString("turn", null)
        if (savedTurn != null) work = viewModelScope.launch { poll(savedTurn) } else if (!initial.startsWith("draft:")) refresh()
    }
    fun appearance(look: WatchLook) {
        look.save(prefs)
        mutable.update { it.copy(look = look) }
    }
    fun autoRead(enabled: Boolean) { prefs.edit().putBoolean("autoRead", enabled).apply(); mutable.update { it.copy(autoRead = enabled) }; if (!enabled) stopSpeaking() }
    fun replyAlerts(enabled: Boolean) { prefs.edit().putBoolean("replyAlerts", enabled).apply(); mutable.update { it.copy(replyAlerts = enabled) } }
    fun stopSpeaking() = speaker.stop()
    fun shouldRequestAlerts(): Boolean {
        if (prefs.getBoolean("askedReplyAlerts", false)) return false
        prefs.edit().putBoolean("askedReplyAlerts", true).apply(); return true
    }
    fun openNotification(chat: String) {
        if (chat.isBlank() || chat == mutable.value.chatId) { refresh(); return }
        viewModelScope.launch { work?.join(); selectChat(chat) }
    }
    fun readReply(text: String) { if (foreground && !mutable.value.muted && mutable.value.phase != Phase.RECORDING) speaker.speak(text, endpoint, token, mutable.value.liveSpeech) }
    fun configure(url: String, secret: String) {
        if (busy) return
        work?.cancel(); work = null
        endpoint = url; token = secret
        mutable.update { it.copy(phase = Phase.OFFLINE) }; refresh()
    }
    fun refresh() {
        if (busy || work?.isActive == true) return
        if (mutable.value.phase == Phase.ERROR) return
        val pending = prefs.getString("turn", null)
        if (pending != null) { work = viewModelScope.launch { poll(pending) }; return }
        mutable.update { it.copy(loadingHistory = true) }
        work = viewModelScope.launch {
            try {
                val status = api.request("/v1/status")
                if (mutable.value.chatId == null) createChat(mutable.value.provider) else loadHistory()
                val needsRetry = lastText != null || lastAudio != null
                mutable.update { it.copy(phase = if (needsRetry) Phase.ERROR else if (it.messages.isEmpty()) Phase.IDLE else Phase.READY,
                    context = it.context,
                    voiceReady = status.optBoolean("voiceAvailable"),
                    liveSpeech = status.optBoolean("liveSpeech"),
                    voiceState = status.optString("voiceState", "offline"),
                    detail = if (needsRetry) ConnectionRecovery.recoveredDetail(true) else if (status.optBoolean("voiceAvailable")) "Hold to talk" else status.optString("voiceDetail", "Voice unavailable · text ready")) }
            } catch (e: Exception) { fail(e) }
            finally { mutable.update { it.copy(loadingHistory = false) } }
        }
    }
    private fun encoded(value: String) = URLEncoder.encode(value, "UTF-8")
    private fun selected(chat: WatchChat) {
        prefs.edit().putString("chatId", chat.id).putString("provider", chat.provider).remove("newChatRequest").apply()
        mutable.update { it.copy(chatId = chat.id, chatSessionKey = chat.sessionKey, provider = chat.provider, chatTitle = chat.title, permission = prefs.getString("permission:${chat.id}", "readonly")!!,
            context = "${if (chat.provider == "codex") "Codex" else "Claude"} · ${chat.title}") }
    }
    private suspend fun createChat(provider: String) {
        val request = prefs.getString("newChatRequest", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("newChatRequest", it).apply() }
        val result = api.request("/v1/chats", JSONObject().put("provider", provider).put("requestId", request).toString().toByteArray())
        selected(ChatParser.chat(result.getJSONObject("chat")))
        clearReply()
        mutable.update { it.copy(messages = emptyList(), historyBefore = null, phase = Phase.IDLE, detail = "Hold to talk") }
    }
    fun newChat(provider: String = mutable.value.provider) {
        if (busy || prefs.contains("turn") || inputText != null) return
        stopSpeaking()
        work?.cancel()
        mutable.update { it.copy(loadingHistory = true, chatError = "") }
        work = viewModelScope.launch {
            try { createChat(provider) } catch (e: Exception) { fail(e) }
            finally { mutable.update { it.copy(loadingHistory = false) } }
        }
    }
    fun provider(value: String) = newChat(value)
    fun permission(value: String) {
        if (busy || prefs.contains("turn") || inputText != null || value !in setOf("readonly", "edit", "full")) return
        val chat = mutable.value.chatId ?: return
        prefs.edit().putString("permission:$chat", value).apply()
        mutable.update { it.copy(permission = value) }
    }
    fun answerApproval(action: String, values: Map<String, String>) {
        if (approvalWork?.isActive == true) return
        val request = mutable.value.approval ?: return
        val turn = mutable.value.turnId ?: return
        mutable.update { it.copy(answeringApproval = true, approvalError = "") }
        approvalWork = viewModelScope.launch {
            try {
                api.request("/v1/turns/${encoded(turn)}/approvals/${encoded(request.id)}", JSONObject().put("action", action).put("values", JSONObject(values)).toString().toByteArray())
                mutable.update { if (it.approval?.id == request.id) it.copy(approval = null) else it }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                mutable.update { it.copy(approvalError = if (ConnectionRecovery.canReconnect(e)) "Connection lost. Your decision was not confirmed; retry when connected." else e.message ?: "Could not send decision") }
            } finally { mutable.update { it.copy(answeringApproval = false) } }
        }
    }
    private var refreshingSelected = false
    suspend fun refreshSelected() {
        refreshQueue()
        val id = mutable.value.chatId ?: return
        if (refreshingSelected || busy || work?.isActive == true || prefs.contains("turn") || mutable.value.phase == Phase.OFFLINE) return
        refreshingSelected = true
        try {
            val result = api.request("/v1/chats/${encoded(id)}")
            if (mutable.value.chatId != id || busy || work?.isActive == true || prefs.contains("turn")) return
            applyHistory(result, preserveOlder = true)
            val active = result.optString("activeTurnId").takeIf { it.isNotBlank() && it != "null" }
            if (active != null) { prefs.edit().putString("turn", active).apply(); work = viewModelScope.launch { poll(active) } }
        } catch (e: CancellationException) { throw e } catch (_: Exception) {
            if (mutable.value.chatId == id) mutable.update { it.copy(externalRunning = false, detail = "Live status unavailable · reconnecting…") }
        } finally { refreshingSelected = false }
    }
    suspend fun refreshRunning() {
        try {
            val rows = ChatParser.chats(api.request("/v1/running")).distinctBy { it.id }
            mutable.update { it.copy(running = rows, runningStatus = if (rows.isEmpty()) "No active chats" else "") }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            mutable.update { it.copy(running = emptyList(), runningStatus = "Live status unavailable") }
        }
    }
    suspend fun refreshUnread() {
        try {
            val flags = ChatReadReceipt.states(api.request("/v1/read-states"))
            fun update(row: WatchChat) = row.copy(unread = flags[row.sessionKey] ?: row.unread)
            mutable.update { it.copy(chats = it.chats.map(::update), quickChats = it.quickChats.map(::update), running = it.running.map(::update)) }
        } catch (e: CancellationException) { throw e } catch (_: Exception) { /* Keep badges through reconnect. */ }
    }
    suspend fun viewed(receipt: ChatReadReceipt) {
        if (!receipt.unread || mutable.value.readReceipt != receipt || busy || mutable.value.externalRunning) return
        try {
            if (api.request("/v1/read-state", receipt.json().toString().toByteArray()).optBoolean("accepted")) {
                mutable.update { if (it.readReceipt == receipt) it.copy(readReceipt = receipt.copy(unread = false)) else it }
                refreshUnread()
            }
        } catch (e: CancellationException) { throw e } catch (_: Exception) { /* Retry only from a visible reader. */ }
    }
    suspend fun refreshQuickChats() = supervisorScope {
        mutable.update { it.copy(loadingQuickChats = true, quickChatsError = "") }
        try {
            val results = listOf("codex", "claude").map { provider -> async {
                try { Result.success(ChatParser.chats(api.request("/v1/chats?provider=$provider&offset=0"))) }
                catch (e: CancellationException) { throw e }
                catch (e: Exception) { Result.failure<List<WatchChat>>(e) }
            } }.awaitAll()
            mutable.update { current -> current.copy(
                quickChats = results.flatMap { it.getOrDefault(emptyList()) }
                    .let { if (results.all { r -> r.isFailure }) current.quickChats else it }.distinctBy { it.id },
                quickChatsError = if (results.any { it.isFailure }) "Some recent chats couldn’t load. Tap to retry." else "",
            ) }
        } finally { mutable.update { it.copy(loadingQuickChats = false) } }
    }
    fun listChats(provider: String = mutable.value.provider, more: Boolean = false) {
        catalogWork?.cancel()
        val offset = if (more) mutable.value.chatsOffset ?: return else 0
        mutable.update { it.copy(chatProvider = provider, loadingChats = true, chatError = "", chats = if (more) it.chats else emptyList()) }
        catalogWork = viewModelScope.launch {
            try {
                val result = api.request("/v1/chats?provider=$provider&offset=$offset")
                mutable.update { it.copy(chats = ((if (more) it.chats else emptyList()) + ChatParser.chats(result)).distinctBy { chat -> chat.id },
                    chatsOffset = if (result.isNull("nextOffset")) null else result.getInt("nextOffset")) }
            } catch (e: Exception) { if (e is CancellationException) throw e; mutable.update { it.copy(chatError = e.message ?: "Could not load chats") } }
            finally { mutable.update { it.copy(loadingChats = false) } }
        }
    }
    fun selectChat(id: String) {
        if (busy || prefs.contains("turn") || inputText != null) return
        stopSpeaking()
        work?.cancel()
        mutable.update { it.copy(loadingHistory = true, chatError = "") }
        work = viewModelScope.launch {
            try {
                val result = api.request("/v1/chats/${encoded(id)}")
                clearReply()
                applyHistory(result)
                mutable.update { it.copy(phase = if (it.messages.isEmpty()) Phase.IDLE else Phase.READY, detail = "Hold to talk") }
                val pending = result.optString("activeTurnId")
                if (pending.isNotBlank()) { prefs.edit().putString("turn", pending).apply(); poll(pending) }
            } catch (e: Exception) { fail(e) }
            finally { mutable.update { it.copy(loadingHistory = false) } }
        }
    }
    private fun applyHistory(result: JSONObject, older: Boolean = false, preserveOlder: Boolean = false) {
        selected(ChatParser.chat(result.getJSONObject("chat")))
        val messages = ChatParser.messages(result)
        if (!older) prefs.edit().putString("history", result.toString()).apply()
        mutable.update { it.copy(readReceipt = if (older) it.readReceipt else ChatReadReceipt.parse(result.optJSONObject("readState")), externalRunning = result.optBoolean("running") && result.optString("activeTurnId").let { t -> t.isBlank() || t == "null" }, messages = if (older) (messages + it.messages).distinctBy { m -> m.id } else if (preserveOlder) it.messages.filter { old -> old.id.startsWith("history-") && old.id.substringAfter("history-").toIntOrNull()?.let { n -> n < (messages.firstOrNull()?.id?.substringAfter("history-")?.toIntOrNull() ?: 0) } == true } + messages else messages,
            historyBefore = if (preserveOlder && it.messages.isNotEmpty()) it.historyBefore else if (result.isNull("before")) null else result.getInt("before")) }
    }
    private suspend fun loadHistory(older: Boolean = false) {
        val id = mutable.value.chatId ?: return
        val before = if (older) "?before=${mutable.value.historyBefore ?: return}" else ""
        val result = api.request("/v1/chats/${encoded(id)}$before")
        applyHistory(result, older, !older && mutable.value.messages.isNotEmpty())
        if (!older && result.optString("activeTurnId").isNotBlank()) {
            val pending = result.getString("activeTurnId")
            prefs.edit().putString("turn", pending).apply()
            poll(pending)
        }
    }
    fun olderMessages() {
        if (busy) return
        mutable.update { it.copy(loadingHistory = true) }
        work = viewModelScope.launch { try { loadHistory(true) } catch (e: Exception) { fail(e) }
            finally { mutable.update { it.copy(loadingHistory = false) } } }
    }
    fun mute() {
        val muted = !mutable.value.muted
        prefs.edit().putBoolean("muted", muted).apply()
        mutable.update { it.copy(muted = muted) }
        if (muted) { cancelRecording(); stopSpeaking() }
    }
    fun startRecording() {
        if (prefs.contains("turn") || (mutable.value.externalRunning && mutable.value.inputMode == "steer")) { startInputRecording(); return }
        if (busy || prefs.contains("turn") || mutable.value.muted || mutable.value.phase == Phase.OFFLINE || mutable.value.chatId == null) return
        if (!mutable.value.voiceReady) { refresh(); return }
        stopSpeaking()
        try {
            liveSpeech?.cancel()
            liveSpeech = if (mutable.value.liveSpeech) LiveSpeech(endpoint, token) { text ->
                viewModelScope.launch { if (mutable.value.phase == Phase.RECORDING) mutable.update { it.copy(liveTranscript = text) } }
            } else null
            voice.start(viewModelScope, { finishRecording() }, { error -> cancelRecording(); mutable.update { it.copy(phase = Phase.ERROR, detail = error) } },
                { level, seconds -> mutable.update { if (it.phase == Phase.RECORDING) it.copy(microphoneLevel = level, recordingSeconds = seconds) else it } },
                { bytes -> liveSpeech?.write(bytes) })
            mutable.update { it.copy(phase = Phase.RECORDING, liveTranscript = "", detail = "Listening · release to send", microphoneLevel = 0f, recordingSeconds = 0f) }
        } catch (e: Exception) { voice.cancel(); liveSpeech?.cancel(); liveSpeech = null; fail(e) }
    }
    fun finishRecording() {
        if (mutable.value.inputRecording) { finishInputRecording(); return }
        if (mutable.value.phase != Phase.RECORDING) return
        clearReply()
        mutable.update { it.copy(phase = Phase.UPLOADING, transcript = "", microphoneLevel = 0f, detail = "Sending your voice…") }
        work = viewModelScope.launch {
            try {
                val audio = voice.stop()
                val live = liveSpeech; liveSpeech = null
                val text = live?.finish()
                lastText = text; lastAudio = if (text == null) audio else null; requestId = UUID.randomUUID().toString()
                mutable.update { it.copy(liveTranscript = "", detail = if (text == null) "Transcribing recording…" else "Sending…") }
                submit(text, lastAudio)
            } catch (e: Exception) { fail(e) }
        }
    }
    fun cancelRecording() {
        if (mutable.value.inputRecording) {
            voice.cancel(); liveSpeech?.cancel(); liveSpeech = null
            mutable.update { it.copy(inputRecording = false, liveTranscript = "", microphoneLevel = 0f, inputStatus = "Recording cancelled") }
            return
        }
        if (mutable.value.phase != Phase.RECORDING) return
        voice.cancel()
        liveSpeech?.cancel(); liveSpeech = null
        mutable.update { it.copy(phase = Phase.IDLE, microphoneLevel = 0f, recordingSeconds = 0f, detail = "Recording cancelled") }
    }
    suspend fun refreshQueue() {
        val id=mutable.value.chatId ?: return
        try {
            val q=dev.ally.device.MessageQueue.parse(api.request("/v1/queue/${encoded(id)}")) ?: return
            if(mutable.value.chatId==id && !mutable.value.queueChanging && (mutable.value.queue.chatId!=q.chatId || q.revision>=mutable.value.queue.revision)) mutable.update { it.copy(queue=q,queueError="") }
        } catch(e: CancellationException) { throw e } catch(_: Exception) {
            if(mutable.value.queue.items.isNotEmpty()) mutable.update { it.copy(queueError="Queue offline · reconnect") }
        }
    }
    fun queueChange(change: JSONObject) {
        val id=mutable.value.chatId ?: return
        if(mutable.value.queueChanging) return
        mutable.update { it.copy(queueChanging=true,queueError="") }
        viewModelScope.launch {
            try { dev.ally.device.MessageQueue.parse(api.request("/v1/queue/${encoded(id)}",change.toString().toByteArray()))?.let { q -> mutable.update { it.copy(queue=q) } } }
            catch(e: CancellationException) { throw e } catch(e: Exception) { mutable.update { it.copy(queueError=e.message ?: "Queue change failed") } }
            finally { mutable.update { it.copy(queueChanging=false) } }
        }
    }
    fun inputMode(value: String) { if (inputText == null && value in setOf("queue", "steer")) mutable.update { it.copy(inputMode = value) } }
    fun send(text: String) {
        if (prefs.contains("turn") && text.isNotBlank()) { sendInput(text); return }
        if (inputText != null) { mutable.update { it.copy(inputStatus = "Retry or dismiss your previous input in Settings first") }; return }
        if (mutable.value.externalRunning && text.isNotBlank()) { sendInput(text); return }
        if (busy || text.isBlank() || prefs.contains("turn") || mutable.value.chatId == null) return
        stopSpeaking()
        clearReply()
        lastText = text.take(4000); lastAudio = null; requestId = UUID.randomUUID().toString()
        mutable.update { it.copy(phase = Phase.UPLOADING, transcript = text, detail = "Sending…") }
        work = viewModelScope.launch { try { submit(lastText, null) } catch (e: Exception) { fail(e) } }
    }
    private fun startInputRecording() {
        if (mutable.value.inputRecording || mutable.value.inputSending || mutable.value.muted || !mutable.value.voiceReady || inputText != null) return
        inputTarget = prefs.getString("turn", null) ?: mutable.value.chatId?.takeIf { mutable.value.externalRunning }?.let { "chat:$it" } ?: return
        stopSpeaking()
        try {
            liveSpeech = if (mutable.value.liveSpeech) LiveSpeech(endpoint, token) { text ->
                viewModelScope.launch { if (mutable.value.inputRecording) mutable.update { it.copy(liveTranscript = text) } }
            } else null
            voice.start(viewModelScope, ::finishInputRecording, { error -> cancelRecording(); mutable.update { it.copy(inputStatus = error) } },
                { level, seconds -> mutable.update { if (it.inputRecording) it.copy(microphoneLevel = level, recordingSeconds = seconds) else it } },
                { bytes -> liveSpeech?.write(bytes) })
            mutable.update { it.copy(inputRecording = true, liveTranscript = "", inputStatus = "Listening · release to add input", microphoneLevel = 0f, recordingSeconds = 0f) }
        } catch (e: Exception) { voice.cancel(); liveSpeech?.cancel(); liveSpeech = null; mutable.update { it.copy(inputRecording = false, inputStatus = e.message ?: "Microphone unavailable") } }
    }
    private fun finishInputRecording() {
        if (!mutable.value.inputRecording) return
        mutable.update { it.copy(inputRecording = false, inputSending = true, inputStatus = "Finishing your words…", microphoneLevel = 0f) }
        inputWork = viewModelScope.launch {
            try {
                val audio = voice.stop()
                val live = liveSpeech; liveSpeech = null
                val text = live?.finish() ?: api.request("/v1/speech/transcribe", audio, "audio/wav").getString("text")
                deliverInput(text)
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                mutable.update { it.copy(inputStatus = e.message ?: "Input not confirmed", inputDraft = inputText ?: it.liveTranscript) }
            } finally { mutable.update { it.copy(inputSending = false, liveTranscript = "") } }
        }
    }
    private suspend fun deliverInput(text: String) {
        require(text.isNotBlank() && text.length <= 12000) { "Input must contain 1–12000 characters" }
        check(inputText == null || inputText == text) { "Retry or dismiss your previous input first" }
        val previousTarget = inputTarget ?: prefs.getString("turn", null) ?: mutable.value.chatId?.takeIf { mutable.value.externalRunning }?.let { "chat:$it" } ?: error("Response finished. Send this as a new message.")
        deliveryMode = deliveryMode ?: mutable.value.inputMode
        val target=if(deliveryMode=="queue") "chat:${mutable.value.chatId ?: error("Select the original chat")}" else previousTarget
        inputTarget = target; inputText = text; inputRequest = inputRequest ?: UUID.randomUUID().toString()
        prefs.edit().putString("inputTarget", target).putString("inputText", text).putString("inputRequest", inputRequest).putString("inputMode", deliveryMode).commit()
        if(deliveryMode=="queue" && !api.request("/v1/status").optBoolean("messageQueue")) error("Shared queue update is activating. Draft saved; retry shortly.")
        val result = api.request(if (target.startsWith("chat:")) "/v1/chats/${encoded(target.removePrefix("chat:"))}/input" else "/v1/turns/${encoded(target)}/input", JSONObject().put("text", text).put("requestId", inputRequest).put("mode", deliveryMode).put("permission",mutable.value.permission).toString().toByteArray())
        mutable.update { it.copy(queue=dev.ally.device.MessageQueue.parse(result) ?: it.queue,inputStatus = if (result.optString("mode") == "steered") "Added to current work" else "Queued after this response", inputDraft = "") }
        acceptedDraft(text)
        inputText = null; inputTarget = null; inputRequest = null; deliveryMode = null
        prefs.edit().remove("inputTarget").remove("inputText").remove("inputRequest").remove("inputMode").apply()
    }
    private fun sendInput(text: String) {
        if (mutable.value.inputRecording || mutable.value.inputSending) return
        if (inputText == null) inputTarget = prefs.getString("turn", null)
        mutable.update { it.copy(inputSending = true, inputStatus = "Adding input…") }
        inputWork = viewModelScope.launch {
            try { deliverInput(text) }
            catch (e: Exception) { if (e is CancellationException) throw e; mutable.update { it.copy(inputDraft = text, inputStatus = e.message ?: "Input not confirmed") } }
            finally { mutable.update { it.copy(inputSending = false) } }
        }
    }
    fun retryInput() { inputText?.let(::sendInput) }
    fun dismissInput() {
        if (mutable.value.inputSending || mutable.value.inputRecording) return
        inputText = null; inputTarget = null; inputRequest = null; deliveryMode = null
        prefs.edit().remove("inputTarget").remove("inputText").remove("inputRequest").remove("inputMode").apply()
        mutable.update { it.copy(inputDraft = "", inputStatus = "") }
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
        mutable.update { it.copy(liveAttachments = emptyList(), liveText = "", reply = WatchReply("", emptyList()), steps = emptyList(), usage = "", turnId = null, approval = null, approvalError = "") }
    }
    private fun acceptedDraft(text: String?) {
        val base = application.getSharedPreferences("ally-watch", 0)
        val key = "composer:${mutable.value.chatId}"
        if (text != null && base.getString(key, null) == text) base.edit().remove(key).apply()
    }
    private suspend fun submit(text: String?, audio: ByteArray?) {
        if (mutable.value.chatId == null) createChat(mutable.value.provider)
        val chatId = mutable.value.chatId!!
        val provider = mutable.value.provider
        pendingQueue = pendingQueue ?: mutable.value.externalRunning
        if (audio != null) pendingAudio.writeBytes(audio)
        prefs.edit().putString("pendingText", text).putString("pendingRequest", requestId).putString("pendingQueue", pendingQueue.toString()).commit()
        val result = if (audio != null) api.request("/v1/audio?provider=$provider&requestId=$requestId&chatId=${encoded(chatId)}&permission=${mutable.value.permission}", audio, "audio/wav")
        else api.request("/v1/messages", JSONObject().put("provider", provider).put("chatId", chatId).put("requestId", requestId).put("permission", mutable.value.permission).put("text", text).put("queueAfterCurrent", pendingQueue == true).toString().toByteArray())
        val id = result.getString("id")
        if(result.optBoolean("queued")) {
            prefs.edit().remove("pendingText").remove("pendingRequest").remove("pendingQueue").apply()
            pendingQueue=null; acceptedDraft(text); pendingAudio.delete(); lastAudio=null; lastText=null; requestId=null
            mutable.update { it.copy(queue=dev.ally.device.MessageQueue.parse(result) ?: it.queue,phase=Phase.READY,detail="Queued after this response") }
            return
        }
        prefs.edit().putString("turn", id).remove("pendingText").remove("pendingRequest").remove("pendingQueue").apply()
        pendingQueue = null
        acceptedDraft(text); pendingAudio.delete(); lastAudio = null
        poll(id)
    }
    private suspend fun poll(id: String) {
        if (foreground && !ReplyMonitor.start(getApplication(), id, mutable.value.chatId ?: "")) mutable.update { it.copy(speechError = "Keep Ally open for reply alerts on this watch.") }
        mutable.update { it.copy(phase = Phase.THINKING, turnId = id, detail = "Thinking…") }
        try {
            var polls = 0
            while (polls < 240) {
                val result = reconnectingTurnRead({ mutable.update { it.copy(detail = "Reconnecting… Your task is still on the desktop", approval = null) } }) { api.request("/v1/turns/$id") }
                val approval = ApprovalParser.parse(result)
                dev.ally.device.MessageQueue.parse(result)?.let { q -> if(!mutable.value.queueChanging && (mutable.value.queue.chatId!=q.chatId || q.revision>=mutable.value.queue.revision)) mutable.update { it.copy(queue=q) } }
                if (approval == null) polls++
                mutable.update { it.copy(approval = approval, approvalError = if (it.approval?.id == approval?.id) it.approvalError else "") }
                result.optString("transcript").takeIf { it.isNotBlank() }?.let { lastText = it }
                mutable.update { it.copy(liveAttachments = AttachmentParser.list(result), liveText = result.optString("liveText").take(12000), transcript = result.optString("transcript", it.transcript), detail = result.optString("activity", "Thinking…"), steps = ActivityParser.steps(result), usage = ActivityParser.usage(result)) }
                when (result.optString("status")) {
                    "done" -> {
                        lastText = null; lastAudio = null; requestId = null
                        val json = result.getJSONObject("reply")
                        prefs.edit().remove("turn").putString("reply", json.toString()).putString("activity", JSONObject().put("steps", result.optJSONArray("steps")).put("usage", result.optJSONObject("usage")).put("transcript", result.optString("transcript")).toString()).apply()
                        mutable.update { it.copy(liveAttachments = emptyList(), liveText = "", phase = Phase.READY, approval = null, reply = CardParser.parse(json), detail = "Response ready", readySequence = it.readySequence + 1) }
                        val reply = CardParser.parse(json)
                        mutable.update { it.copy(messages = it.messages + listOf(
                            ChatMessage("$id-user", "user", WatchReply(result.optString("transcript"), emptyList()), emptyList(), ""),
                            ChatMessage("$id-assistant", "assistant", reply, ActivityParser.steps(result), ActivityParser.usage(result), AttachmentParser.list(result)))) }
                        mutable.update { it.copy(loadingHistory = true) }
                        try { loadHistory() } catch (e: Exception) { if (e is CancellationException) throw e }
                        finally { mutable.update { it.copy(loadingHistory = false) } }
                        // Native history can lag the final event; do not erase the answer we just received.
                        mutable.update { it.copy(messages = if (it.messages.lastOrNull()?.let { m -> m.role == "assistant" && m.reply.text == reply.text } == true) it.messages.dropLast(1) + it.messages.last().copy(attachments = (it.messages.last().attachments + AttachmentParser.list(result)).distinctBy { a -> a.id }) else it.messages + ChatMessage("$id-assistant", "assistant", reply, ActivityParser.steps(result), ActivityParser.usage(result), AttachmentParser.list(result))) }
                        WatchNotifications.show(getApplication(), "Ally has your answer", json.optString("text"), id, mutable.value.chatId ?: "")
                        if (foreground && mutable.value.autoRead && !mutable.value.inputRecording && !mutable.value.inputSending) readReply(reply.readAloudText())
                        return
                    }
                    "error" -> { prefs.edit().remove("turn").apply(); mutable.update { it.copy(approval = null) }; requestId = UUID.randomUUID().toString(); error(result.optString("error", "Agent unavailable")) }
                }
                delay(1500)
            }
            error("Still working. Tap Retry to check again.")
        } catch (e: Exception) {
            if (e.message?.contains("expired") == true) {
                prefs.edit().remove("turn").apply()
                mutable.update { it.copy(turnId = null, approval = null, approvalError = "") }
            }
            fail(e)
        }
    }
    private fun fail(e: Exception) {
        if (e is CancellationException) throw e
        val reconnecting = ConnectionRecovery.canReconnect(e)
        mutable.update { it.copy(phase = if (reconnecting) Phase.OFFLINE else Phase.ERROR,
            detail = if (reconnecting) "Reconnecting to Ally… Keep Ally open on your PC" else e.message?.take(180) ?: "Connection interrupted. Retry when ready.") }
    }
    fun close() { voice.cancel(); liveSpeech?.cancel(); speaker.close() }
}
