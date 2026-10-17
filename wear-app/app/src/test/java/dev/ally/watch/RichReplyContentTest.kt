package dev.ally.watch

import org.junit.Assert.*
import org.junit.Test

class RichReplyContentTest {
    @Test fun formatsHeadingsNestedListsQuotesAndEmphasis() {
        val blocks = RichReplyContent.parse("## Findings\n\n**Bold** and *italic* with `code`.\n\n- First\n  - Nested\n\n> A quoted result\n\n1. One\n2. Two")
        assertEquals("heading", blocks.first().kind)
        assertTrue(blocks.flatMap { it.spans }.any { it.text == "Bold" && it.bold })
        assertTrue(blocks.flatMap { it.spans }.any { it.text == "italic" && it.italic })
        assertTrue(blocks.flatMap { it.spans }.any { it.text == "code" && it.code })
        assertTrue(blocks.any { it.level == 2 && it.prefix == "• " })
        assertTrue(blocks.any { it.kind == "quote" })
        assertEquals(listOf("1. ", "2. "), blocks.filter { it.prefix.firstOrNull()?.isDigit() == true }.map { it.prefix })
    }

    @Test fun linksMarkdownReferencesBareUrlsAndImagesWithoutPunctuation() {
        val blocks = RichReplyContent.parse("[Source](https://example.com/p) and [reference][ref]. See https://example.org/a_(b).\n\n![Map](https://example.com/map.png)\n\n[ref]: https://example.net")
        val links = blocks.flatMap { it.spans }.filter { it.url != null }
        assertEquals(listOf("https://example.com/p", "https://example.net", "https://example.org/a_(b)", "https://example.com/map.png"), links.map { it.url })
        assertEquals("Map", links.last().text)
        assertTrue(blocks.flatMap { it.spans }.joinToString("") { it.text }.contains("a_(b)."))
    }

    @Test fun neverTurnsCodeOrNonWebSchemesIntoActions() {
        val blocks = RichReplyContent.parse("[bad](javascript:alert) [file](file:///C:/secret) [intent](intent://app)\n\n```kotlin\nval url = \"https://example.com\"\n```\n\n`https://example.net`")
        assertTrue(blocks.flatMap { it.spans }.none { it.url != null })
        assertEquals("kotlin", blocks.first { it.kind == "code" }.language)
        assertTrue(blocks.first { it.kind == "code" }.spans.single().text.contains("val url"))
        assertNull(RichReplyContent.webUrl("https://user:password@example.com"))
        assertNull(RichReplyContent.webUrl("https://"))
        assertNull(RichReplyContent.webUrl("file:///tmp/file"))
    }

    @Test fun tablesKeepEveryValueAndLinkInReadableLabeledRows() {
        val blocks = RichReplyContent.parse("| Product | Price |\n| --- | --- |\n| [One](https://example.com/one) | $10 |\n| Two | $20 |")
        assertEquals(2, blocks.size)
        assertEquals("Product: One\nPrice: $10", blocks[0].spans.joinToString("") { it.text })
        assertEquals("Product: Two\nPrice: $20", blocks[1].spans.joinToString("") { it.text })
        assertEquals("https://example.com/one", blocks[0].spans.first { it.url != null }.url)
    }

    @Test fun unfinishedStreamingMarkdownStillKeepsVisibleContent() {
        val blocks = RichReplyContent.parse("## Working\n\nFirst **unfinished\n\n```js\nconst value = 42")
        val visible = blocks.flatMap { it.spans }.joinToString("\n") { it.text }
        assertTrue(visible.contains("unfinished"))
        assertTrue(visible.contains("const value = 42"))
    }
}
