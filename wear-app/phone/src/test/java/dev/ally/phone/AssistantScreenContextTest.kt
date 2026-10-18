package dev.ally.phone

import dev.ally.device.AssistantScreenContext
import dev.ally.device.AssistantSubmission
import dev.ally.device.ChatReadReceipt
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AssistantScreenContextTest {
    @Test fun freshInvocationRetainsOneScreenThroughChoiceAndFreezesItAtSend() = runTest {
        val screen = AssistantScreenContext(); val token = screen.begin(true, true, true)
        val image = byteArrayOf(1, 2, 3)
        screen.screenshot(token, image); screen.assist(token, "Synthetic visible text", false)
        assertEquals("Screen attached", screen.notice)
        assertArrayEquals(image, screen.image()) // routing/choice does not consume it
        screen.settle()
        assertFalse(screen.accepts(token))
        val late = byteArrayOf(9); screen.screenshot(token, late); assertEquals(0, late[0].toInt())
        assertArrayEquals(byteArrayOf(1, 2, 3), screen.image())
        screen.clear(); assertEquals(0, image[0].toInt()); assertNull(screen.image()); assertEquals("", screen.text())
    }
    @Test fun newInvocationAndDismissalRejectOldResultsAndDoNotReuseScreen() {
        val screen = AssistantScreenContext(); val old = screen.begin(true, true, false)
        screen.screenshot(old, byteArrayOf(1))
        val current = screen.begin(true, true, false)
        val late = byteArrayOf(8); screen.screenshot(old, late)
        assertEquals(0, late[0].toInt()); assertNull(screen.image())
        screen.clear(); screen.screenshot(current, byteArrayOf(2)); assertNull(screen.image())
    }
    @Test fun ownOverlayDiscardsScreenshotInEitherCallbackOrder() = runTest {
        for (imageFirst in listOf(true, false)) {
            val screen = AssistantScreenContext(); val token = screen.begin(true, true, true)
            val image = byteArrayOf(5)
            if (imageFirst) screen.screenshot(token, image)
            screen.assist(token, "Ally private chat", true)
            if (!imageFirst) screen.screenshot(token, image)
            screen.settle(); assertNull(screen.image()); assertEquals("", screen.text()); assertEquals("Screen unavailable", screen.notice)
            assertEquals(0, image[0].toInt())
        }
    }
    @Test fun deniedOrMissingScreenshotContinuesWithHonestNoticeAndNoImage() = runTest {
        val screen = AssistantScreenContext(); var token = screen.begin(true, true, true)
        screen.screenshot(token, null); screen.assist(token, "OS supplied text", false); screen.settle()
        assertNull(screen.image()); assertEquals("Screen text available", screen.notice)
        screen.begin(true, false, false); screen.settle(); assertEquals("Screen unavailable", screen.notice)
        token = screen.begin(true, true, true); screen.settle() // missing callback times out without a second capture
        assertFalse(screen.accepts(token)); assertNull(screen.image()); assertEquals("Screen unavailable", screen.notice)
    }
    @Test fun monitorWatchOrUnfinishedDraftDoesNotAcceptContext() = runTest {
        val screen = AssistantScreenContext(); val token = screen.begin(false, true, true)
        val image = byteArrayOf(1); screen.screenshot(token, image); screen.assist(token, "private", false); screen.settle()
        assertEquals(0, image[0].toInt()); assertNull(screen.image()); assertEquals("", screen.text()); assertEquals("", screen.notice)
    }
    @Test fun uploadCopySurvivesDismissalButRetainedBitmapBytesAreReleased() {
        val screen = AssistantScreenContext(); val token = screen.begin(true, true, false)
        val image = byteArrayOf(3); screen.screenshot(token, image); val upload = screen.image()
        screen.clear(); assertEquals(0, image[0].toInt()); assertArrayEquals(byteArrayOf(3), upload)
    }
    @Test fun repeatedInvocationSealsCallbacksButRetainsPendingQueryContext() = runTest {
        val screen = AssistantScreenContext(); val token = screen.begin(true, true, false)
        screen.screenshot(token, byteArrayOf(7)); screen.seal()
        assertFalse(screen.accepts(token)); screen.settle()
        assertArrayEquals(byteArrayOf(7), screen.image())
        screen.clear(); assertNull(screen.image())
    }
    @Test fun retryUsesSameQueryRequestChosenChatAndSingleAttachment() {
        val id = "a".repeat(64); val text = AssistantSubmission.text("What does this mean?", "Fixture, not a real screen")
        val first = AssistantSubmission.message("codex", "chosen", "request-1", "readonly", text, id)
        val restored = JSONObject(first.toString())
        val retry = AssistantSubmission.message(restored.getString("provider"), restored.getString("chatId"), restored.getString("requestId"), restored.getString("permission"), restored.getString("text"), restored.getJSONArray("attachments").getString(0))
        assertEquals(first.toString(), retry.toString()); assertEquals(1, retry.getJSONArray("attachments").length())
        assertEquals("chosen", retry.getString("chatId")); assertEquals("request-1", retry.getString("requestId"))
    }
    @Test fun screenNeverSendsWithoutQueryAndContextStaysWithinExistingMessageLimit() {
        assertThrows(IllegalArgumentException::class.java) { AssistantSubmission.text(" ", "screen") }
        assertThrows(IllegalArgumentException::class.java) { AssistantSubmission.message("codex", "chat", "request", "readonly", "", "a".repeat(64)) }
        assertEquals(12000, AssistantSubmission.text("Q".repeat(11900), "x".repeat(6000)).length)
        assertEquals("Q".repeat(12000), AssistantSubmission.text("Q".repeat(12000), "context"))
        assertEquals(0, AssistantSubmission.message("codex", "chat", "request", "readonly", "Question", null).getJSONArray("attachments").length())
    }
    @Test fun explicitHiddenReceiptsClearCachedInternalRowsWithoutHidingSimilarlyNamedUserChat() {
        val response = JSONObject("""{"states":[{"key":"codex:internal","unread":false,"hidden":true},{"key":"codex:user","unread":true}]}""")
        assertEquals(setOf("codex:internal"), ChatReadReceipt.hidden(response))
        assertEquals(mapOf("codex:internal" to false, "codex:user" to true), ChatReadReceipt.states(response))
    }
}
