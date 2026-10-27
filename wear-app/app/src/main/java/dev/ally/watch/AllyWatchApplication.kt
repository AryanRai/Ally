package dev.ally.watch

import dev.ally.device.*
import kotlinx.coroutines.flow.map

class AllyWatchApplication : AssistantApplication() {
    var activityVisible = false
    val model: WatchViewModel by lazy { WatchViewModel(this) }
    override val assistantHost: AssistantHost by lazy { object : AssistantHost {
        override val provider get() = model.state.value.provider
        override fun permissionFor(chatId: String) = DeviceLink.prefs(this@AllyWatchApplication).getString("permission:$chatId", "readonly")!!
        override fun acceptTurn(chatId: String, turnId: String) = model.acceptAssistantTurn(chatId, turnId)
        override fun openChat(chatId: String) = model.selectChat(chatId)
        override fun prepareVoice() = model.stopSpeaking()
        override fun presentationVisible(visible: Boolean) { model.foreground = visible || activityVisible }
        override val snapshots = model.state.map { s -> AssistantSnapshot(
            readReceipt = s.readReceipt.takeIf { s.inputDraft.isBlank() && (s.liveText.isBlank() || s.liveText == s.messages.lastOrNull { m -> m.role == "assistant" }?.reply?.text) && (s.reply.text.isBlank() || s.reply.text == s.messages.lastOrNull { m -> m.role == "assistant" }?.reply?.text) },
            title = s.chatTitle, status = when {
                s.phase == Phase.RECORDING || s.inputRecording -> "Listening · release to send"
                s.approval != null -> "Approval needed · expand to review"
                s.inputStatus.isNotBlank() -> s.inputStatus
                s.phase == Phase.THINKING || s.phase == Phase.UPLOADING || s.phase == Phase.ERROR -> s.detail
                s.externalRunning -> "Working…"
                s.loadingHistory -> "Connecting…"
                else -> "Hold the orb to talk"
            }, text = if (s.phase == Phase.RECORDING || s.inputRecording) s.liveTranscript else s.inputDraft.ifBlank { s.liveText }.ifBlank { s.progress.lastOrNull()?.text.orEmpty() }.ifBlank { s.reply.text }.ifBlank { s.messages.lastOrNull { it.role == "assistant" }?.reply?.text ?: "" },
            chatId = s.chatId, recording = s.phase == Phase.RECORDING || s.inputRecording, working = s.externalRunning || s.phase in setOf(Phase.THINKING, Phase.UPLOADING) || s.inputSending,
            level = s.microphoneLevel, mode = s.inputMode, needsAttention = s.approval != null || s.phase == Phase.ERROR) }
        override fun refresh() = model.refresh()
        override fun start() = model.startRecording()
        override fun release() = model.finishRecording()
        override fun cancel() = model.cancelRecording()
        override fun send(text: String) = model.send(text)
        override suspend fun viewed(receipt: ChatReadReceipt) = model.viewed(receipt)
        override fun mode(value: String) = model.inputMode(value)
    } }
}

