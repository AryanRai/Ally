package dev.ally.device

/** Endpoint timing only; phone feeds classified speech, watch retains energy input. */
class AssistantSilence private constructor(
    private val pauseSeconds: Float,
    private val startTimeoutSeconds: Float,
    private val speechLevel: Float,
    private val sustainLevel: Float,
    private val contiguousOnset: Boolean,
) {
    // Keep the existing watch endpoint and threshold.
    constructor() : this(1.5f, 5f, .08f, .08f, false)

    var heard = false; private set
    private var voiced = 0f
    private var lastSpeech = 0f
    private var previous = 0f

    fun sampleSpeech(isSpeech: Boolean, seconds: Float) = sample(if (isSpeech) 1f else 0f, seconds)

    fun sample(level: Float, seconds: Float): Boolean {
        val delta = (seconds - previous).coerceIn(0f, .3f)
        previous = seconds
        if (level >= if (heard) sustainLevel else speechLevel) {
            voiced += delta
            lastSpeech = seconds
            if (voiced >= .16f) heard = true
        } else if (contiguousOnset && !heard) {
            // Separate taps/clicks must not accumulate into a spoken request.
            voiced = 0f
        }
        return if (heard) seconds - lastSpeech >= pauseSeconds else seconds >= startTimeoutSeconds
    }

    companion object {
        // Automatic phone invocation should finish promptly after a sentence.
        // PcmRecording supplies RMS scaled by five, rather than raw PCM amplitude.
        fun phone() = AssistantSilence(1.2f, 8f, .025f, .018f, true)
    }
}
