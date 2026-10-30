package dev.ally.device.voice

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicBoolean

interface VoiceCapture {
    fun start(scope: CoroutineScope, onLimit: () -> Unit, onError: (String) -> Unit, onLevel: (Float, Float) -> Unit, onAudio: (ByteArray) -> Unit = {})
    suspend fun stop(): ByteArray
    fun cancel()
}

/** Each gesture owns its recorder. Cancellation never releases a recorder still being read. */
class VoiceRecorder(private val maxSeconds: Int = 60,
    private val detectorFactory: (() -> PcmSpeechDetector?)? = null,
    private val onSpeech: (Boolean, Float) -> Unit = { _, _ -> },
    private val onDetectorUnavailable: () -> Unit = {}) : VoiceCapture {
    private class Capture(val audio: AudioRecord, maxSeconds: Int) {
        val recording = AtomicBoolean(true)
        val pcm = PcmRecording(maxSeconds)
        var job: Job? = null
        private val released = AtomicBoolean(false)
        fun release() {
            if (released.compareAndSet(false, true)) {
                recording.set(false)
                runCatching { audio.stop() }
                audio.release()
            }
        }
    }
    private var current: Capture? = null

    @SuppressLint("MissingPermission")
    override fun start(scope: CoroutineScope, onLimit: () -> Unit, onError: (String) -> Unit, onLevel: (Float, Float) -> Unit, onAudio: (ByteArray) -> Unit) {
        check(current == null)
        val minimum = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        check(minimum > 0) { "This microphone does not support voice capture" }
        val size = maxOf(4096, minimum)
        // Leave room for model initialization while the microphone is already
        // listening. Keep individual reads small for live text and halo updates.
        val capacity = if (detectorFactory != null) maxOf(size, 64000) else size
        val audio = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, capacity)
        try {
            check(audio.state == AudioRecord.STATE_INITIALIZED) { "Microphone unavailable" }
            audio.startRecording()
            check(audio.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Microphone could not start" }
        } catch (error: Exception) { audio.release(); throw error }
        val capture = Capture(audio, maxSeconds)
        current = capture
        capture.job = scope.launch(Dispatchers.IO) {
            var detector: PcmSpeechDetector? = null
            try {
                detector = runCatching { detectorFactory?.invoke() }.getOrNull()
                var frames = detector?.let { PcmSpeechFrames(it) }
                if (detectorFactory != null && frames == null) withContext(Dispatchers.Main) {
                    if (current === capture && capture.recording.get()) onDetectorUnavailable()
                }
                val buffer = ByteArray(size)
                while (capture.recording.get() && isActive) {
                    val n = audio.read(buffer, 0, buffer.size)
                    if (!capture.recording.get()) break
                    check(n >= 0) { "Microphone stopped. Try again." }
                    if (n == 0) { delay(10); continue }
                    val level = capture.pcm.append(buffer, n)
                    val bytes = buffer.copyOf(n)
                    onAudio(bytes)
                    val speech = try { frames?.append(bytes).orEmpty() } catch (_: Exception) {
                        frames = null
                        withContext(Dispatchers.Main) { if (current === capture && capture.recording.get()) onDetectorUnavailable() }
                        emptyList()
                    }
                    withContext(Dispatchers.Main) {
                        if (current === capture && capture.recording.get()) onLevel(level, capture.pcm.seconds)
                        for ((voiced, seconds) in speech) {
                            if (current === capture && capture.recording.get()) onSpeech(voiced, seconds)
                        }
                    }
                    if (capture.pcm.full) {
                        withContext(Dispatchers.Main) { if (current === capture) onLimit() }
                        break
                    }
                }
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                withContext(Dispatchers.Main) { if (current === capture && capture.recording.get()) onError(error.message ?: "Microphone unavailable") }
            } finally {
                runCatching { detector?.close() }
                capture.release()
            }
        }
        // Also covers cancellation before the IO coroutine first executes.
        capture.job?.invokeOnCompletion { capture.release() }
    }

    override suspend fun stop(): ByteArray {
        val capture = current ?: error("Recording was cancelled")
        current = null
        capture.recording.set(false)
        runCatching { capture.audio.stop() }
        capture.job?.join()
        return capture.pcm.wav()
    }

    override fun cancel() {
        val capture = current ?: return
        current = null
        capture.recording.set(false)
        runCatching { capture.audio.stop() }
        capture.job?.cancel()
    }
}
