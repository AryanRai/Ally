package dev.ally.phone
import dev.ally.device.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class LiveAgentStateTest {
    @Test fun updatesInPlaceAndDoesNotReviveFinishedWorkFromOldStatus() {
        val state=LiveAgentState()
        fun row(time:Long,status:String="running",text:String="Reading")=AssistantAgent("device-alias","Chat","codex",status,"Working",false,time,text,"session")
        state.update(listOf(row(10)));assertEquals(1,state.rows.size)
        state.update(listOf(row(11,text="Writing")));assertEquals("Writing",state.rows.single().text)
        state.finish("codex:session",12);assertTrue(state.rows.isEmpty())
        state.update(listOf(row(11)));assertTrue(state.rows.isEmpty())
        state.update(listOf(row(13)));assertEquals(1,state.rows.size)
        state.update(listOf(row(14,"completed")));assertTrue(state.rows.isEmpty())
    }
    @Test fun emptyActivityRemovesProgressWithoutInventingCompletion() {
        val state=LiveAgentState();state.update(listOf(AssistantAgent("id","Chat","claude","running","",false,0)))
        assertEquals(1,state.rows.size);state.update(emptyList());assertTrue(state.rows.isEmpty())
    }
    @Test fun finalRepliesReplaceOnlyTheirOwnChatNotification() {
        fun reply(id:String,chat:String)=JSONObject().put("id",id).put("kind","response").put("chatId",chat)
        assertEquals(DeviceAlerts.notificationId(reply("one","codex:session123")),DeviceAlerts.notificationId(reply("two","codex:session123")))
        assertNotEquals(DeviceAlerts.notificationId(reply("one","codex:session123")),DeviceAlerts.notificationId(reply("two","codex:other12345")))
    }
    @Test fun rerecordingNeverDiscardsAnUncertainSend() {
        assertTrue(AssistantEntryPolicy.canReplace(null,null,null,false,"Choose a conversation"))
        assertTrue(AssistantEntryPolicy.canReplace(null,null,null,true,"Finding the right conversation…"))
        assertFalse(AssistantEntryPolicy.canReplace("target",null,null,false,"Failed"))
        assertFalse(AssistantEntryPolicy.canReplace(null,"submitted",null,false,"Failed"))
        assertFalse(AssistantEntryPolicy.canReplace(null,null,"receipt",false,"Failed"))
        assertFalse(AssistantEntryPolicy.canReplace(null,null,null,true,"Opening conversation…"))
    }
}
