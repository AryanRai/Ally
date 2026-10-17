package dev.ally.watch

import org.json.JSONObject

enum class Phase { OFFLINE, IDLE, RECORDING, UPLOADING, THINKING, READY, ERROR }
data class WatchCard(
    val type: String, val title: String, val body: String = "",
    val items: List<String> = emptyList(), val seconds: Int = 0,
    val progress: Float = 0f, val actions: List<WatchAction> = emptyList(),
)
data class WatchAction(val label: String, val prompt: String)
data class WatchReply(val text: String, val cards: List<WatchCard>)
data class WatchStep(val id: String, val name: String, val status: String, val detail: String) {
    val label: String get() {
        val tool = name.substringAfterLast("__").replace('_', ' ')
        return when (status) {
            "running" -> "Running $tool"
            "error" -> "Failed · $tool"
            "interrupted" -> "Interrupted · $tool"
            else -> "Ran $tool"
        }
    }
}
data class WatchState(
    val phase: Phase = Phase.OFFLINE,
    val provider: String = "codex",
    val context: String = "Watch · Codex",
    val detail: String = "Connecting to Ally…",
    val transcript: String = "",
    val reply: WatchReply = WatchReply("", emptyList()),
    val steps: List<WatchStep> = emptyList(),
    val usage: String = "",
    val turnId: String? = null,
    val muted: Boolean = false,
    val voiceReady: Boolean = false,
    val voiceState: String = "offline",
    val recordingSeconds: Float = 0f,
    val microphoneLevel: Float = 0f,
    val readySequence: Int = 0,
)

object ActivityParser {
    fun steps(json: JSONObject): List<WatchStep> {
        val array = json.optJSONArray("steps") ?: return emptyList()
        return (maxOf(0, array.length() - 24) until array.length()).mapNotNull { i ->
            val step = array.optJSONObject(i) ?: return@mapNotNull null
            val status = step.optString("status")
            if (status !in setOf("running", "done", "error", "interrupted")) return@mapNotNull null
            WatchStep(step.optString("id").take(160), step.optString("name").take(100), status, step.optString("detail").take(3202))
        }
    }
    fun usage(json: JSONObject): String {
        val usage = json.optJSONObject("usage") ?: return ""
        val parts = mutableListOf<String>()
        for ((key, label) in listOf("inputTokens" to "in", "outputTokens" to "out")) {
            if (usage.has(key) && !usage.isNull(key)) usage.optLong(key, -1).takeIf { it >= 0 }?.let { parts += "$it $label" }
        }
        if (usage.has("durationMs")) usage.optLong("durationMs", -1).takeIf { it >= 0 }?.let { parts += "${it / 1000}s" }
        if (usage.has("costUsd")) usage.optDouble("costUsd", -1.0).takeIf { it.isFinite() && it >= 0 }?.let { parts += "$" + String.format(java.util.Locale.US, "%.3f", it) }
        return parts.joinToString(" · ")
    }
}

/** Explicit allowlist: backend data never becomes executable code or HTML. */
object CardParser {
    fun parse(json: JSONObject): WatchReply {
        val cards = mutableListOf<WatchCard>()
        val array = json.optJSONArray("components")
        for (i in 0 until minOf(array?.length() ?: 0, 6)) {
            val c = array?.optJSONObject(i) ?: continue
            val type = c.optString("type")
            if (type !in setOf("card", "checklist", "timer", "actions", "progress")) continue
            val items = c.optJSONArray("items")
            val actions = c.optJSONArray("actions")
            cards += WatchCard(
                type, c.optString("title").take(80), c.optString("body").take(1200),
                (0 until minOf(items?.length() ?: 0, 8)).map { items!!.optString(it).take(180) },
                c.optInt("seconds").coerceIn(0, 86400),
                c.optDouble("progress", 0.0).takeIf { it.isFinite() }?.toFloat()?.coerceIn(0f, 1f) ?: 0f,
                (0 until minOf(actions?.length() ?: 0, 3)).mapNotNull {
                    val a = actions?.optJSONObject(it) ?: return@mapNotNull null
                    val label = a.optString("label").take(40)
                    val prompt = a.optString("prompt").take(2000)
                    if (label.isBlank() || prompt.isBlank()) null else WatchAction(label, prompt)
                },
            )
        }
        return WatchReply(json.optString("text").take(12000), cards)
    }
}
