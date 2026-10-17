package dev.ally.watch

/** Read the answer's content in order, without speaking long Markdown link targets. */
internal fun WatchReply.readAloudText(): String {
    val parts = mutableListOf(text)
    cards.forEach { card ->
        parts += card.title
        parts += card.body
        when (card.type) {
            "checklist" -> parts += card.items
            "actions" -> parts += card.actions.map { it.label }
            "progress" -> parts += "${(card.progress * 100).toInt()} percent"
            "timer" -> parts += "${card.seconds} seconds"
        }
    }
    return parts.filter { it.isNotBlank() }.joinToString("\n\n")
        .replace(Regex("\\[([^\\]]+)\\]\\(https?://[^\\s)]+\\)"), "$1")
        .replace("**", "").replace("`", "")
}
