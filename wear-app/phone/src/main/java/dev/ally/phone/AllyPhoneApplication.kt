package dev.ally.phone

import dev.ally.device.*
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.*

class AllyPhoneApplication : AssistantApplication() {
    val model: PhoneModel by lazy { PhoneModel(this) }
    override val assistantHost: AssistantHost by lazy { object : AssistantHost {
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
            }, text = if (s.recording || s.transcribing) s.liveTranscript else s.voiceDraft.ifBlank { s.liveText }.ifBlank { s.messages.lastOrNull { it.role == "assistant" }?.text ?: "" },
            recording = s.recording, working = s.busy || s.externalRunning || s.transcribing, level = s.microphoneLevel, mode = s.inputMode,
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
