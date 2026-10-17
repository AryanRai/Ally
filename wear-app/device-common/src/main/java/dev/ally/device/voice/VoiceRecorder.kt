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
class VoiceRecorder(private val maxSeconds: Int = 60) : VoiceCapture {
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
        val audio = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size)
        try {
            check(audio.state == AudioRecord.STATE_INITIALIZED) { "Microphone unavailable" }
            audio.startRecording()
            check(audio.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Microphone could not start" }
        } catch (error: Exception) { audio.release(); throw error }
        val capture = Capture(audio, maxSeconds)
        current = capture
        capture.job = scope.launch(Dispatchers.IO) {
            try {
                val buffer = ByteArray(size)
                while (capture.recording.get() && isActive) {
                    val n = audio.read(buffer, 0, buffer.size)
                    if (!capture.recording.get()) break
                    check(n >= 0) { "Microphone stopped. Try again." }
                    if (n == 0) { delay(10); continue }
                    val level = capture.pcm.append(buffer, n)
                    onAudio(buffer.copyOf(n))
                    withContext(Dispatchers.Main) {
                        if (current === capture && capture.recording.get()) onLevel(level, capture.pcm.seconds)
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
