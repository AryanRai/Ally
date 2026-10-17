package dev.ally.phone

internal enum class VoiceDelivery { SEND, REVIEW, FINISHED }

/** A recording intended as guidance must not silently start a different turn. */
internal fun voiceDelivery(capturedTurn: String?, currentTurn: String?, review: Boolean): VoiceDelivery = when {
    review -> VoiceDelivery.REVIEW
    capturedTurn != null && capturedTurn != currentTurn -> VoiceDelivery.FINISHED
    else -> VoiceDelivery.SEND
}
