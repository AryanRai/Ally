package dev.ally.device

/** Re-recording may replace unsent words, never a send with an uncertain receipt. */
object AssistantEntryPolicy {
    fun canReplace(target: String?, submitted: String?, accepted: String?, busy: Boolean, status: String) =
        target == null && submitted == null && accepted == null && (!busy || status in setOf("Finding the right conversation…", "Finishing your words…"))
}
