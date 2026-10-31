package dev.ally.phone.codex
import kotlinx.coroutines.CompletableDeferred
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class PhoneLocalDecisionsTest {
    private fun decision(id:String,schema:JSONObject=JSONObject())=LocalDecision(id,"Codex tool approval","Allow?",PhoneElicitationForm(schema),CompletableDeferred())
    @After fun clear(){PhoneLocalDecisions.pending.value=null}
    @Test fun notificationAnswersOnlyTheDecisionItWasPostedFor() {
        val item=decision("current");PhoneLocalDecisions.pending.value=item
        assertFalse(PhoneLocalDecisions.answerFromNotification("older","allow"))
        assertFalse(PhoneLocalDecisions.answerFromNotification("current","always"))
        assertFalse(item.answer.isCompleted)
        assertTrue(PhoneLocalDecisions.answerFromNotification("current","allow"))
        assertEquals("{}",item.answer.getCompleted().toString())
        assertFalse(PhoneLocalDecisions.answerFromNotification("current","deny"))
    }
    @Test fun denyDeclinesAndFormsNeedTheReviewScreen() {
        val item=decision("plain");PhoneLocalDecisions.pending.value=item
        assertTrue(PhoneLocalDecisions.answerFromNotification("plain","deny"))
        assertNull(item.answer.getCompleted())
        val form=decision("form",JSONObject().put("type","object").put("properties",JSONObject().put("reason",JSONObject().put("type","string"))))
        PhoneLocalDecisions.pending.value=form
        assertFalse(PhoneLocalDecisions.answerFromNotification("form","allow"))
    }
}
