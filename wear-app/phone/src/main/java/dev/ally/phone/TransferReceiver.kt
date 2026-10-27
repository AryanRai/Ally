package dev.ally.phone

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Uploads a file from a content URI to the Ally desktop bridge in resumable chunks. */
class TransferReceiver(private val context: Context) {
    companion object {
        private const val CHUNK_SIZE = 512 * 1024
        private const val MAX_FILE_BYTES = 100L * 1024 * 1024
        private const val PREFS = "ally-transfers"
        private val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    private val prefs by lazy { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }

    /**
     * Uploads [uri] to the bridge at [baseUrl] and returns the resulting attachment ID.
     * Resumes automatically if a prior upload was interrupted.
     */
    suspend fun upload(
        uri: Uri,
        baseUrl: String,
        token: String,
        deviceId: String,
        mimeType: String,
        name: String,
    ): String = withContext(Dispatchers.IO) {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: error("Cannot open file: $uri")
        if (bytes.size > MAX_FILE_BYTES) error("File too large (max ${MAX_FILE_BYTES} bytes).")

        val fileSha256 = sha256Hex(bytes)
        val progressKey = "tx:$fileSha256"
        val savedId = prefs.getString("$progressKey:id", null)
        val transferId = savedId ?: UUID.randomUUID().toString()

        val beginBody = JSONObject().apply {
            put("transferId", transferId)
            put("name", name)
            put("mimeType", mimeType)
            put("size", bytes.size)
            put("sha256", fileSha256)
        }.toString()

        val beginResp = client.newCall(
            Request.Builder()
                .url("$baseUrl/v1/transfers")
                .post(beginBody.toRequestBody("application/json".toMediaType()))
                .header("Authorization", "Bearer $token")
                .header("X-Ally-Device-Id", deviceId)
                .build()
        ).execute()
        check(beginResp.isSuccessful) { "Transfer begin failed: ${beginResp.code}" }
        val beginJson = JSONObject(beginResp.body!!.string())
        var acknowledged = beginJson.getInt("acknowledged")

        prefs.edit()
            .putString("$progressKey:id", transferId)
            .putInt("$progressKey:offset", acknowledged)
            .apply()

        var offset = acknowledged
        while (offset < bytes.size) {
            val end = minOf(offset + CHUNK_SIZE, bytes.size)
            val chunk = bytes.copyOfRange(offset, end)
            val chunkSha = sha256Hex(chunk)

            val chunkResp = client.newCall(
                Request.Builder()
                    .url("$baseUrl/v1/transfers/$transferId/chunk")
                    .put(chunk.toRequestBody("application/octet-stream".toMediaType()))
                    .header("Authorization", "Bearer $token")
                    .header("X-Ally-Device-Id", deviceId)
                    .header("X-Ally-Offset", offset.toString())
                    .header("X-Ally-SHA256", chunkSha)
                    .build()
            ).execute()
            check(chunkResp.isSuccessful) { "Chunk upload failed at offset $offset: ${chunkResp.code}" }
            val chunkJson = JSONObject(chunkResp.body!!.string())
            acknowledged = chunkJson.getInt("acknowledged")
            offset = acknowledged

            prefs.edit().putInt("$progressKey:offset", acknowledged).apply()
        }

        val finalResp = client.newCall(
            Request.Builder()
                .url("$baseUrl/v1/transfers/$transferId")
                .post("".toRequestBody())
                .header("Authorization", "Bearer $token")
                .header("X-Ally-Device-Id", deviceId)
                .build()
        ).execute()
        check(finalResp.isSuccessful) { "Transfer finalise failed: ${finalResp.code}" }
        val finalJson = JSONObject(finalResp.body!!.string())

        prefs.edit().remove("$progressKey:id").remove("$progressKey:offset").apply()

        finalJson.getString("attachmentId")
    }

    private fun sha256Hex(data: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(data).joinToString("") { "%02x".format(it) }
}
