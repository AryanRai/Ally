package dev.ally.watch

import org.json.JSONObject

data class ActivityEntry(val id: String, val type: String, val text: String = "", val stepId: String = "", val request: JSONObject? = null)
object ActivityTimeline {
    fun read(json: JSONObject): List<ActivityEntry> {
        val rows = json.optJSONArray("timeline") ?: return emptyList()
        return (maxOf(0, rows.length() - 192) until rows.length()).mapNotNull { i ->
            val row = rows.optJSONObject(i) ?: return@mapNotNull null
            val type = row.optString("type")
            if (type !in setOf("update", "tool")) return@mapNotNull null
            val id = row.optString("id").take(200)
            if (id.isBlank()) return@mapNotNull null
            ActivityEntry(id, type, row.optString("text").take(3200), row.optString("stepId").take(160))
        }.distinctBy { it.id }
    }
    fun duration(json: JSONObject): Long = json.optLong("durationMs", json.optJSONObject("usage")?.optLong("durationMs") ?: 0).coerceAtLeast(0)
    fun rows(timeline: List<ActivityEntry>, commentary: List<String>, steps: List<WatchStep>, requests: List<JSONObject> = emptyList()): List<ActivityEntry> {
        val rows = (timeline.ifEmpty { commentary.mapIndexed { i, text -> ActivityEntry("update:$i", "update", text) } }).toMutableList()
        val seen = rows.filter { it.type == "tool" }.map { it.stepId }.toMutableSet()
        steps.forEach { if (seen.add(it.id)) rows += ActivityEntry("tool:${it.id}", "tool", stepId = it.id) }
        val anchored = requests.sortedBy { dev.ally.device.DeviceInteractions.requestedAt(it) }.groupBy { dev.ally.device.DeviceInteractions.anchor(it,steps.map { s -> Triple(s.id,s.startedAt,s.endedAt) }) }
        return rows.flatMap { row -> listOf(row) + (if(row.type == "tool") anchored[row.stepId].orEmpty().map { ActivityEntry("request:${it.optString("id")}","request",request=it) } else emptyList()) } + anchored[null].orEmpty().map { ActivityEntry("request:${it.optString("id")}","request",request=it) }
    }
    fun groups(rows: List<ActivityEntry>): List<List<ActivityEntry>> {
        val groups = mutableListOf<MutableList<ActivityEntry>>()
        rows.forEach { row ->
            if (row.type == "tool" && groups.lastOrNull()?.firstOrNull()?.type == "tool") groups.last().add(row)
            else groups += mutableListOf(row)
        }
        return groups
    }
    fun time(ms: Long): String = if (ms <= 0) "" else " · " + (if (ms >= 60000) "${ms / 60000}m " else "") + "${ms / 1000 % 60}s"
}
