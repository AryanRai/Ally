package dev.ally.phone

import dev.ally.device.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ChatActivityTimelineTest {
    @Test fun realQuestionSplitsCommandsAtItsOriginalPosition() {
        val request=JSONObject("""{"id":"q","createdAt":25} """)
        val steps=listOf(ChatStep("ask","question","done","",20,30),ChatStep("later","shell","done","",40,50))
        val timeline=listOf(ChatActivityEntry("u","update","Checking"),ChatActivityEntry("a","tool",stepId="ask"),ChatActivityEntry("after","update","Continuing"),ChatActivityEntry("b","tool",stepId="later"))
        val rows=chatActivityBlocks(steps,emptyList(),timeline,listOf(request))
        assertEquals(listOf("u","a","request:q","after","b"),rows.map { it.id })
        assertEquals("q",rows[2].request?.optString("id"))
    }
    @Test fun updatesSeparateConsecutiveCommandGroups() {
        val steps = listOf("a", "b", "c").map { ChatStep(it, "shell", "done", it) }
        val timeline = listOf(
            ChatActivityEntry("u1", "update", "Checking"),
            ChatActivityEntry("a", "tool", stepId="a"),
            ChatActivityEntry("b", "tool", stepId="b"),
            ChatActivityEntry("u2", "update", "Testing"),
            ChatActivityEntry("c", "tool", stepId="c"))
        val blocks = chatActivityBlocks(steps, listOf("Should not duplicate"), timeline)
        assertEquals(listOf("Checking", "", "Testing", ""), blocks.map { it.update })
        assertEquals(listOf("a", "b"), blocks[1].steps.map { it.id })
        assertEquals(listOf("c"), blocks[3].steps.map { it.id })
    }
    @Test fun unknownRowsAndMissingToolsDoNotCreateBlankGroups() {
        val json = JSONObject("""{"timeline":[{"id":"x","type":"thinking","text":"private"},{"id":"y","type":"tool","stepId":"missing"}],"usage":{"durationMs":3200}}""")
        val timeline = ChatTimelineParser.read(json)
        assertEquals(1, timeline.size)
        assertTrue(chatActivityBlocks(emptyList(), emptyList(), timeline).isEmpty())
        assertEquals(3200L, ChatTimelineParser.duration(json))
    }
    @Test fun legacyPayloadRetainsDetailsWithoutInventingChronology() {
        val step = ChatStep("old", "Read", "error", "Denied")
        val blocks = chatActivityBlocks(listOf(step), listOf("Old update"), emptyList())
        assertEquals("Old update", blocks[0].update)
        assertEquals(step, blocks[1].steps.single())
    }
}
