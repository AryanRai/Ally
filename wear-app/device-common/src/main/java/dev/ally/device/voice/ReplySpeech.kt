package dev.ally.device.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import kotlinx.coroutines.*
import okhttp3.*
import okio.ByteString
import org.json.JSONObject
import java.util.Locale

/** A started read survives ambient mode. Recording, chat selection or Stop cancels it. */
class ReplySpeech(context: Context, private val scope: CoroutineScope, private val state: (Boolean, String) -> Unit, private val acquire: () -> String? = { null }, private val release: (String?) -> Unit = {}, private val renew: (String?) -> Unit = {}, private val level: (Float) -> Unit = {}) {
    private val app = context.applicationContext
    private var playback: String? = null
    private val lifetime = SpeechLifetime({ playback = acquire() }, { release(playback); playback = null })
    private var task: Job? = null
    private var socket: WebSocket? = null
    private var track: AudioTrack? = null
    private val ready = CompletableDeferred<Boolean>()
    private val tts = TextToSpeech(context.applicationContext) { status -> ready.complete(status == TextToSpeech.SUCCESS) }
    private var generation = 0
    private val queue = SerialNarration(scope)
    fun stop() { queue.stop(); stopAudio() }
    private fun stopAudio() { generation++; task?.cancel(); task = null; socket?.cancel(); socket = null; runCatching { track?.pause(); track?.flush() }; tts.stop(); lifetime.stop(); level(0f); state(false, "") }
    fun speak(text: String, endpoint: String, token: String, cloud: Boolean) {
        stop(); play(text, endpoint, token, cloud)
    }
    fun enqueue(text: String, endpoint: String, token: String, cloud: Boolean) {
        if (text.isBlank()) return
        queue.enqueue {
            play(text, endpoint, token, cloud)
            task?.join()
        }
    }
    private fun play(text: String, endpoint: String, token: String, cloud: Boolean) {
        stopAudio(); val current = generation
        if (text.isBlank()) return
        val lease = try { lifetime.begin() } catch (_: Exception) { state(false, "Could not start reply audio. Open Ally and try again."); return }
        state(true, "")
        task = scope.launch {
            try {
                // Bounded segments keep Google requests below its UTF-8 byte limit.
                val sections = text.chunked(600)
                for (section in sections) {
                    // Long replies renew the watchdog only as each bounded
                    // section starts; the entire answer has no ten-minute cut-off.
                    renew(playback)
                    if (cloud) {
                        try { cloud(section, endpoint, token); continue }
                        catch (e: CancellationException) { throw e }
                        catch (e: SpeechInterrupted) { throw e }
                        catch (_: Exception) { if (current == generation) state(true, "Cloud voice unavailable · device voice") }
                    }
                    check(withTimeoutOrNull(5000) { ready.await() } == true) { "Install a speech voice in device settings" }
                    tts.language = Locale.forLanguageTag("en-AU")
                    val done = CompletableDeferred<Unit>()
                    val utterance = "$current-${System.nanoTime()}"
                    tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                        override fun onStart(id: String?) {}
                        override fun onDone(id: String?) { if (id == utterance) done.complete(Unit) }
                        @Deprecated("Android API") override fun onError(id: String?) { if (id == utterance) done.completeExceptionally(IllegalStateException("Speech unavailable")) }
                    })
                    check(tts.speak(section, TextToSpeech.QUEUE_FLUSH, null, utterance) == TextToSpeech.SUCCESS) { "Speech unavailable" }
                    withTimeout(90000) { done.await() }
                }
                if (current == generation) state(false, "")
            } catch (e: TimeoutCancellationException) { if (current == generation) state(false, "Speech reached its time limit. Tap Read reply to continue.") }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { if (current == generation) state(false, e.message ?: "Speech unavailable") }
            finally {
                lifetime.finish(lease)
                if (current == generation) {
                    socket?.cancel(); socket = null
                    runCatching { track?.pause(); track?.flush() }
                    tts.stop()
                }
            }
        }
    }
    private suspend fun cloud(text: String, endpoint: String, token: String) = withContext(Dispatchers.IO) {
        val current = generation
        val envelopes = java.util.concurrent.ConcurrentLinkedQueue<Pair<Long, Float>>()
        val chunks = ReplyAudioBuffer()
        var received = false
        val localTrack = AudioTrack.Builder().setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder().setSampleRate(24000).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(maxOf(24000, AudioTrack.getMinBufferSize(24000, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)))
            .setTransferMode(AudioTrack.MODE_STREAM).build()
        track = localTrack
        val ws = SpeechTransport.client.newWebSocket(SpeechTransport.request(endpoint, token), object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, bytes: ByteString) { if (!chunks.offer(bytes.toByteArray())) webSocket.cancel() }
            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching { when (JSONObject(text).optString("type")) {
                    "complete" -> chunks.completed()
                    "error" -> chunks.fail(IllegalStateException("Cloud voice unavailable"))
                } }.onFailure { chunks.fail(it) }
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { chunks.fail(t) }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { chunks.disconnected(); webSocket.close(code, null) }
        })
        socket = ws
        ws.send(JSONObject().put("type", "speak").put("text", text).toString())
        var samples = 0L
        val meter = launch {
            var loudness = 0f
            while (isActive) {
                val head = localTrack.playbackHeadPosition.toLong() and 0xffffffffL
                while (envelopes.peek()?.first?.let { it <= head } == true) loudness = envelopes.poll()?.second ?: 0f
                withContext(Dispatchers.Main) { if(current == generation) level(loudness) }
                delay(32)
            }
        }
        try {
            localTrack.play()
            withTimeout(90000) {
                while (true) {
                    val chunk = chunks.next() ?: break
                    ensureActive(); received = true
                    var offset = 0
                    while (offset < chunk.size) {
                        ensureActive()
                        val written = localTrack.write(chunk, offset, minOf(960, chunk.size - offset), AudioTrack.WRITE_NON_BLOCKING)
                        check(written >= 0)
                        if (written == 0) delay(10)
                        else envelopes.offer(samples to PlaybackLevel.pcm16(chunk, offset, offset + written))
                        offset += written; samples += written / 2
                    }
                }
                check(received) { "No cloud audio" }
                while ((localTrack.playbackHeadPosition.toLong() and 0xffffffffL) < samples) { ensureActive(); delay(20) }
            }
        } catch (e: Exception) {
            // Do not replay a partially spoken segment through the local voice.
            if (e is CancellationException || !received) throw e
            throw SpeechInterrupted()
        } finally { withContext(NonCancellable) { meter.cancelAndJoin(); withContext(Dispatchers.Main) { if(current == generation) level(0f) }; ws.cancel(); chunks.cancel(); runCatching { localTrack.stop() }; localTrack.release(); if (track === localTrack) track = null } }
    }
    fun close() { stop(); tts.shutdown() }
    private class SpeechInterrupted : IllegalStateException("Speech interrupted. Tap Read reply to retry.")
}


