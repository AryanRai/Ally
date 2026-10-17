package dev.ally.watch

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt

/** Exactly bounded 16 kHz, signed 16-bit mono recording; no disk writes. */
internal class PcmRecording {
    private val bytes = ByteArrayOutputStream()
    val seconds get() = bytes.size() / 32000f
    val full get() = bytes.size() >= MAX_BYTES
    fun append(buffer: ByteArray, count: Int): Float {
        require(count in 0..buffer.size && count % 2 == 0)
        val accepted = minOf(count, MAX_BYTES - bytes.size())
        bytes.write(buffer, 0, accepted)
        if (accepted == 0) return 0f
        var energy = 0.0
        for (i in 0 until accepted step 2) {
            val sample = ((buffer[i].toInt() and 255) or (buffer[i + 1].toInt() shl 8)).toShort().toDouble() / 32768.0
            energy += sample * sample
        }
        return (sqrt(energy / (accepted / 2)) * 5).toFloat().coerceIn(0f, 1f)
    }
    fun wav(): ByteArray {
        require(bytes.size() >= 6400) { "Hold a little longer to speak" }
        val pcm = bytes.toByteArray()
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray()).putInt(pcm.size + 36).put("WAVEfmt ".toByteArray())
        header.putInt(16).putShort(1).putShort(1).putInt(16000).putInt(32000).putShort(2).putShort(16)
        header.put("data".toByteArray()).putInt(pcm.size)
        return header.array() + pcm
    }
    companion object { const val MAX_BYTES = 16000 * 2 * 60 }
}
