package dev.ally.device

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

const val MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
data class DeviceAttachment(val id: String, val name: String, val mimeType: String, val size: Long, val url: String) {
    fun json() = JSONObject().put("id", id).put("name", name).put("mimeType", mimeType).put("size", size).put("url", url)
}
object AttachmentParser {
    fun one(json: JSONObject): DeviceAttachment? {
        val id = json.optString("id")
        if (!id.matches(Regex("[a-f0-9]{64}")) || json.optString("url") != "/v1/attachments/$id") return null
        val size = json.optLong("size")
        if (size !in 1..MAX_ATTACHMENT_BYTES.toLong()) return null
        return DeviceAttachment(id, json.optString("name", "Attachment").take(150), json.optString("mimeType", "application/octet-stream"), size, json.optString("url"))
    }
    fun list(json: JSONObject): List<DeviceAttachment> {
        val rows = json.optJSONArray("attachments") ?: return emptyList()
        return (0 until minOf(rows.length(), 12)).mapNotNull { rows.optJSONObject(it)?.let(::one) }.distinctBy { it.id }
    }
}

internal fun attachmentPrefs(context: Context) = if (context.packageName == "dev.ally.watch") context.getSharedPreferences("ally-watch", 0) else DeviceLink.prefs(context)
fun attachmentEndpoint(context: Context): String = attachmentPrefs(context).getString("endpoint", "https://ally.prxptn.com")!!.trimEnd('/')
fun attachmentToken(context: Context): String = attachmentPrefs(context).getString("token", "")!!
fun attachmentUrl(context: Context, asset: DeviceAttachment): String {
    require(AttachmentParser.one(asset.json()) != null) { "Invalid attachment" }
    val endpoint = attachmentEndpoint(context)
    val address = URL(endpoint)
    require(address.protocol == "https" || (address.protocol == "http" && address.host in setOf("localhost", "127.0.0.1")))
    return endpoint + asset.url
}

/** Called on IO. The token is sent only to our configured bridge, with no redirects. */
fun downloadAttachment(context: Context, asset: DeviceAttachment): File {
    val remote = attachmentUrl(context, asset)
    val folder = File(context.cacheDir, "attachments/${asset.id}").apply { mkdirs() }
    val safeName = asset.name.substringAfterLast('/').substringAfterLast('\\').replace(Regex("[^\\p{L}\\p{N}._ -]"), "_").take(140).trim('.', ' ').ifBlank { "Attachment" }
    val target = File(folder, safeName)
    if (target.isFile && target.length() == asset.size) return target
    val connection = URL(remote).openConnection() as HttpURLConnection
    try {
        connection.connectTimeout = 8000; connection.readTimeout = 30000; connection.instanceFollowRedirects = false
        connection.setRequestProperty("Authorization", "Bearer ${attachmentToken(context)}")
        check(connection.responseCode == 200) { "Attachment unavailable. Reconnect to Ally and retry." }
        val partial = File(folder, "$safeName.part")
        try {
            connection.inputStream.use { input -> partial.outputStream().use { output ->
                val buffer = ByteArray(32768); var total = 0L
                while (true) { val read = input.read(buffer); if (read < 0) break; total += read; check(total <= MAX_ATTACHMENT_BYTES && total <= asset.size); output.write(buffer, 0, read) }
                check(total == asset.size) { "Download interrupted. Try again." }
            } }
            check(partial.renameTo(target)) { "Could not save attachment" }
        } finally { partial.delete() }
        return target
    } finally { connection.disconnect() }
}
