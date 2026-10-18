package dev.ally.phone

import dev.ally.device.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AssistantActivityTest {
    @Test fun keepsExactChatIdsAndBothEngines() {
        val parsed=AssistantActivityParser.parse(JSONObject("""{"chats":[{"id":"device-chat","title":"Ally","provider":"codex","status":"running","detail":"Reading files"},{"id":"claude:original","title":"Portfolio","provider":"claude","status":"completed","unread":true}]}"""))
        assertEquals(listOf("device-chat","claude:original"),parsed.chats.map{it.id})
        assertEquals("1 active · 1 unread",parsed.summary)
        assertTrue(parsed.chats.last().unread)
    }
    @Test fun reconnectNeverClaimsLastSeenStatusIsCurrent() {
        val ready=AssistantActivityParser.parse(JSONObject("""{"chats":[{"id":"x","provider":"codex","status":"running"}]}"""))
        assertEquals("Agents · status unavailable",ready.copy(stale=true).summary)
        assertEquals("Agents · reconnecting",AssistantActivityState(stale=true).summary)
    }
    @Test fun rejectsUnknownStatesInsteadOfInventingCompletions() {
        val parsed=AssistantActivityParser.parse(JSONObject("""{"chats":[{"id":"x","provider":"codex","status":"missing"},{"id":"y","provider":"claude","status":"needs_input"},{"id":"z","provider":"claude","status":"stopped"}]}"""))
        assertEquals(2,parsed.chats.size); assertEquals("1 active · 1 need you",parsed.summary)
        assertEquals("Needs input",parsed.chats.first().label)
    }
}
