package dev.ally.watch

import dev.ally.device.AssistantAgent

enum class AmbientMood { IDLE, WORKING, ATTENTION, OFFLINE }

data class AmbientAgent(val key: String, val title: String, val status: String, val attention: Boolean)

/** What the always-on screen shows. Every line comes from observed activity; only the verb is decorative. */
data class AmbientPresence(val mood: AmbientMood, val agents: List<AmbientAgent>, val headline: String, val note: String)

/** Builds the ambient summary from the live `agent_activity` rows plus this watch's own turn. */
object AmbientPresenceModel {
    // In the spirit of Claude Code's spinner. Shown only while real work is observed.
    val verbs = listOf("Pondering", "Brewing", "Tinkering", "Noodling", "Percolating", "Mulling", "Conjuring",
        "Whirring", "Simmering", "Untangling", "Scheming", "Musing", "Crunching", "Spelunking", "Marinating", "Cogitating")
    private val generic = setOf("", "working…", "working...", "working", "thinking…", "thinking...", "thinking", "connecting to ally…")

    fun verb(tick: Long): String = verbs[Math.floorMod(tick, verbs.size.toLong()).toInt()] + "…"

    /** Burn-in protection: a slow walk of a few pixels per ambient update, never further than [range]. */
    fun shift(tick: Long, range: Int = 6): Pair<Int, Int> {
        val path = listOf(0 to 0, 1 to 0, 1 to 1, 0 to 1, -1 to 1, -1 to 0, -1 to -1, 0 to -1, 1 to -1)
        val (x, y) = path[Math.floorMod(tick, path.size.toLong()).toInt()]
        val step = range / 2
        return x * step to y * step
    }

    fun build(rows: List<AssistantAgent>, stale: Boolean, own: WatchState): AmbientPresence {
        val ownActive = own.turnId != null && own.phase in setOf(Phase.THINKING, Phase.UPLOADING)
        val ownKey = own.chatSessionKey.ifBlank { own.chatId.orEmpty() }
        val ownStep = own.steps.lastOrNull { it.status == "running" }?.name.orEmpty()
        val ownStatus = ownStep.ifBlank { own.detail.takeUnless { informative(it).isEmpty() }.orEmpty() }
        val observed = rows.filter { it.active }.map {
            val mine = ownActive && (it.key == ownKey || it.id == own.chatId)
            AmbientAgent(it.key, it.title, if(mine && ownStatus.isNotBlank()) ownStatus else status(it), it.status == "needs_input")
        }
        val agents = (if(ownActive && observed.none { it.key == ownKey || it.key == own.chatId })
            listOf(AmbientAgent(ownKey, own.chatTitle, ownStatus.ifBlank { "Working" }, false)) + observed else observed)
            .sortedByDescending { it.attention }
        val waiting = agents.count { it.attention }
        val mood = when {
            waiting > 0 || own.approval != null -> AmbientMood.ATTENTION
            agents.isNotEmpty() -> AmbientMood.WORKING
            stale || own.phase == Phase.OFFLINE -> AmbientMood.OFFLINE
            else -> AmbientMood.IDLE
        }
        val count = agents.size.let { if(it == 1) "1 agent" else "$it agents" }
        val headline = when(mood) {
            AmbientMood.ATTENTION -> (waiting + if(own.approval != null) 1 else 0).let { if(it > 1) "$it need you" else "Needs you" }
            AmbientMood.WORKING -> "$count running"
            AmbientMood.OFFLINE -> "Reconnecting"
            AmbientMood.IDLE -> "All quiet"
        }
        val note = if(stale && agents.isNotEmpty()) "Status may be out of date" else ""
        return AmbientPresence(mood, agents.take(3), headline, note)
    }

    private fun status(agent: AssistantAgent): String = when {
        agent.status == "needs_input" -> "Needs input"
        informative(agent.detail).isNotEmpty() -> informative(agent.detail)
        else -> lastSentence(agent.text).ifBlank { "Working" }
    }

    private fun informative(detail: String) = detail.trim().takeUnless { it.lowercase() in generic }.orEmpty()

    /** The latest public sentence of an agent's prose, already privacy-filtered on the desktop. */
    internal fun lastSentence(text: String): String {
        val plain = text.replace(Regex("[`*_#>]"), "").replace(Regex("\\s+"), " ").trim()
        if(plain.isEmpty()) return ""
        val sentences = plain.split(Regex("(?<=[.!?…])\\s+")).filter { it.length > 2 }
        val last = sentences.lastOrNull() ?: plain
        return if(last.length <= 48) last else last.take(47).trimEnd() + "…"
    }
}
