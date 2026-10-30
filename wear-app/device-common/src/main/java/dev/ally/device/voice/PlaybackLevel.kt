package dev.ally.device.voice

import kotlin.math.sqrt

object PlaybackLevel {
    fun pcm16(bytes: ByteArray, start: Int = 0, end: Int = bytes.size): Float {
        var energy = 0.0
        var count = 0
        for (i in start until end - 1 step 2) {
            val sample = ((bytes[i].toInt() and 255) or (bytes[i+1].toInt() shl 8)).toShort().toDouble() / 32768.0
            energy += sample * sample; count++
        }
        return if(count == 0) 0f else (sqrt(energy/count) * 4).toFloat().coerceIn(0f, 1f)
    }
}
