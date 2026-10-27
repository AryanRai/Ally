package dev.ally.phone

import dev.ally.device.AssistantExecutionDestination as Destination
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AssistantExecutionDestinationTest {
    @Test fun oldBridgesOfferOnlyTheirExistingPcPathWithoutAuthorizingIt() {
        val offer = Destination.parse(JSONObject())
        assertTrue(offer.pcAvailable)
        assertNull(Destination.select(Destination.PHONE, offer))
        assertEquals("pc", Destination.select(Destination.PC, offer))
        assertThrows(IllegalArgumentException::class.java) { Destination.requirePc(null) }
    }
    @Test fun unknownVersionsAndMalformedAvailabilityFailClosed() {
        assertFalse(Destination.parse(JSONObject().put("execution", JSONObject().put("version", 2))).pcAvailable)
        val data = JSONObject().put("version", 1).put("options", JSONArray().put(JSONObject().put("location", "pc").put("available", "true")))
        assertFalse(Destination.parse(JSONObject().put("execution", data)).pcAvailable)
    }
    @Test fun phoneCannotBeEnabledByRemoteCapabilityClaims() {
        val data = JSONObject().put("version", 1).put("options", JSONArray().put(JSONObject().put("location", "phone").put("available", true)))
        val offer = Destination.parse(JSONObject().put("execution", data))
        assertNull(Destination.select(Destination.PHONE, offer))
        assertThrows(IllegalArgumentException::class.java) { Destination.requirePc("phone") }
    }
}
