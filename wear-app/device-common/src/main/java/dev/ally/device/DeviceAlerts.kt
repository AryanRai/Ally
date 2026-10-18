package dev.ally.device

import org.json.JSONObject

/** Display metadata never creates an approval; only an actual pending request can block. */
object DeviceAlerts {
    private val chatKey = Regex("(codex|claude):[\\w-]{8,100}")
    fun chat(item: JSONObject, knownChats: List<String> = emptyList()): String? {
        item.optString("chatId").takeIf { chatKey.matches(it) }?.let { return it }
        val session = item.optString("sessionId")
        if (chatKey.matches(session)) return session
        val provider = item.optString("provider")
        "$provider:$session".takeIf { chatKey.matches(it) }?.let { return it }
        return knownChats.filter { chatKey.matches(it) && it.substringAfter(':') == session }.distinct().singleOrNull()
    }
    fun kind(item: JSONObject): String = when {
        item.optBoolean("interaction") && item.optString("kind") == "question" -> "Question"
        item.optBoolean("interaction") || item.optBoolean("command") -> "Approval"
        item.optString("kind") == "attention" -> "Needs attention"
        item.optString("kind") == "response" || item.optString("id").startsWith("reply:") -> "Reply"
        else -> "Note"
    }
    fun blocking(item: JSONObject, now: Long = System.currentTimeMillis()): Boolean =
        (item.optBoolean("interaction") && DeviceInteractions.awaiting(item, now)) ||
        ((item.optBoolean("command") || item.optBoolean("authorized")) && item.optLong("expiresAt") > now)
    fun unread(item: JSONObject) = item.optLong("_viewedAt") == 0L
    fun ordered(items: List<JSONObject>, now: Long = System.currentTimeMillis()): List<JSONObject> =
        items.distinctBy { it.optString("id") }.sortedWith(compareByDescending<JSONObject> { blocking(it, now) }
            .thenByDescending { it.optLong("createdAt").takeIf { time -> time > 0 } ?: it.optLong("_receivedAt") })
    fun status(item: JSONObject, now: Long = System.currentTimeMillis()): String = when {
        item.optBoolean("interaction") -> if (DeviceInteractions.awaiting(item,now)) "Waiting for you" else DeviceInteractions.status(item,now)
        item.optBoolean("command") -> if (item.optLong("expiresAt") > now) "Waiting for approval" else "Expired"
        item.optString("kind") == "attention" -> "Open chat to review"
        unread(item) -> "New"
        else -> "Viewed"
    }
}
