package dev.ally.phone

import dev.ally.device.ResumeChatRequest
import org.junit.Test
import org.junit.Assert.*

class ResumeChatRequestTest {
    @Test fun retryAndOtherDeviceKeepTheSameOriginalChatAndReceipt() {
        val phone = ResumeChatRequest.build("codex", "codex:original", "readonly", "stopped-123")
        val watch = ResumeChatRequest.build("codex", "codex:original", "readonly", "stopped-123")
        assertEquals(phone.toString(), watch.toString())
        assertEquals("resume-stopped-123", phone.getString("requestId"))
        assertEquals("codex:original", phone.getString("chatId"))
        assertEquals("readonly", phone.getString("permission"))
        assertFalse(phone.has("attachments")); assertFalse(phone.has("queueAfterCurrent"))
    }
    @Test fun refusesMissingReceiptAndUnknownPermission() {
        assertThrows(IllegalArgumentException::class.java) { ResumeChatRequest.build("claude", "original", "full", "") }
        assertThrows(IllegalArgumentException::class.java) { ResumeChatRequest.build("claude", "original", "invented", "stopped") }
    }
}
