package dev.ally.phone
import dev.ally.device.*
import org.junit.Assert.*
import org.junit.Test
class ContextHandoffDraftPolicyTest {
    @Test fun emptyDraftCanImportButSavedContentRequiresChoice() {
        assertEquals(ContextHandoffDraftPolicy.Review.IMPORT,ContextHandoffDraftPolicy.review(ShareDraft(),false))
        val draft=ShareDraft("keep these words")
        assertEquals(ContextHandoffDraftPolicy.Review.CHOOSE,ContextHandoffDraftPolicy.review(draft,false))
        assertEquals("keep these words",draft.text)
        assertEquals(ContextHandoffDraftPolicy.Review.CHOOSE,ContextHandoffDraftPolicy.review(ShareDraft(files=listOf(SharedFile("fixture","screen.png","image/png",123))),false))
    }
    @Test fun uncertainSendAlwaysWinsEvenWhenDraftLooksEmpty() {
        assertEquals(ContextHandoffDraftPolicy.Review.PENDING,ContextHandoffDraftPolicy.review(ShareDraft(),true))
        assertEquals(ContextHandoffDraftPolicy.Review.PENDING,ContextHandoffDraftPolicy.review(ShareDraft("keep"),true))
    }
}
