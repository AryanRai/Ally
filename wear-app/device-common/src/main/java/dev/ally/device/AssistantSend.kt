package dev.ally.device

/** Typed input owns Send even if automatic microphone capture is still running. */
object AssistantSend {
    enum class Action { TEXT, FINISH_VOICE, NONE }
    fun action(text: String, recording: Boolean) = when {
        text.isNotBlank() -> Action.TEXT
        recording -> Action.FINISH_VOICE
        else -> Action.NONE
    }
    fun discardSilentCapture(automatic: Boolean, speechDetectionAvailable: Boolean, heard: Boolean) =
        automatic && speechDetectionAvailable && !heard
}
