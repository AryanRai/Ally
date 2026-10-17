package dev.ally.phone

import org.junit.Assert.assertEquals
import org.junit.Test

class PhoneVoiceDeliveryTest {
    @Test fun completedOrReplacedTurnKeepsGuidanceForReview() {
        assertEquals(VoiceDelivery.FINISHED, voiceDelivery("original", null, false))
        assertEquals(VoiceDelivery.FINISHED, voiceDelivery("original", "another", false))
    }
    @Test fun activeGuidanceAndOrdinaryMessagesCanSend() {
        assertEquals(VoiceDelivery.SEND, voiceDelivery("original", "original", false))
        assertEquals(VoiceDelivery.SEND, voiceDelivery(null, null, false))
    }
    @Test fun reviewSettingAlwaysKeepsADraft() {
        assertEquals(VoiceDelivery.REVIEW, voiceDelivery("original", "original", true))
        assertEquals(VoiceDelivery.REVIEW, voiceDelivery(null, null, true))
    }
}
