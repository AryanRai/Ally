package dev.ally.device

import org.json.JSONObject

/** Receipt from the same response as the rendered history, never from a picker. */
data class ChatReadReceipt(val key: String, val revision: String, val unread: Boolean) {
    fun json() = JSONObject().put("key", key).put("revision", revision)
    companion object {
        fun parse(json: JSONObject?): ChatReadReceipt? {
            if (json == null || json.optString("key").isBlank() || json.optString("revision").isBlank()) return null
            return ChatReadReceipt(json.getString("key"), json.getString("revision"), json.optBoolean("unread"))
        }
        fun states(response: JSONObject): Map<String, Boolean> {
            val rows = response.optJSONArray("states") ?: return emptyMap()
            return (0 until rows.length()).associate { val r = rows.getJSONObject(it); r.getString("key") to r.optBoolean("unread") }
        }
    }
}
