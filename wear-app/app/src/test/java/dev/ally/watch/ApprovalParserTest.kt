package dev.ally.watch

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ApprovalParserTest {
    @Test fun doesNotPreselectAnApproval() {
        val request = ApprovalParser.parse(JSONObject("""{"approvals":[{"id":"a","title":"Upload?","detail":"report.pdf to Gmail","fields":[{"id":"allow","label":"Allow upload?","required":true,"options":[{"value":"true","label":"Yes"},{"value":"false","label":"No"}]}],"actions":[{"value":"submit","label":"Confirm choices"},{"value":"decline","label":"Deny"}]}]}"""))!!
        assertFalse(ApprovalParser.complete(request, emptyMap()))
        assertTrue(ApprovalParser.complete(request, mapOf("allow" to "false")))
        assertEquals("report.pdf to Gmail", request.detail)
    }
    @Test fun removesAnApprovalWhenServerNoLongerReturnsIt() {
        assertNull(ApprovalParser.parse(JSONObject("""{"approvals":[]}""")))
    }
}
