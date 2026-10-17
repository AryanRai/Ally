package dev.ally.watch

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.*
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** 16 kHz mono PCM, capped at 60 seconds. Audio remains in RAM until upload. */
class VoiceRecorder {
    private var recorder: AudioRecord? = null
    private var job: Job? = null
    private var bytes = ByteArrayOutputStream()
    @Volatile private var recording = false
    @SuppressLint("MissingPermission")
    fun start(scope: CoroutineScope, onLimit: () -> Unit, onError: (String) -> Unit) {
        check(recorder == null)
        val size = maxOf(4096, AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT))
        val audio = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size)
        if (audio.state != AudioRecord.STATE_INITIALIZED) { audio.release(); error("Microphone unavailable") }
        recorder = audio
        val capture = ByteArrayOutputStream()
        bytes = capture
        audio.startRecording()
        recording = true
        job = scope.launch(Dispatchers.IO) {
            val buffer = ByteArray(size)
            while (recording && isActive) {
                val n = audio.read(buffer, 0, buffer.size)
                if (n < 0 && recording) { withContext(Dispatchers.Main) { onError("Microphone stopped. Try again.") }; break }
                if (n > 0) capture.write(buffer, 0, n)
                if (capture.size() >= 16000 * 2 * 60) { withContext(Dispatchers.Main) { onLimit() }; break }
            }
        }
    }
    suspend fun stop(): ByteArray {
        recording = false
        runCatching { recorder?.stop() }
        job?.join()
        recorder?.release(); recorder = null; job = null
        val pcm = bytes.toByteArray(); bytes.reset()
        require(pcm.size >= 6400) { "Hold a little longer to speak" }
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray()).putInt(pcm.size + 36).put("WAVEfmt ".toByteArray())
        header.putInt(16).putShort(1).putShort(1).putInt(16000).putInt(32000).putShort(2).putShort(16)
        header.put("data".toByteArray()).putInt(pcm.size)
        return header.array() + pcm
    }
    fun cancel() {
        recording = false
        runCatching { recorder?.stop() }
        job?.cancel(); job = null
        recorder?.release(); recorder = null
        bytes = ByteArrayOutputStream()
    }
}
