package dev.ally.watch

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import okhttp3.*
import okio.ByteString
import org.json.JSONObject
import java.util.Locale

/** Foreground playback only. A new recording, chat selection or Stop cancels all audio. */
internal class ReplySpeaker(context: Context, private val scope: CoroutineScope, private val state: (Boolean, String) -> Unit) {
    private var task: Job? = null
    private var socket: WebSocket? = null
    private var track: AudioTrack? = null
    private val ready = CompletableDeferred<Boolean>()
    private val tts = TextToSpeech(context.applicationContext) { status -> ready.complete(status == TextToSpeech.SUCCESS) }
    private var generation = 0
    fun stop() { generation++; task?.cancel(); task = null; socket?.cancel(); socket = null; runCatching { track?.pause(); track?.flush() }; tts.stop(); state(false, "") }
    fun speak(text: String, endpoint: String, token: String, cloud: Boolean) {
        stop(); val current = generation
        if (text.isBlank()) return
        state(true, "")
        task = scope.launch {
            try {
                // Bounded segments keep Google requests below its UTF-8 byte limit.
                val sections = text.chunked(600)
                for (section in sections) {
                    if (cloud) {
                        try { cloud(section, endpoint, token); continue }
                        catch (e: CancellationException) { throw e }
                        catch (e: SpeechInterrupted) { throw e }
                        catch (_: Exception) { if (current == generation) state(true, "Cloud voice unavailable · watch voice") }
                    }
                    check(withTimeoutOrNull(5000) { ready.await() } == true) { "Install a speech voice in watch settings" }
                    tts.language = Locale.forLanguageTag("en-AU")
                    val done = CompletableDeferred<Unit>()
                    val utterance = "$current-${System.nanoTime()}"
                    tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                        override fun onStart(id: String?) {}
                        override fun onDone(id: String?) { if (id == utterance) done.complete(Unit) }
                        @Deprecated("Android API") override fun onError(id: String?) { if (id == utterance) done.completeExceptionally(IllegalStateException("Watch speech unavailable")) }
                    })
                    check(tts.speak(section, TextToSpeech.QUEUE_FLUSH, null, utterance) == TextToSpeech.SUCCESS) { "Watch speech unavailable" }
                    withTimeout(90000) { done.await() }
                }
                if (current == generation) state(false, "")
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (current == generation) state(false, e.message ?: "Speech unavailable") }
        }
    }
    private suspend fun cloud(text: String, endpoint: String, token: String) = withContext(Dispatchers.IO) {
        val chunks = Channel<ByteArray>(64)
        var received = false
        val localTrack = AudioTrack.Builder().setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder().setSampleRate(24000).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(maxOf(24000, AudioTrack.getMinBufferSize(24000, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)))
            .setTransferMode(AudioTrack.MODE_STREAM).build()
        track = localTrack
        val ws = SpeechTransport.client.newWebSocket(SpeechTransport.request(endpoint, token), object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, bytes: ByteString) { if (!chunks.trySend(bytes.toByteArray()).isSuccess) { chunks.close(IllegalStateException("Audio connection too slow")); webSocket.cancel() } }
            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching { when (JSONObject(text).optString("type")) {
                    "complete" -> chunks.close()
                    "error" -> chunks.close(IllegalStateException("Cloud voice unavailable"))
                } }.onFailure { chunks.close(it) }
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { chunks.close(t) }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { chunks.close(); webSocket.close(code, null) }
        })
        socket = ws
        ws.send(JSONObject().put("type", "speak").put("text", text).toString())
        var samples = 0L
        try {
            localTrack.play()
            withTimeout(90000) {
                for (chunk in chunks) {
                    ensureActive(); received = true
                    var offset = 0
                    while (offset < chunk.size) { ensureActive(); val written = localTrack.write(chunk, offset, chunk.size - offset, AudioTrack.WRITE_NON_BLOCKING); check(written >= 0); if (written == 0) delay(10); offset += written; samples += written / 2 }
                }
                check(received) { "No cloud audio" }
                while ((localTrack.playbackHeadPosition.toLong() and 0xffffffffL) < samples) { ensureActive(); delay(20) }
            }
        } catch (e: Exception) {
            // Do not replay a partially spoken segment through the local voice.
            if (e is CancellationException || !received) throw e
            throw SpeechInterrupted()
        } finally { ws.cancel(); chunks.cancel(); runCatching { localTrack.stop() }; localTrack.release(); if (track === localTrack) track = null }
    }
    fun close() { stop(); tts.shutdown() }
    private class SpeechInterrupted : IllegalStateException("Speech interrupted. Tap Read reply to retry.")
}
