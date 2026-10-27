package dev.ally.device

import org.commonmark.Extension
import org.commonmark.ext.gfm.tables.*
import org.commonmark.node.*
import org.commonmark.parser.Parser
import java.net.URI

data class ReplySpan(val text: String, val bold: Boolean = false, val italic: Boolean = false, val code: Boolean = false, val url: String? = null)
data class ReplyBlock(val kind: String, val spans: List<ReplySpan>, val level: Int = 0, val prefix: String = "", val language: String = "")

/** Markdown is presentation only; URLs are explicitly limited to web pages. */
object RichReplyContent {
    private val parser = Parser.builder().extensions(listOf<Extension>(TablesExtension.create())).build()
    private val web = Regex("https?://[^\\s<>]+")
    fun webUrl(value: String): String? = try {
        URI(value).takeIf { it.scheme?.lowercase() in setOf("http", "https") && !it.host.isNullOrBlank() && it.userInfo == null }?.toASCIIString()
    } catch (_: Exception) { null }

    private fun children(node: Node): List<Node> = buildList {
        var child = node.firstChild
        while (child != null) { add(child); child = child.next }
    }

    private fun inline(node: Node, style: ReplySpan = ReplySpan("")): List<ReplySpan> = when (node) {
        is Text -> {
            if (style.url != null || style.code) listOf(style.copy(text = node.literal))
            else buildList {
                var cursor = 0
                web.findAll(node.literal).forEach { match ->
                    var url = match.value.trimEnd('.', ',', ';', ':', '!', '?')
                    while (url.endsWith(')') && url.count { it == ')' } > url.count { it == '(' }) url = url.dropLast(1)
                    while (url.endsWith(']') && url.count { it == ']' } > url.count { it == '[' }) url = url.dropLast(1)
                    add(style.copy(text = node.literal.substring(cursor, match.range.first)))
                    add(style.copy(text = url, url = webUrl(url)))
                    cursor = match.range.first + url.length
                }
                add(style.copy(text = node.literal.substring(cursor)))
            }
        }
        is StrongEmphasis -> children(node).flatMap { inline(it, style.copy(bold = true)) }
        is Emphasis -> children(node).flatMap { inline(it, style.copy(italic = true)) }
        is Code -> listOf(style.copy(text = node.literal, code = true))
        is Link -> children(node).flatMap { inline(it, style.copy(url = webUrl(node.destination))) }
        is Image -> listOf(style.copy(text = children(node).flatMap { inline(it) }.joinToString("") { it.text }.ifBlank { "Image" }, url = webUrl(node.destination)))
        is SoftLineBreak, is HardLineBreak -> listOf(style.copy(text = "\n"))
        is HtmlInline -> listOf(style.copy(text = node.literal))
        else -> children(node).flatMap { inline(it, style) }
    }

    fun parse(text: String): List<ReplyBlock> = buildList {
        fun visit(node: Node, depth: Int = 0, prefix: String = "", quoted: Boolean = false) {
            when (node) {
                is Paragraph -> add(ReplyBlock(if (quoted) "quote" else "text", inline(node), depth, prefix))
                is Heading -> add(ReplyBlock("heading", inline(node), node.level, prefix))
                is FencedCodeBlock -> add(ReplyBlock("code", listOf(ReplySpan(node.literal.trimEnd('\n'), code = true)), language = node.info))
                is IndentedCodeBlock -> add(ReplyBlock("code", listOf(ReplySpan(node.literal.trimEnd('\n'), code = true))))
                is BulletList, is OrderedList -> children(node).forEachIndexed { index, item ->
                    val marker = if (node is OrderedList) "${node.markerStartNumber + index}. " else "• "
                    children(item).forEachIndexed { childIndex, child -> visit(child, depth + 1, if (childIndex == 0) marker else "", quoted) }
                }
                is BlockQuote -> children(node).forEach { visit(it, depth, prefix, true) }
                is ThematicBreak -> add(ReplyBlock("divider", emptyList()))
                is HtmlBlock -> add(ReplyBlock("text", listOf(ReplySpan(node.literal))))
                is TableBlock -> {
                    val rows = children(node).flatMap { children(it) }.filterIsInstance<TableRow>()
                    val headings = rows.firstOrNull()?.let { children(it).map { cell -> inline(cell) } } ?: emptyList()
                    rows.drop(1).forEach { row ->
                        add(ReplyBlock("table", children(row).flatMapIndexed { index, cell ->
                            (if (index > 0) listOf(ReplySpan("\n")) else emptyList()) +
                                headings.getOrElse(index) { emptyList() }.map { it.copy(bold = true) } +
                                listOf(ReplySpan(": ")) + inline(cell)
                        }))
                    }
                    if (rows.size == 1) add(ReplyBlock("table", headings.flatten()))
                }
                else -> children(node).forEach { visit(it, depth, prefix, quoted) }
            }
        }
        visit(parser.parse(text))
    }
}
