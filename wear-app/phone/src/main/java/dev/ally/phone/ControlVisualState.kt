package dev.ally.phone

/** Visual evidence comes only from the validated phone grant, never a request/status string. */
data class ControlVisualState(val grantId: String = "", val chatId: String = "", val title: String = "", val expiresAt: Long = 0, val operations: Int = 0, val lastActionAt: Long = 0) {
    fun visible(now: Long, connected: Boolean, locked: Boolean, screenOn: Boolean) =
        grantId.isNotBlank() && now < expiresAt && connected && !locked && screenOn
    fun performing(now:Long = System.currentTimeMillis()) = copy(operations = operations + 1,lastActionAt=now)
    fun activityPulse(now:Long) = operations>0 || (lastActionAt>0 && now>=lastActionAt && now-lastActionAt<650)
    fun settled() = copy(operations = (operations - 1).coerceAtLeast(0))
}
