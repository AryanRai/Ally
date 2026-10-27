package dev.ally.phone

import dev.ally.device.MessageQueue
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class MessageQueueTest {
    @Test fun forwardedUpdatesShowTheirDistinctContentsWithoutChangingDelivery() {
        val envelope = "[Forwarded by Ally at the user's request from the chat \"Original\". Your reply is relayed back to the user; answer here, and ask them anything you need.]\n\n"
        val texts = listOf("Implement media continuation", "Keyboard build ready", "Install after validation")
        val items = texts.mapIndexed { i, text -> dev.ally.device.QueuedMessage("$i", envelope + text, "queued", "", emptyList()) }
        assertEquals(texts, items.map { it.previewText })
        assertEquals(texts.map { envelope + it }, items.map { it.text })
    }
    @Test fun ordinaryBracketsAndIncompleteForwardingHeadersRemainUntouched() {
        listOf("[Notes]\n\nKeep these", "[Forwarded by Ally at the user's request]\n\nQuoted text", "Normal message").forEach { text ->
            assertEquals(text, dev.ally.device.QueuedMessage("id", text, "queued", "", emptyList()).previewText)
        }
    }
    @Test fun queueControlsRetainExactRevisionChatAndAttachmentNames() {
        val q=MessageQueue.parse(JSONObject("""{"queue":{"chatId":"codex:original","revision":17,"items":[{"id":"first","text":"Edit me","state":"queued","attachments":[{"name":"sketch.png"}]},{"id":"second","text":"Keep me","state":"sending"}]}}"""))!!
        assertEquals("codex:original",q.chatId)
        assertEquals(listOf("sketch.png"),q.items[0].attachments)
        assertEquals("sending",q.items[1].state)
        val edit=q.change("edit","first","Updated")
        assertEquals(17L,edit.getLong("revision")); assertEquals("first",edit.getString("id"))
        assertEquals("Updated",edit.getString("text"))
        assertEquals("second",q.change("reorder",order=listOf("second","first")).getJSONArray("order").getString(0))
    }
    @Test fun missingQueueIsNotAFalseEmptyAcknowledgement() {
        assertNull(MessageQueue.parse(JSONObject("""{"status":"thinking"}""")))
    }
}
