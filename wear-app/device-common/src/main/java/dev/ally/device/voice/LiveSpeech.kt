package dev.ally.device.voice

import kotlinx.coroutines.*
import okhttp3.*
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.net.URI
import java.util.concurrent.TimeUnit

object SpeechTransport {
    val client = OkHttpClient.Builder().connectTimeout(5, TimeUnit.SECONDS).readTimeout(90, TimeUnit.SECONDS)
        .followRedirects(false).followSslRedirects(false).build()
    fun request(endpoint: String, token: String): Request {
        val uri = URI(endpoint)
        require(uri.scheme == "https" || (uri.scheme == "http" && uri.host in setOf("127.0.0.1", "localhost"))) { "Speech requires HTTPS" }
        return Request.Builder().url(endpoint.trimEnd('/') + "/v1/speech/live").header("Authorization", "Bearer $token").build()
    }
}

interface SpeechSession {
    fun write(bytes: ByteArray)
    suspend fun finish(): String?
    fun cancel()
}

/** Recording is kept locally until a complete transcript arrives, for network fallback. */
class LiveSpeech(endpoint: String, token: String, private val preview: (String) -> Unit) : SpeechSession {
    private val result = CompletableDeferred<String?>()
    private val socket = SpeechTransport.client.newWebSocket(SpeechTransport.request(endpoint, token), object : WebSocketListener() {
        override fun onMessage(webSocket: WebSocket, text: String) {
            runCatching {
                val event = JSONObject(text)
                when (event.optString("type")) {
                    "transcript" -> preview(event.optString("text"))
                    "complete" -> result.complete(event.optString("text").takeIf { it.isNotBlank() })
                    "error" -> result.complete(null)
                }
            }.onFailure { result.complete(null) }
        }
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { result.complete(null) }
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { result.complete(null); webSocket.close(code, null) }
    })
    init { socket.send("{\"type\":\"listen\"}") }
    override fun write(bytes: ByteArray) {
        if (!result.isCompleted && (socket.queueSize() > 256_000 || !socket.send(bytes.toByteString()))) { result.complete(null); socket.cancel() }
    }
    override suspend fun finish(): String? {
        socket.send("{\"type\":\"end\"}")
        return try { withTimeoutOrNull(12000) { result.await() } } finally { socket.cancel() }
    }
    override fun cancel() { result.complete(null); socket.cancel() }
}
