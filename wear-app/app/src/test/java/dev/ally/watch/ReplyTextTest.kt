package dev.ally.watch

import org.junit.Assert.*
import org.junit.Test

class ReplyTextTest {
    @Test fun readsResearchCardsInOrderAndKeepsLinkLabels() {
        val reply = WatchReply("Summary", listOf(WatchCard("card", "Research", "Details. [Paper](https://example.org/long-path)."), WatchCard("checklist", "Next", items = listOf("First", "Second"))))
        assertEquals("Summary\n\nResearch\n\nDetails. Paper.\n\nNext\n\nFirst\n\nSecond", reply.readAloudText())
    }
    @Test fun supportsCardOnlyAnswersAndNeverSpeaksActionInstructionsAsAnExecutedAction() {
        val reply = WatchReply("", listOf(WatchCard("actions", "Follow up", actions = listOf(WatchAction("Explain more", "Run an external task")))))
        assertEquals("Follow up\n\nExplain more", reply.readAloudText())
        assertEquals("", WatchReply("", emptyList()).readAloudText())
    }
}
