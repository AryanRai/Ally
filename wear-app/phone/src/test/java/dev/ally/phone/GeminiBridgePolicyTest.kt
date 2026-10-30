package dev.ally.phone

import org.junit.Assert.*
import org.junit.Test

class GeminiBridgePolicyTest {
    private val app = GeminiBridgePolicy.GOOGLE_APP
    private fun node(text: String = "", desc: String = "", suffix: String = "", editable: Boolean = false,
        password: Boolean = false, pkg: String = app) = ControlNode(pkg, "android.view.View", text, desc,
        if(suffix.isBlank()) "" else "$app:id/assistant_robin_$suffix", 0, 0, 100, 100,
        editable = editable, password = password)
    private fun screen(prompt: String = "Test request") = listOf(node(suffix="chat_history_list"),
        node(prompt,suffix="input_collapsed_text_half_sheet",editable=true),node(desc="Send"))
    @Test fun googleSearchOrForeignAppsAreNotGemini() {
        assertFalse(GeminiBridgePolicy.inspect(listOf(node("Google Search"),node(desc="Send"))).recognized)
        assertFalse(GeminiBridgePolicy.inspect(listOf(node(suffix="chat_history_list",pkg="unrelated.app"))).recognized)
    }
    @Test fun recognizesObservedGeminiControlsAndSeparatesActualMessageRoles() {
        val view=GeminiBridgePolicy.inspect(screen()+node("Question",suffix="user_message_text")+node("Answer",suffix="text")+node("Suggestion"))
        assertTrue(view.recognized);assertEquals("Test request",view.draft)
        assertEquals(listOf("user","assistant"),view.messages.map {it.role})
        assertEquals(listOf("Question","Answer"),view.messages.map {it.text})
        assertFalse(view.completeHistory)
    }
    @Test fun marksGeneralControlTreeTextAsPossiblyTruncatedAndNeverPromisesFullHistory() {
        val view=GeminiBridgePolicy.inspect(screen()+node("x".repeat(500),suffix="text"))
        assertTrue(view.messages.single().possiblyTruncated);assertFalse(view.completeHistory)
    }
    @Test fun neverUsesPasswordNodesOrAmbiguousEditorsForSending() {
        assertTrue(GeminiBridgePolicy.inspect(screen()+node("secret",suffix="text",password=true)).messages.isEmpty())
        val view=GeminiBridgePolicy.inspect(screen()+node("another",suffix="input_collapsed_text_half_sheet",editable=true))
        assertNull(view.draft)
        assertFalse(GeminiBridgePolicy.maySend(view,"Test request","r1","r1",true,true,true))
    }
    @Test fun sendRequiresExactDraftFreshRevisionObservedEnabledControlAndActiveAccess() {
        val view=GeminiBridgePolicy.inspect(screen())
        assertTrue(GeminiBridgePolicy.maySend(view,"Test request","r1","r1",true,true,true))
        assertFalse(GeminiBridgePolicy.maySend(view,"other","r1","r1",true,true,true))
        assertFalse(GeminiBridgePolicy.maySend(view,"Test request","r1","r2",true,true,true))
        assertFalse(GeminiBridgePolicy.maySend(view,"Test request","r1","r1",false,true,true))
        assertFalse(GeminiBridgePolicy.maySend(view,"Test request","r1","r1",true,false,true))
        assertFalse(GeminiBridgePolicy.maySend(view,"Test request","r1","r1",true,true,false))
    }
    @Test fun uncertainOrConfirmedAttemptsCannotBeClaimedAgain() {
        val receipt=GeminiBridgePolicy.receipt("request-1","phone-1","observed-account","Test request")
        val attempted=receipt.claim();val uncertain=attempted.uncertain()
        assertThrows(IllegalStateException::class.java){attempted.claim()}
        assertThrows(IllegalStateException::class.java){uncertain.claim()}
        assertThrows(IllegalStateException::class.java){uncertain.confirm(GeminiBridgePolicy.digest("wrong"))}
        val confirmed=uncertain.confirm(GeminiBridgePolicy.digest("Test request"))
        assertEquals(GeminiBridgePolicy.Delivery.CONFIRMED,confirmed.delivery)
        assertThrows(IllegalStateException::class.java){confirmed.claim()}
        assertNotEquals(receipt.accountScope,GeminiBridgePolicy.receipt("request-1","phone-1","other-account","Test request").accountScope)
    }
}
