package dev.ally.phone

/** One visible accessibility node in screen pixels. Kept free of Android types so it is unit-testable. */
data class ControlNode(
    val packageName: String,
    val className: String,
    val text: String,
    val description: String,
    val resourceId: String,
    val left: Int, val top: Int, val right: Int, val bottom: Int,
    val password: Boolean = false,
    val clickable: Boolean = false,
    val editable: Boolean = false,
    val focused: Boolean = false,
    val scrollable: Boolean = false,
    val children: List<ControlNode> = emptyList(),
)

/**
 * Serialises the tree in uiautomator's `<hierarchy>` format so the desktop applies the same
 * sensitive-screen, protected-control and revision checks it uses for ADB.
 */
object ControlTree {
    const val MAX_NODES = 2500
    private const val MAX_TEXT = 500

    fun xml(roots: List<ControlNode>): String {
        val out = StringBuilder("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\">")
        var count = 0
        fun write(node: ControlNode, depth: Int) {
            if (count >= MAX_NODES || depth > 60) return
            count++
            out.append("<node")
                .attr("text", if (node.password) "" else node.text)
                .attr("resource-id", node.resourceId)
                .attr("class", node.className)
                .attr("package", node.packageName)
                .attr("content-desc", if (node.password) "" else node.description)
                .attr("clickable", node.clickable.toString())
                .attr("editable", node.editable.toString())
                .attr("focused", node.focused.toString())
                .attr("scrollable", node.scrollable.toString())
                .attr("password", node.password.toString())
                .attr("bounds", "[${node.left},${node.top}][${node.right},${node.bottom}]")
            if (node.children.isEmpty()) { out.append("/>"); return }
            out.append(">")
            node.children.forEach { write(it, depth + 1) }
            out.append("</node>")
        }
        roots.forEach { write(it, 0) }
        return out.append("</hierarchy>").toString()
    }

    private fun StringBuilder.attr(name: String, value: String): StringBuilder =
        append(' ').append(name).append("=\"").append(escape(value.take(MAX_TEXT))).append('"')

    fun escape(value: String): String = buildString(value.length) {
        for (c in value) when {
            c == '&' -> append("&amp;")
            c == '<' -> append("&lt;")
            c == '>' -> append("&gt;")
            c == '"' -> append("&quot;")
            c == '\n' -> append("&#10;")
            c.code < 0x20 -> append(' ')
            else -> append(c)
        }
    }
}

/** A user-approved, time-boxed control session for one chat. The phone enforces it independently of the desktop. */
data class ControlGrant(val id: String, val chatId: String, val title: String, val expiresAt: Long) {
    fun active(now: Long) = now < expiresAt

    companion object {
        const val MAX_MINUTES = 60L
        private val idPattern = Regex("^[\\w-]{8,80}$")
        private val chatPattern = Regex("^(codex|claude):[\\w-]{8,100}$")

        /** Rejects malformed or over-long grants instead of clamping them silently. */
        fun parse(id: String, chatId: String, title: String, expiresAt: Long, now: Long): ControlGrant? {
            if (!idPattern.matches(id) || !chatPattern.matches(chatId)) return null
            if (expiresAt <= now || expiresAt - now > MAX_MINUTES * 60_000 + 5_000) return null
            return ControlGrant(id, chatId, title.take(80).ifBlank { "Ally chat" }, expiresAt)
        }
    }
}
