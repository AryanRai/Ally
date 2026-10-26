package dev.ally.device

import org.json.JSONObject

/** Power-hold routing only proposes a destination. Selecting never submits; Send does. */
object AssistantRoutePicker {
    const val NEW = "__new"
    const val SEND = "__send"
    const val RERECORD = "__rerecord"
    data class Picker(val suggested: String, val choices: List<AssistantChoice>)

    private fun JSONObject.choice() = AssistantChoice(getString("id"), optString("title").ifBlank { "Untitled chat" }, getString("provider"))
    fun newChat(provider: String) = AssistantChoice(NEW, "New $provider chat", provider)

    /** Suggested destination first, then other ranked matches and recent chats, bounded for small screens. */
    fun options(route: JSONObject, recent: List<JSONObject>, provider: String, limit: Int = 5): Picker {
        val routed = route.optJSONArray("chats")?.let { a -> (0 until a.length()).map { a.getJSONObject(it).choice() } }.orEmpty().take(3)
        val newTopic = route.optString("kind") == "new" || routed.isEmpty()
        val latest = recent.filter { it.optString("id").isNotBlank() && it.optString("provider") in setOf("codex", "claude") && it.optString("title") != "New watch chat" }
            .sortedByDescending { it.optLong("updatedAt") }.map { it.choice() }
        val chats = (routed + latest).distinctBy { it.id }.take(limit)
        val fresh = newChat(provider)
        return if (newTopic) Picker(NEW, listOf(fresh) + chats) else Picker(chats.first().id, chats + fresh)
    }
}
