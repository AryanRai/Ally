package dev.ally.phone

import android.content.Context
import com.konovalov.vad.silero.VadSilero
import com.konovalov.vad.silero.config.FrameSize
import com.konovalov.vad.silero.config.Mode
import com.konovalov.vad.silero.config.SampleRate
import dev.ally.device.voice.PcmSpeechDetector

/** Speech classification, not loudness. Original audio still reaches transcription. */
class PhoneSpeechDetector(context: Context) : PcmSpeechDetector {
    private val vad = VadSilero(context.applicationContext,
        sampleRate = SampleRate.SAMPLE_RATE_16K,
        frameSize = FrameSize.FRAME_SIZE_512,
        mode = Mode.NORMAL,
        speechDurationMs = 0, silenceDurationMs = 0)
    override val frameBytes = 1024
    override fun isSpeech(frame: ByteArray) = vad.isSpeech(frame)
    override fun close() = vad.close()
}
