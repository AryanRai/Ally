package dev.ally.watch

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.io.IOException

/** All network work stays off the UI thread. Connection settings are per installation. */
class WatchApi(private val endpoint: () -> String, private val token: () -> String) {
    suspend fun request(path: String, body: ByteArray? = null, contentType: String = "application/json"): JSONObject = withContext(Dispatchers.IO) {
        val url = URL(endpoint().trimEnd('/') + path)
        require(url.protocol == "https" || (url.protocol == "http" && url.host in setOf("127.0.0.1", "localhost"))) {
            "Use HTTPS, or the localhost development bridge"
        }
        val connection = url.openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 5000
            connection.readTimeout = if (path.startsWith("/v1/audio")) 120000 else 15000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Authorization", "Bearer ${token()}")
            if (body != null) {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", contentType)
                connection.setFixedLengthStreamingMode(body.size)
                connection.outputStream.use { it.write(body) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            if (status !in 200..299) {
                val message = runCatching { JSONObject(text).optString("error") }.getOrDefault("Bridge error $status").ifBlank { "Bridge error $status" }
                if (ConnectionRecovery.transientHttpStatus(status)) throw IOException(message)
                throw IllegalStateException(message)
            }
            JSONObject(text)
        } finally { connection.disconnect() }
    }
}
