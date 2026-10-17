package dev.ally.phone

import dev.ally.device.voice.SpeechSession
import dev.ally.device.voice.VoiceCapture
import dev.ally.device.voice.LiveSpeech
import dev.ally.device.voice.PcmRecording
import dev.ally.device.voice.VoiceRecorder
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel

/** One foreground gesture, split at 45 seconds without sending partial messages. */
internal class PhoneVoice(
    private val scope: CoroutineScope,
    private val endpoint: String,
    private val token: String,
    private val transcribe: suspend (ByteArray) -> String,
    private val preview: (String) -> Unit,
    private val recorder: VoiceCapture = VoiceRecorder(300),
    private val speechFactory: (String, String, (String) -> Unit) -> SpeechSession = { url, secret, callback -> LiveSpeech(url, secret, callback) },
) {
    private val frames = Channel<ByteArray>(128)
    private val segments = mutableListOf<Deferred<String>>()
    private val streams = mutableListOf<SpeechSession>()
    private val words = sortedMapOf<Int, String>()
    private var consumer: Job? = null
    private var cancelled = false

    fun start(onLimit: () -> Unit, onError: (String) -> Unit, onLevel: (Float, Float) -> Unit) {
        consumer = scope.launch {
            var pcm = PcmRecording()
            var index = 0
            // Capture a stable segment index in each callback.
            fun nextStream(i: Int) = speechFactory(endpoint, token) { text -> scope.launch {
                if (!cancelled) { words[i] = text; preview(words.values.joinToString(" ")) }
            } }.also { streams.add(it) }
            var live = try { nextStream(index) } catch (e: Exception) { onError(e.message ?: "Voice connection unavailable"); return@launch }
            fun finishSegment(audio: PcmRecording, speech: SpeechSession, i: Int) {
                segments.add(scope.async {
                    val text = speech.finish() ?: transcribe(audio.wav())
                    if (!cancelled) { words[i] = text; preview(words.values.joinToString(" ")) }
                    text
                })
            }
            try {
                for (bytes in frames) {
                    val level = pcm.append(bytes, bytes.size)
                    // WebSocket payloads stay below the bridge's 24 KB limit.
                    for (offset in bytes.indices step 16000) live.write(bytes.copyOfRange(offset, minOf(offset + 16000, bytes.size)))
                    if ((pcm.seconds >= 45f && level < .08f) || pcm.seconds >= 55f) {
                        finishSegment(pcm, live, index++)
                        pcm = PcmRecording(); live = nextStream(index)
                    }
                }
                if (pcm.seconds >= .2f) finishSegment(pcm, live, index) else live.cancel()
            } catch (e: CancellationException) { throw e } catch (e: Exception) { onError(e.message ?: "Voice capture failed") }
            finally { if (cancelled) live.cancel() }
        }
        if (cancelled) return
        recorder.start(scope, onLimit, onError, onLevel) { bytes ->
            if (!frames.trySend(bytes).isSuccess && !cancelled) scope.launch { if (!cancelled) onError("Voice capture fell behind. Please try again.") }
        }
    }

    suspend fun finish(): String {
        recorder.stop()
        frames.close(); consumer?.join()
        return try {
            val text = segments.awaitAll().joinToString(" ").trim()
            check(text.isNotBlank()) { "No speech heard. Hold the orb and try again." }
            check(text.length <= 12000) { "This transcript is too long. Review and shorten the captured words." }
            text
        } finally { streams.forEach { it.cancel() } }
    }
    fun cancel() {
        cancelled = true; recorder.cancel(); frames.cancel(); consumer?.cancel()
        segments.forEach { it.cancel() }; streams.forEach { it.cancel() }
    }
}
