package dev.ally.device

import org.json.JSONObject

data class ChatStep(val id: String, val name: String, val status: String, val detail: String) {
    val label get() = name.substringAfterLast("__").replace('_', ' ')
}

/** Only public tool events and commentary. Reasoning is never included. */
object ChatActivityParser {
    fun steps(json: JSONObject): List<ChatStep> {
        val rows = json.optJSONArray("steps") ?: return emptyList()
        return (0 until rows.length()).mapNotNull { index ->
            val row = rows.optJSONObject(index) ?: return@mapNotNull null
            val status = row.optString("status")
            if (status !in setOf("running", "done", "error", "interrupted")) return@mapNotNull null
            ChatStep(row.optString("id"), row.optString("name").take(100), status, row.optString("detail").take(3202))
        }
    }
}
