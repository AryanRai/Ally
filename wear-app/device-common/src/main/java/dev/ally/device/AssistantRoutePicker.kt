package dev.ally.device

import org.json.JSONObject

/** Power-hold routing only proposes a destination. Selecting never submits; Send does. */
object AssistantRoutePicker {
    const val NEW = "__new"
    const val SEND = "__send"
    const val RERECORD = "__rerecord"
    const val MORE = "__more"
    const val SEARCH = "__search"
    const val PAGE = 5
    /** [chats] is every known destination, ranked: routed matches first, then recent chats. */
    data class Picker(val suggested: String, val chats: List<AssistantChoice>, val fresh: AssistantChoice)

    private fun JSONObject.choice() = AssistantChoice(getString("id"), optString("title").ifBlank { "Untitled chat" }, getString("provider"))
    fun newChat(provider: String) = AssistantChoice(NEW, "New $provider chat", provider)
    private fun usable(chats: List<JSONObject>) = chats.filter { it.optString("id").isNotBlank() && it.optString("provider") in setOf("codex", "claude") && it.optString("title") != "New watch chat" }

    fun options(route: JSONObject, recent: List<JSONObject>, provider: String): Picker {
        val routed = route.optJSONArray("chats")?.let { a -> (0 until a.length()).map { a.getJSONObject(it).choice() } }.orEmpty().take(3)
        val newTopic = route.optString("kind") == "new" || routed.isEmpty()
        val chats = (routed + usable(recent).sortedByDescending { it.optLong("updatedAt") }.map { it.choice() }).distinctBy { it.id }
        return Picker(if (newTopic) NEW else chats.first().id, chats, newChat(provider))
    }
    /** Later pages append below what is already ranked. */
    fun more(picker: Picker, page: List<JSONObject>) =
        picker.copy(chats = (picker.chats + usable(page).sortedByDescending { it.optLong("updatedAt") }.map { it.choice() }).distinctBy { it.id })
    /** Desktop search hits use `provider:sessionId`, the same identity /v1/chats accepts. */
    fun hits(result: JSONObject): List<AssistantChoice> = result.optJSONArray("hits")?.let { a ->
        (0 until a.length()).map { a.getJSONObject(it) }.filter { it.optString("provider") in setOf("codex", "claude") && it.optString("id").isNotBlank() }
            .map { AssistantChoice("${it.getString("provider")}:${it.getString("id")}", it.optString("title").ifBlank { "Untitled chat" }, it.getString("provider")) }
    }.orEmpty()

    /** The compact window shown: [limit] chats with New chat, or matches while searching. */
    fun rows(picker: Picker, limit: Int, query: String = "", hits: List<AssistantChoice> = emptyList()): List<AssistantChoice> {
        val q = query.trim()
        if (q.isNotEmpty()) return (picker.chats.filter { it.title.contains(q, true) } + hits).distinctBy { it.id }.take(maxOf(limit, 8))
        val chats = picker.chats.take(limit)
        return if (picker.suggested == NEW) listOf(picker.fresh) + chats else chats + picker.fresh
    }
}
