package dev.ally.phone
import dev.ally.device.DeviceInteractions
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
class NotificationDecisionTest {
    private fun request()=JSONObject().put("interaction",true).put("interactionState","pending").put("expiresAt",2000L).put("fields",JSONArray()).put("actions",JSONArray().put(JSONObject().put("value","accept").put("label","Allow once")).put(JSONObject().put("value","decline").put("label","Deny")).put(JSONObject().put("value","submitAlways").put("label","Always allow")))
    @Test fun exposesOnlyLiveExplicitOneTimeDecisions() {
        assertEquals(listOf("accept","decline"),DeviceInteractions.notificationActions(request(),1000).map{it.first})
        assertTrue(DeviceInteractions.notificationActions(request(),2000).isEmpty())
        assertTrue(DeviceInteractions.notificationActions(request().put("interactionState","answered"),1000).isEmpty())
        assertTrue(DeviceInteractions.notificationActions(request().put("desktopOnly",true),1000).isEmpty())
        assertTrue(DeviceInteractions.notificationActions(request().put("deviceAction","phone_control_approve"),1000).isEmpty())
        assertTrue(DeviceInteractions.notificationActions(request().put("fields",JSONArray().put(JSONObject().put("id","text"))),1000).isEmpty())
    }
    @Test fun singleChoiceQuestionUsesTheExactAdvertisedValue() {
        val item=request().put("actions",JSONArray().put(JSONObject().put("value","submit")))
            .put("fields",JSONArray().put(JSONObject().put("id","connection").put("options",JSONArray().put(JSONObject().put("value","wifi").put("label","Wireless")).put(JSONObject().put("value","usb").put("label","USB")))))
        assertEquals(listOf("Wireless","USB"),DeviceInteractions.notificationActions(item,1000).map{it.second})
        assertEquals("submit" to mapOf("connection" to "usb"),DeviceInteractions.notificationAnswer(item,"choice:1",1000))
        assertNull(DeviceInteractions.notificationAnswer(item,"choice:9",1000))
        item.getJSONArray("fields").getJSONObject(0).put("secret",true)
        assertTrue(DeviceInteractions.notificationActions(item,1000).isEmpty())
    }
    @Test fun reconnectAndExpiryPreventStaleNotificationDecisions() {
        val item=request().put("_connection","original")
        assertTrue(DeviceInteractions.canAnswer(item,true,"original",1000))
        assertFalse(DeviceInteractions.canAnswer(item,true,"new-connection",1000))
        assertFalse(DeviceInteractions.canAnswer(item,false,"original",1000))
        assertFalse(DeviceInteractions.canAnswer(item,true,"original",2000))
    }
}

