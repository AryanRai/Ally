package dev.ally.device

/** Eligibility for showing a review prompt, never permission to capture or send.
 * Sensor/scanner adapters must verify paired identity and deliberate gesture separately.
 * All timestamps are from the same monotonic clock, not wall-clock or remote timestamps. */
internal class ContextHandoffGesture(private val now: () -> Long) {
    enum class Gesture { KNOCK, NFC }
    private var pairedPc: String? = null
    private var nearAt: Long? = null
    private var lastReviewAt: Long? = null
    fun proximity(pc: String, authenticated: Boolean, near: Boolean) {
        if (!authenticated || !near || pc.isBlank()) { pairedPc = null; nearAt = null; return }
        pairedPc = pc; nearAt = now()
    }
    fun review(gesture: Gesture, pc: String, unlocked: Boolean, enabled: Boolean): Boolean {
        val time = now()
        val seen = nearAt ?: return false
        if (!enabled || !unlocked || pc != pairedPc || time - seen !in 0..3_000) return false
        if (lastReviewAt?.let { time - it < 5_000 } == true) return false
        // NFC still requires the paired-PC observation; an arbitrary tag is not authority.
        when (gesture) { Gesture.KNOCK, Gesture.NFC -> Unit }
        lastReviewAt = time; pairedPc = null; nearAt = null
        return true
    }
    fun clear() { pairedPc = null; nearAt = null }
}
