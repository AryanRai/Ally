package dev.ally.device.voice

/** One recording owns this detector. Called and closed only on its capture IO job. */
interface PcmSpeechDetector : AutoCloseable {
    val frameBytes: Int
    fun isSpeech(frame: ByteArray): Boolean
}

/** Preserve partial PCM frames across arbitrary AudioRecord reads, without padding. */
class PcmSpeechFrames(private val detector: PcmSpeechDetector) {
    private val frame = ByteArray(detector.frameBytes.also { require(it in 2..32000 && it % 2 == 0) })
    private var filled = 0
    private var processed = 0L
    fun append(bytes: ByteArray): List<Pair<Boolean, Float>> {
        require(bytes.size % 2 == 0)
        val results = mutableListOf<Pair<Boolean, Float>>()
        var offset = 0
        while (offset < bytes.size) {
            val count = minOf(frame.size - filled, bytes.size - offset)
            bytes.copyInto(frame, filled, offset, offset + count)
            filled += count; offset += count
            if (filled == frame.size) {
                processed += frame.size
                results += detector.isSpeech(frame) to (processed / 32000f)
                filled = 0
            }
        }
        return results
    }
}
