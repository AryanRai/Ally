package dev.ally.phone

import dev.ally.device.DeviceInteractions
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class DeviceInteractionsTest {
    private fun request(chat: String="codex:one") = JSONObject().put("id","request").put("interaction",true).put("interactionState","pending").put("chatId",chat).put("expiresAt",2000).put("_connection","connection")
    @Test fun routesOnlyTheExactChatAndSupportsNativeSessionAlias() {
        val one=request(); val other=request("claude:one")
        assertEquals(listOf(one),DeviceInteractions.forChat(listOf(one,other),"device-chat-id","codex:one"))
        assertTrue(DeviceInteractions.forChat(listOf(one),"another-chat").isEmpty())
    }
    @Test fun refusesExpiredDisconnectedReconnectedAndAlreadyAnsweredRequests() {
        val item=request()
        assertTrue(DeviceInteractions.canAnswer(item,true,"connection",1000))
        assertFalse(DeviceInteractions.canAnswer(item,false,"connection",1000))
        assertFalse(DeviceInteractions.canAnswer(item,true,"new-connection",1000))
        assertFalse(DeviceInteractions.canAnswer(item,true,"connection",2000))
        item.put("interactionState","answered").put("answeredOn","watch")
        assertFalse(DeviceInteractions.canAnswer(item,true,"connection",1000))
        assertEquals("Answered on watch",DeviceInteractions.status(item,1000))
    }
    @Test fun pendingAttentionExcludesCompletedAndExpiredItems() {
        val item=request(); val expired=request().put("expiresAt",999); val answered=request().put("interactionState","answered")
        assertEquals(listOf(item),DeviceInteractions.pending(listOf(item,expired,answered),1000))
    }
    @Test fun answeredQuestionStaysBetweenOriginalMessagesWhenNewRepliesArrive() {
        val question=request().put("createdAt",1500).put("interactionState","answered")
        val messages=listOf("asked" to 1000L,"reply" to 2000L,"later" to 3000L)
        val timeline=DeviceInteractions.timeline(listOf(question),messages,{it.first},{it.second})
        assertEquals(listOf("asked","device-interaction:request","reply","later"),timeline.map { it.id })
        assertFalse(DeviceInteractions.awaiting(question,1600))
        assertEquals("answered",timeline[1].request?.optString("interactionState"))
    }
    @Test fun reconnectKeepsOriginalReceivedTimeAndUnknownMessageTimesKeepRequestVisible() {
        val question=request().put("_receivedAt",1500)
        assertEquals(1500L,DeviceInteractions.requestedAt(question))
        val timeline=DeviceInteractions.timeline(listOf(question),listOf("old" to 0L),{it.first},{it.second})
        assertEquals(listOf("old","device-interaction:request"),timeline.map { it.id })
        assertTrue(DeviceInteractions.awaiting(question,1600))
    }
    @Test fun historyKeepsQuestionAndAnswerLabelsWithoutDisplayingSecrets() {
        val fields=JSONArray().put(JSONObject().put("id","choice").put("label","Where?").put("options",JSONArray().put(JSONObject().put("value","chat").put("label","Inside this chat"))))
            .put(JSONObject().put("id","secret").put("label","Token").put("secret",true))
        val item=request().put("fields",fields)
        assertEquals("Where?\nToken",DeviceInteractions.answerSummary(item))
        item.put("answerValues",JSONObject().put("choice","chat").put("secret","do-not-display"))
        assertEquals("Where?: Inside this chat\nToken: ••••",DeviceInteractions.answerSummary(item))
    }
}
