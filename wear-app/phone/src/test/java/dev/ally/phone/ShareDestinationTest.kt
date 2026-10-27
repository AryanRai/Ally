package dev.ally.phone
import dev.ally.device.ShareDestination
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class ShareDestinationTest {
    @Test fun pcSelectedConversationIsOnlyADefaultNotASend() {
        val snapshot=JSONObject().put("selected",JSONObject().put("chatId","codex:chosen-chat").put("provider","codex").put("title","Chosen"))
        val choice=ShareDestination.pcSelection(snapshot)!!
        assertEquals("codex:chosen-chat",choice.getString("id"));assertEquals("Chosen",choice.getString("title"))
        snapshot.getJSONObject("selected").put("provider","unsupported")
        assertNull(ShareDestination.pcSelection(snapshot));assertNull(ShareDestination.pcSelection(JSONObject()))
    }
    @Test fun explicitDestinationAndRequestRemainBoundEvenIfNavigationChanges() {
        val chat=JSONObject().put("id","codex:chosen-chat").put("provider","codex")
        val request=ShareDestination.message(chat,"share-request","Look at this",listOf("photo-id"),"readonly")
        chat.put("id","codex:another-chat")
        assertEquals("codex:chosen-chat",request.getString("chatId"))
        assertEquals("share-request",request.getString("requestId"))
        assertEquals("pc",request.getString("executionLocation"))
        assertEquals("photo-id",request.getJSONArray("attachments").getString(0))
        val restored=JSONObject(request.toString())
        assertEquals(request.toString(),restored.toString())
        assertEquals("readonly",restored.getString("permission"))
    }
    @Test fun preventsEmptyAndInvalidDestinationsWithoutGuessingOrPromotingPermissions() {
        val chat=JSONObject().put("id","chosen").put("provider","codex")
        assertThrows(IllegalArgumentException::class.java) { ShareDestination.message(chat,"id","",emptyList(),"readonly") }
        assertThrows(IllegalArgumentException::class.java) { ShareDestination.message(chat,"id","message",emptyList(),"bypass") }
        assertThrows(IllegalArgumentException::class.java) { ShareDestination.message(JSONObject().put("id","").put("provider","codex"),"id","message",emptyList(),"readonly") }
    }
}

