package dev.ally.device

/** Terminal observations remove progress; disappearance never creates a final reply. */
class LiveAgentState {
    var rows = emptyList<AssistantAgent>(); private set
    private val completed = linkedMapOf<String, Long>()
    fun update(chats: List<AssistantAgent>) { rows=chats.filter { it.active && (completed[it.key]?.let { done -> it.updatedAt>done } ?: true) } }
    fun finish(chat: String, now: Long) {
        completed[chat]=now;while(completed.size>256)completed.remove(completed.keys.first())
        rows=rows.filter { it.key!=chat }
    }
    fun clear() { rows=emptyList() }
}
