package dev.ally.device

import org.json.JSONObject

data class ChatStep(val id: String, val name: String, val status: String, val detail: String, val startedAt: Long = 0, val endedAt: Long = 0, val attachments: List<DeviceAttachment> = emptyList()) {
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
            ChatStep(row.optString("id"), row.optString("name").take(100), status, row.optString("detail").take(3202), row.optLong("startedAt"), row.optLong("endedAt"), AttachmentParser.list(row))
        }
    }
}

data class ChatActivityEntry(val id: String, val type: String, val text: String = "", val stepId: String = "", val request: JSONObject? = null)
data class ChatActivityBlock(val id: String, val update: String = "", val steps: List<ChatStep> = emptyList(), val request: JSONObject? = null)

/** Contiguous command runs stay between the public updates that surrounded them. */
fun chatActivityBlocks(steps: List<ChatStep>, commentary: List<String>, timeline: List<ChatActivityEntry>, requests: List<JSONObject> = emptyList()): List<ChatActivityBlock> {
    val blocks = mutableListOf<ChatActivityBlock>()
    val byId = steps.associateBy { it.id }
    val ordered = if (timeline.isNotEmpty()) timeline else commentary.mapIndexed { i, text -> ChatActivityEntry("legacy-update:$i", "update", text) } + steps.map { ChatActivityEntry("tool:${it.id}", "tool", stepId = it.id) }
    val anchored = requests.sortedBy { DeviceInteractions.requestedAt(it) }.groupBy { DeviceInteractions.anchor(it, steps.map { s -> Triple(s.id,s.startedAt,s.endedAt) }) }
    val expanded = ordered.flatMap { entry -> listOf(entry) + (if(entry.type == "tool") anchored[entry.stepId].orEmpty().map { ChatActivityEntry("request:${it.optString("id")}","request",request=it) } else emptyList()) } + anchored[null].orEmpty().map { ChatActivityEntry("request:${it.optString("id")}","request",request=it) }
    for (entry in expanded) {
        if(entry.request != null) { blocks.add(ChatActivityBlock(entry.id,request=entry.request)); continue }
        if (entry.type == "update" && entry.text.isNotBlank()) blocks.add(ChatActivityBlock(entry.id, update = entry.text))
        else if (entry.type == "tool") byId[entry.stepId]?.let { step ->
            val previous = blocks.lastOrNull()
            if (previous != null && previous.steps.isNotEmpty()) blocks[blocks.lastIndex] = previous.copy(steps = previous.steps + step)
            else blocks.add(ChatActivityBlock(entry.id, steps = listOf(step)))
        }
    }
    return blocks
}

object ChatTimelineParser {
    fun read(json: JSONObject): List<ChatActivityEntry> {
        val rows = json.optJSONArray("timeline") ?: return emptyList()
        return (0 until rows.length()).mapNotNull { i ->
            val row = rows.optJSONObject(i) ?: return@mapNotNull null
            val type = row.optString("type")
            if (type !in setOf("update", "tool")) return@mapNotNull null
            ChatActivityEntry(row.optString("id"), type, row.optString("text").take(3200), row.optString("stepId"))
        }
    }
    fun duration(json: JSONObject): Long = json.optLong("durationMs").takeIf { it > 0 } ?: json.optJSONObject("usage")?.optLong("durationMs") ?: 0
}
