package dev.ally.phone

import org.junit.Assert.*
import org.junit.Test

class ControlTreeTest {
    private fun node(text: String = "", password: Boolean = false, children: List<ControlNode> = emptyList()) =
        ControlNode("com.example", "android.widget.TextView", text, "desc", "com.example:id/title", 0, 10, 1080, 200, password = password, children = children)

    @Test fun writesUiautomatorHierarchyWithBounds() {
        val xml = ControlTree.xml(listOf(node("Hello", children = listOf(node("Child")))))
        assertTrue(xml.contains("<hierarchy"))
        assertTrue(xml.endsWith("</hierarchy>"))
        assertTrue(xml.contains("bounds=\"[0,10][1080,200]\""))
        assertTrue(xml.contains("package=\"com.example\""))
        assertTrue(xml.contains("text=\"Child\""))
    }

    @Test fun escapesMarkupSoNodesCannotBeForged() {
        val xml = ControlTree.xml(listOf(node("a\" package=\"com.android.settings\"<node>&")))
        assertFalse(xml.contains("package=\"com.android.settings\""))
        assertTrue(xml.contains("&quot; package=&quot;com.android.settings&quot;&lt;node&gt;&amp;"))
    }

    @Test fun redactsPasswordFieldsButKeepsTheFlag() {
        val xml = ControlTree.xml(listOf(node("hunter2", password = true)))
        assertFalse(xml.contains("hunter2"))
        assertTrue(xml.contains("password=\"true\""))
    }

    @Test fun capsNodeCount() {
        val wide = node(children = List(ControlTree.MAX_NODES + 100) { node("x") })
        assertTrue(Regex("<node").findAll(ControlTree.xml(listOf(wide))).count() <= ControlTree.MAX_NODES)
    }

    @Test fun grantsAreBoundedAndExpire() {
        val now = 1_000_000L
        assertNotNull(ControlGrant.parse("grant-abcdef12", "codex:01a172af-1918", "Chat", now + 15 * 60_000, now))
        assertNull(ControlGrant.parse("grant-abcdef12", "codex:01a172af-1918", "Chat", now + 61 * 60_000, now))
        assertNull(ControlGrant.parse("grant-abcdef12", "codex:01a172af-1918", "Chat", now - 1, now))
        assertNull(ControlGrant.parse("bad id!", "codex:01a172af-1918", "Chat", now + 60_000, now))
        assertNull(ControlGrant.parse("grant-abcdef12", "evil:chat", "Chat", now + 60_000, now))
        val grant = ControlGrant.parse("grant-abcdef12", "claude:974e908e-5a59", "", now + 60_000, now)!!
        assertEquals("Ally chat", grant.title)
        assertTrue(grant.active(now + 59_000)); assertFalse(grant.active(now + 60_000))
    }
}
