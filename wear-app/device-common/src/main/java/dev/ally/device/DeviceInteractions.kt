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
    /** Notification actions remain a subset of the real advertised choices. */
    fun notificationActions(item: JSONObject, now:Long=System.currentTimeMillis()):List<Pair<String,String>> {
        if(!item.optBoolean("interaction") || !awaiting(item,now) || item.optBoolean("desktopOnly") || item.optBoolean("authorized") || item.optString("deviceAction").isNotBlank()) return emptyList()
        val fields=item.optJSONArray("fields")
        val actions=item.optJSONArray("actions") ?: return emptyList()
        if((fields?.length() ?: 0)>0) {
            if(fields!!.length()!=1 || fields.getJSONObject(0).optBoolean("secret") || fields.getJSONObject(0).optBoolean("freeText")) return emptyList()
            val field=fields.getJSONObject(0)
            val options=field.optJSONArray("options") ?: return emptyList()
            if(options.length() !in 1..3 || (0 until actions.length()).none{actions.getJSONObject(it).optString("value")=="submit"}) return emptyList()
            return (0 until options.length()).map{index -> "choice:$index" to options.getJSONObject(index).optString("label").take(40)}
        }
        return (0 until actions.length()).mapNotNull { i ->
            val action=actions.optJSONObject(i) ?: return@mapNotNull null
            val value=action.optString("value")
            if(value !in setOf("accept","submit","decline","cancel")) return@mapNotNull null
            value to action.optString("label",value).take(40)
        }.take(3)
    }
    fun notificationAnswer(item:JSONObject,choice:String,now:Long=System.currentTimeMillis()):Pair<String,Map<String,String>>? {
        if(notificationActions(item,now).none{it.first==choice})return null
        if(!choice.startsWith("choice:"))return choice to emptyMap()
        val field=item.getJSONArray("fields").getJSONObject(0)
        val option=field.getJSONArray("options").getJSONObject(choice.substringAfter(':').toInt())
        return "submit" to mapOf(field.getString("id") to option.getString("value"))
    }
    fun status(item: JSONObject, now: Long = System.currentTimeMillis()): String = when {
        item.optString("interactionState") == "answered" -> "Answered on ${item.optString("answeredOn", "another device") }"
        item.optString("interactionState") == "continue" -> "Approved — continue on this device"
        item.optString("interactionState") == "cancelled" -> "Cancelled"
        item.optString("interactionState") == "expired" || item.optLong("expiresAt") <= now -> "Expired — ask Ally for a new request"
        else -> "Your answer needed"
    }
}
