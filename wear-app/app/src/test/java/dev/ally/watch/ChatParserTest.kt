package dev.ally.watch

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ChatParserTest {
    @Test fun firstLaunchWithoutCachedHistoryDoesNotRestoreAnEmptyObject() {
        assertFalse(ChatParser.matchesSelection(JSONObject(), null))
        assertFalse(ChatParser.matchesSelection(JSONObject(), "selected"))
        assertFalse(ChatParser.matchesSelection(JSONObject("""{"chat":{"id":"other"}}"""), "selected"))
        assertTrue(ChatParser.matchesSelection(JSONObject("""{"chat":{"id":"selected"}}"""), "selected"))
    }
    @Test fun keepsEveryMessageAndItsCardsInOrder() {
        val page = JSONObject("""{"messages":[
          {"id":"history-0","role":"user","text":"First","components":[]},
          {"id":"history-1","role":"assistant","text":"Reply one","components":[{"type":"card","title":"Note","body":"Details"}]},
          {"id":"history-2","role":"user","text":"Second","components":[]},
          {"id":"history-3","role":"assistant","text":"Reply two","components":[]}
        ]}""")
        val messages = ChatParser.messages(page)
        assertEquals(listOf("First", "Reply one", "Second", "Reply two"), messages.map { it.reply.text })
        assertEquals("Note", messages[1].reply.cards.single().title)
        assertEquals(4, messages.map { it.id }.distinct().size)
    }
    @Test fun preservesProviderSessionIdentityAndWorkingFolder() {
        val page = JSONObject("""{"chats":[{"id":"codex:thread-1","provider":"codex","title":"Existing project","cwd":"/project"},{"id":"watch-2","provider":"claude","title":"Watch chat","cwd":"/home"}]}""")
        val chats = ChatParser.chats(page)
        assertEquals("codex:thread-1", chats[0].id)
        assertEquals("/project", chats[0].cwd)
        assertEquals("claude", chats[1].provider)
    }
}
