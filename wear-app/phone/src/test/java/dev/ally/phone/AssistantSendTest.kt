package dev.ally.phone

import dev.ally.device.AssistantSend
import org.junit.Assert.*
import org.junit.Test

class AssistantSendTest {
    @Test fun typedTextWinsOverAutomaticRecording() {
        assertEquals(AssistantSend.Action.TEXT, AssistantSend.action("join", true))
        assertEquals(AssistantSend.Action.TEXT, AssistantSend.action("join", false))
        assertEquals(AssistantSend.Action.FINISH_VOICE, AssistantSend.action("  ", true))
        assertEquals(AssistantSend.Action.NONE, AssistantSend.action("", false))
    }
    @Test fun silentAutomaticCaptureIsNotTranscribedButManualFallbackRemainsUsable() {
        assertTrue(AssistantSend.discardSilentCapture(true, true, false))
        assertFalse(AssistantSend.discardSilentCapture(true, true, true))
        assertFalse(AssistantSend.discardSilentCapture(true, false, false))
        assertFalse(AssistantSend.discardSilentCapture(false, true, false))
    }
}
