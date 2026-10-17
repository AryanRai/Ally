package dev.ally.phone

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import dev.ally.device.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.UUID

data class SharedFile(val key: String, val name: String, val mimeType: String, val size: Long, val uploaded: DeviceAttachment? = null)
data class ShareDraft(val text: String = "", val files: List<SharedFile> = emptyList())

/** Durable private copies: temporary share grants may disappear as soon as the sender closes. */
class ShareDraftStore(private val root: File) {
    init { root.mkdirs() }
    private val metadata get() = File(root, "draft.json")
    fun file(item: SharedFile): File { require(item.key.matches(Regex("[a-f0-9-]{36}"))); return File(root, item.key) }
    fun read(): ShareDraft = runCatching {
        val json = JSONObject(metadata.readText()); val rows = json.optJSONArray("files") ?: JSONArray()
        ShareDraft(json.optString("text"), (0 until rows.length()).map { i -> val f = rows.getJSONObject(i)
            SharedFile(f.getString("key"), f.getString("name"), f.getString("mimeType"), f.getLong("size"), f.optJSONObject("uploaded")?.let(AttachmentParser::one))
        }.filter { file(it).isFile })
    }.getOrDefault(ShareDraft())
    fun save(draft: ShareDraft) {
        val rows = JSONArray(); draft.files.forEach { rows.put(JSONObject().put("key", it.key).put("name", it.name).put("mimeType", it.mimeType).put("size", it.size).put("uploaded", it.uploaded?.json())) }
        val temp = File(root, "draft.tmp"); temp.writeText(JSONObject().put("text", draft.text).put("files", rows).toString())
        Files.move(temp.toPath(), metadata.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
    }
    fun remove(draft: ShareDraft, key: String): ShareDraft = draft.copy(files = draft.files.filterNot { it.key == key }).also { save(it); draft.files.find { it.key == key }?.let { item -> file(item).delete() } }
    fun clear(draft: ShareDraft) { save(ShareDraft()); draft.files.forEach { file(it).delete() } }
    fun append(draft: ShareDraft, text: String, sources: List<Triple<String, String, () -> InputStream>>): ShareDraft {
        require(draft.files.size + sources.size <= 6) { "Choose up to six attachments" }
        val combinedText = listOf(draft.text, text).filter { it.isNotBlank() }.joinToString("\n\n")
        require(combinedText.length <= 12000) { "Shared text exceeds 12,000 characters" }
        val copied = mutableListOf<SharedFile>(); var total = draft.files.sumOf { it.size }
        try {
            sources.forEach { (name, mime, open) ->
                val key = UUID.randomUUID().toString(); val target = File(root, key)
                try {
                    var size = 0L
                    open().use { input -> target.outputStream().use { out ->
                        val buffer = ByteArray(32768)
                        while (true) { val count = input.read(buffer); if (count < 0) break; size += count; total += count
                            require(size <= MAX_ATTACHMENT_BYTES && total <= 40L * 1024 * 1024) { "Files: 20 MB each, 40 MB total" }; out.write(buffer, 0, count)
                        }
                    } }
                    require(size > 0) { "Cannot share an empty file" }
                    copied += SharedFile(key, name.substringAfterLast('/').substringAfterLast('\\').take(140).ifBlank { "Attachment" }, mime, size)
                } catch (e: Exception) { target.delete(); throw e }
            }
            return ShareDraft(combinedText, draft.files + copied).also(::save)
        } catch (e: Exception) { copied.forEach { file(it).delete() }; throw e }
    }
}

@Suppress("DEPRECATION")
fun Intent.sharedUris(): List<Uri> = buildList {
    if (action == Intent.ACTION_SEND_MULTIPLE) addAll(getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty())
    else getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let(::add)
    clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let(::add) }
}.distinct()

fun shareSources(context: Context, uris: List<Uri>): List<Triple<String, String, () -> InputStream>> = uris.map { uri ->
    require(uri.scheme == "content") { "Share files through Android's file picker" }
    var name = "Attachment"
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor -> if (cursor.moveToFirst()) name = cursor.getString(0) ?: name }
    Triple(name, context.contentResolver.getType(uri) ?: "application/octet-stream") { context.contentResolver.openInputStream(uri) ?: error("Could not read shared file") }
}
