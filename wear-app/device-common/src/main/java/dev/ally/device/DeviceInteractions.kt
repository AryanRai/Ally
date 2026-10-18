package dev.ally.device

import org.json.JSONObject

/** Pure projection shared by phone/watch; only server-created requests are actionable. */
object DeviceInteractions {
    data class TimelineEntry<T>(val id: String, val message: T? = null, val request: JSONObject? = null)
    /** Keep resolved requests where they were asked, even as later replies arrive. */
    fun <T> timeline(items: List<JSONObject>, messages: List<T>, id: (T) -> String, timestamp: (T) -> Long): List<TimelineEntry<T>> {
        val result = mutableListOf<TimelineEntry<T>>()
        val remaining = items.sortedBy { requestedAt(it) }.toMutableList()
        messages.forEach { message ->
            val time = timestamp(message)
            val preceding = remaining.filter { time > 0 && requestedAt(it) < time }
            preceding.forEach { result += TimelineEntry("device-interaction:${it.optString("id")}", request = it) }
            remaining.removeAll(preceding.toSet())
            result += TimelineEntry(id(message), message = message)
        }
        remaining.forEach { result += TimelineEntry("device-interaction:${it.optString("id")}", request = it) }
        return result
    }
    fun requestedAt(item: JSONObject): Long = item.optLong("createdAt").takeIf { it > 0 }
        ?: item.optLong("_receivedAt").takeIf { it > 0 }
        ?: (item.optLong("expiresAt") - 120000).coerceAtLeast(0)
    fun awaiting(item: JSONObject, now: Long = System.currentTimeMillis()) =
        item.optString("interactionState", "pending") == "pending" && item.optLong("expiresAt") > now
    fun answerSummary(item: JSONObject): String {
        val values = item.optJSONObject("answerValues") ?: JSONObject()
        val fields = item.optJSONArray("fields") ?: return ""
        return (0 until fields.length()).mapNotNull { index ->
            val field = fields.optJSONObject(index) ?: return@mapNotNull null
            val answer = values.optString(field.optString("id")).takeIf { it.isNotBlank() } ?: return@mapNotNull field.optString("label").takeIf { it.isNotBlank() }
            if (field.optBoolean("secret")) return@mapNotNull "${field.optString("label")}: ••••"
            val options = field.optJSONArray("options")
            val label = options?.let { rows -> (0 until rows.length()).mapNotNull { rows.optJSONObject(it) }.firstOrNull { it.optString("value") == answer }?.optString("label") } ?: answer
            "${field.optString("label")}: $label"
        }.joinToString("\n")
    }
    fun forChat(items: List<JSONObject>, vararg keys: String?): List<JSONObject> {
        val ids = keys.filterNotNull().filter { it.isNotBlank() }.toSet()
        return items.filter { it.optBoolean("interaction") && it.optString("chatId") in ids }.reversed()
    }
    fun pending(items: List<JSONObject>, now: Long = System.currentTimeMillis()): List<JSONObject> = items.filter {
        it.optBoolean("interaction") && it.optString("interactionState", "pending") == "pending" && it.optLong("expiresAt") > now
    }
    fun canAnswer(item: JSONObject, connected: Boolean, connection: String?, now: Long = System.currentTimeMillis()) =
        connected && !connection.isNullOrBlank() && item.optString("_connection") == connection && pending(listOf(item), now).isNotEmpty()
    fun status(item: JSONObject, now: Long = System.currentTimeMillis()): String = when {
        item.optString("interactionState") == "answered" -> "Answered on ${item.optString("answeredOn", "another device") }"
        item.optString("interactionState") == "continue" -> "Approved — continue on this device"
        item.optString("interactionState") == "cancelled" -> "Cancelled"
        item.optString("interactionState") == "expired" || item.optLong("expiresAt") <= now -> "Expired — ask Ally for a new request"
        else -> "Your answer needed"
    }
}
