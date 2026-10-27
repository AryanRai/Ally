package dev.ally.device

import org.json.JSONObject

data class LiveProgress(val id: String, val text: String, val complete: Boolean, val kind: String)
object LiveProgressParser {
    fun read(json: JSONObject): List<LiveProgress> {
        val rows = json.optJSONArray("progress") ?: return emptyList()
        return (0 until rows.length()).take(24).mapNotNull { index ->
            val row = rows.optJSONObject(index) ?: return@mapNotNull null
            val id = row.optString("id").take(120); val text = row.optString("text").take(3200)
            val kind = row.optString("kind")
            if (id.isBlank() || text.isBlank() || kind !in setOf("commentary", "study")) null
            else LiveProgress(id, text, row.optBoolean("complete"), kind)
        }
    }
}
/** Only newly completed public updates are read; polling, reconnect and final answer cannot replay them. */
class ProgressReadCursor {
    private val seen = linkedMapOf<String, MutableSet<String>>()
    private val spokenStudy = mutableMapOf<String, MutableList<String>>()
    private val stopped = mutableSetOf<String>()
    fun stop(turn: String) { if (turn.isNotBlank()) stopped.add(turn) }
    fun canRead(turn: String) = turn !in stopped
    fun observed(turn: String) = seen.containsKey(turn)
    fun claimFinal(turn: String): Boolean = seen[turn]?.add("__final") == true
    fun updates(turn: String, rows: List<LiveProgress>, enabled: Boolean): List<String> {
        if (turn.isBlank()) return emptyList()
        val ids = seen.getOrPut(turn) { linkedSetOf() }
        while (seen.size > 16) { val old = seen.keys.first(); seen.remove(old); spokenStudy.remove(old); stopped.remove(old) }
        return rows.filter { it.complete && ids.add(it.id) }.filter { enabled && canRead(turn) }.map { row ->
            if (row.kind == "study") spokenStudy.getOrPut(turn) { mutableListOf() }.add(row.text)
            row.text
        }
    }
    fun finalText(turn: String, text: String): String {
        var rest = text.trim()
        for (part in spokenStudy[turn].orEmpty()) {
            if (!rest.startsWith(part.trim())) break
            rest = rest.removePrefix(part.trim()).trimStart()
        }
        return rest
    }
}
