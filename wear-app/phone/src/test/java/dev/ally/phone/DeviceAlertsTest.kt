package dev.ally.phone

import dev.ally.device.DeviceAlerts
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class DeviceAlertsTest {
    @Test fun distinguishesGenuineRequestsFromReplyTextAboutPermission() {
        val reply=JSONObject().put("id","reply:old").put("body","Need permission. Please approve.")
        assertEquals("Reply",DeviceAlerts.kind(reply)); assertFalse(DeviceAlerts.blocking(reply,1000))
        val question=JSONObject().put("id","question").put("interaction",true).put("kind","question").put("interactionState","pending").put("expiresAt",2000)
        assertEquals("Question",DeviceAlerts.kind(question)); assertTrue(DeviceAlerts.blocking(question,1000))
        question.put("interactionState","answered")
        assertFalse(DeviceAlerts.blocking(question,1000)); assertEquals("Question",DeviceAlerts.kind(question))
    }
    @Test fun opensOnlyExactNativeChatsAndDoesNotGuessAnAmbiguousLegacyProvider() {
        val native=JSONObject().put("chatId","claude:session-one")
        assertEquals("claude:session-one",DeviceAlerts.chat(native))
        val legacy=JSONObject().put("sessionId","session-one")
        assertNull(DeviceAlerts.chat(legacy))
        assertEquals("codex:session-one",DeviceAlerts.chat(legacy,listOf("codex:session-one")))
        assertNull(DeviceAlerts.chat(legacy,listOf("codex:session-one","claude:session-one")))
        assertNull(DeviceAlerts.chat(JSONObject().put("chatId","intent:arbitrary")))
    }
    @Test fun activeRequestsLeadAndViewedDoesNotResolveOrHideThem() {
        val reply=JSONObject().put("id","reply:one").put("createdAt",3000)
        val approval=JSONObject().put("id","approval").put("interaction",true).put("kind","approval").put("interactionState","pending").put("expiresAt",2000).put("createdAt",1000).put("_viewedAt",1500)
        assertEquals(listOf(approval,reply),DeviceAlerts.ordered(listOf(reply,approval,reply),1600))
        assertFalse(DeviceAlerts.unread(approval)); assertTrue(DeviceAlerts.blocking(approval,1600))
        assertFalse(DeviceAlerts.blocking(approval,2000))
    }
}
