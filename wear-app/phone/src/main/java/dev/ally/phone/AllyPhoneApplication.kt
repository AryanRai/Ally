package dev.ally.phone

import dev.ally.device.*
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.*
import androidx.compose.ui.graphics.toArgb

class AllyPhoneApplication : AssistantApplication() {
    var activityVisible = false
    val model: PhoneModel by lazy { PhoneModel(this) }
    override fun onCreate() { super.onCreate(); dev.ally.phone.codex.PhoneCodex.install(this); ControlBridge.install(this); DeviceLink.closeNotificationShade = { AllyControlService.instance?.dismissShade() == true }; PhysicalTapService.install();PhoneStream.install();NativeMedia.install();AcousticProbeService.install(); dev.ally.phone.notch.PhoneNotch.resume(this) }
    override val assistantHost: AssistantHost by lazy { object : AssistantHost {
        override val provider get() = model.state.value.provider
        override fun permissionFor(chatId: String) = DeviceLink.prefs(this@AllyPhoneApplication).getString("phonePermission:$chatId", "readonly")!!
        override fun acceptTurn(chatId: String, turnId: String) = model.acceptAssistantTurn(chatId, turnId)
        override fun openChat(chatId: String) = model.select(chatId)
        override fun prepareVoice() { AcousticProbeService.instance?.cancelForVoice(); model.stopSpeaking() }
        override fun phoneCodexAvailable() = dev.ally.phone.codex.PhoneCodex.available(this@AllyPhoneApplication)
        override fun openPhoneCodex(text: String) { startActivity(android.content.Intent(this@AllyPhoneApplication,dev.ally.phone.codex.CodexPhoneActivity::class.java).putExtra("draft",text).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) }
        override suspend fun routePhoneCodex(text: String, requestId: String): Boolean {
            val runtime=dev.ally.phone.codex.PhoneCodex
            if(!runtime.status.value.signedIn || !DeviceLink.prefs(this@AllyPhoneApplication).getBoolean("phone.codex.autoRoute",true) || dev.ally.phone.codex.PhoneExecutionRouter.target(text)!=dev.ally.phone.codex.PhoneExecutionRouter.Target.PHONE)return false
            val id=runtime.routedChat(this@AllyPhoneApplication,requestId)
            val result=runtime.request("/v1/messages",org.json.JSONObject().put("chatId",id).put("requestId",requestId).put("text",text))?:return false
            withContext(Dispatchers.Main){model.acceptAssistantTurn(id,result.getString("id"))}
            return true
        }
        override fun phoneCodexSignedIn() = dev.ally.phone.codex.PhoneCodex.knownSignedIn(this@AllyPhoneApplication)
        override fun phoneCodexChats() = dev.ally.phone.codex.PhoneCodex.recentChats().map { AssistantChoice(it.getString("id"), it.optString("title").ifBlank { "Phone chat" }, AssistantRoutePicker.PHONE) }
        override suspend fun sendPhoneCodex(chatId: String?, text: String, requestId: String): String? {
            val runtime=dev.ally.phone.codex.PhoneCodex
            val id=chatId?.takeIf(runtime::owns) ?: runtime.routedChat(this@AllyPhoneApplication,requestId)
            val result=runtime.request("/v1/messages",org.json.JSONObject().put("chatId",id).put("requestId",requestId).put("text",text))?:return null
            withContext(Dispatchers.Main){model.acceptAssistantTurn(id,result.getString("id"))}
            return id
        }
        override fun speechDetector() = PhoneSpeechDetector(this@AllyPhoneApplication)
        override fun haloAppearance(): AssistantHaloAppearance {
            val look = PhoneLook.load(DeviceLink.prefs(this@AllyPhoneApplication))
            return AssistantHaloAppearance(look.style.name, look.palette.colors.map { it.toArgb() }, look.listeningEyes)
        }
        override fun presentationVisible(visible: Boolean) { model.foreground = visible || activityVisible }
        override val snapshots = model.state.map { s -> AssistantSnapshot(
            readReceipt = s.readReceipt.takeIf { s.voiceDraft.isBlank() && !s.recording && !s.transcribing && (s.liveText.isBlank() || s.liveText == s.messages.lastOrNull { m -> m.role == "assistant" }?.text) },
            title = s.selected?.title ?: "Choose a chat", status = when {
                s.recording -> "Listening · release to send"
                s.transcribing -> "Finishing your words…"
                s.error.isNotBlank() -> s.error
                s.approval != null -> "Approval needed · expand to review"
                s.inputStatus.isNotBlank() -> s.inputStatus
                s.busy || s.externalRunning -> s.activity.ifBlank { "Working…" }
                s.loading -> "Connecting…"
                else -> "Hold the orb to talk"
            }, text = if (s.recording || s.transcribing) s.liveTranscript else s.voiceDraft.ifBlank { s.liveText }.ifBlank { s.progress.lastOrNull()?.text.orEmpty() }.ifBlank { s.messages.lastOrNull { it.role == "assistant" }?.text ?: "" },
            chatId = s.selected?.id, recording = s.recording, working = s.busy || s.externalRunning || s.transcribing, level = if(s.recording) s.microphoneLevel else s.speakerLevel, mode = s.inputMode, speaking = s.speaking,
            needsAttention = s.approval != null || s.error.isNotBlank()) }
        private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        override fun refresh() { scope.launch { model.refreshSelected() } }
        override fun start() = model.startRecording()
        override fun release() = model.finishAssistantRecording()
        override fun cancel() = model.cancelRecording()
        override fun send(text: String) = model.send(text)
        override suspend fun viewed(receipt: ChatReadReceipt) = model.viewed(receipt)
        override fun mode(value: String) = model.inputMode(value)
    } }
}
