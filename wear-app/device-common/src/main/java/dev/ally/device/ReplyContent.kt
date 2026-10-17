package dev.ally.device

import org.json.JSONObject

data class ReplyCard(
    val type: String, val title: String, val body: String = "",
    val items: List<String> = emptyList(), val seconds: Int = 0,
    val progress: Float = 0f, val actions: List<ReplyAction> = emptyList(),
)
data class ReplyAction(val label: String, val prompt: String)
data class ReplyContent(val text: String, val cards: List<ReplyCard>)
/** Explicit allowlist: backend data never becomes executable code or HTML. */
object ReplyContentParser {
    fun parse(json: JSONObject): ReplyContent {
        val cards = mutableListOf<ReplyCard>()
        val array = json.optJSONArray("components")
        for (i in 0 until minOf(array?.length() ?: 0, 6)) {
            val c = array?.optJSONObject(i) ?: continue
            val type = c.optString("type")
            if (type !in setOf("card", "checklist", "timer", "actions", "progress")) continue
            val items = c.optJSONArray("items")
            val actions = c.optJSONArray("actions")
            cards += ReplyCard(
                type, c.optString("title").take(80), c.optString("body").take(1200),
                (0 until minOf(items?.length() ?: 0, 8)).map { items!!.optString(it).take(180) },
                c.optInt("seconds").coerceIn(0, 86400),
                c.optDouble("progress", 0.0).takeIf { it.isFinite() }?.toFloat()?.coerceIn(0f, 1f) ?: 0f,
                (0 until minOf(actions?.length() ?: 0, 3)).mapNotNull {
                    val a = actions?.optJSONObject(it) ?: return@mapNotNull null
                    val label = a.optString("label").take(40)
                    val prompt = a.optString("prompt").take(2000)
                    if (label.isBlank() || prompt.isBlank()) null else ReplyAction(label, prompt)
                },
            )
        }
        return ReplyContent(json.optString("text").take(12000), cards)
    }
}
