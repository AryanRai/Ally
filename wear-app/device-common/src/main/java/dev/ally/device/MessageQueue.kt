package dev.ally.device

import org.json.JSONObject
import org.json.JSONArray

data class QueuedMessage(val id: String, val text: String, val state: String, val error: String, val attachments: List<String>) {
    // The routing envelope is useful to the recipient, but hides the actual
    // content in a three-line queue preview. Never change edit/delivery text.
    val previewText: String get() {
        val envelopeEnd = text.indexOf("]\n\n")
        return if (text.startsWith("[Forwarded by Ally at the user's request") && envelopeEnd >= 0 &&
            text.substring(0, envelopeEnd).endsWith("Your reply is relayed back to the user; answer here, and ask them anything you need.")) {
            text.substring(envelopeEnd + 3).ifBlank { text }
        } else text
    }
}
data class MessageQueue(val chatId: String = "", val revision: Long = 0, val items: List<QueuedMessage> = emptyList()) {
    companion object {
        fun parse(response: JSONObject): MessageQueue? {
            val q = response.optJSONObject("queue") ?: return null
            val rows = q.optJSONArray("items") ?: return null
            return MessageQueue(q.optString("chatId"), q.optLong("revision"), (0 until rows.length()).map { index ->
                val item = rows.getJSONObject(index)
                val files = item.optJSONArray("attachments") ?: JSONArray()
                QueuedMessage(item.getString("id"), item.optString("text"), item.optString("state", "queued"), item.optString("error"),
                    (0 until files.length()).map { files.getJSONObject(it).optString("name", "Attachment") })
            })
        }
    }
    fun change(action: String, id: String? = null, text: String? = null, order: List<String>? = null): JSONObject =
        JSONObject().put("action", action).put("revision", revision).apply {
            id?.let { put("id", it) }; text?.let { put("text", it) }; order?.let { put("order", JSONArray(it)) }
        }
}
