package dev.ally.device

/** Existing content is never erased by an incoming screen; uncertain sends retain their payload. */
internal object ContextHandoffDraftPolicy {
    enum class Review { IMPORT, CHOOSE, PENDING }
    fun review(draft: ShareDraft, pending: Boolean): Review = when {
        pending -> Review.PENDING
        draft.text.isNotBlank() || draft.files.isNotEmpty() -> Review.CHOOSE
        else -> Review.IMPORT
    }
}
