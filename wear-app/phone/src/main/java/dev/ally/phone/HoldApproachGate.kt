package dev.ally.phone

/** Qualify an approach silently; never soften withdrawal or missing-radio cancellation. */
internal class HoldApproachGate {
    private var since: Long? = null
    private var last: Long? = null
    private var admitted = false
    private var quietUntil = 0L
    fun observe(near: Boolean, now: Long): Boolean {
        val stale = last?.let { now - it !in 0..700 } == true
        if (stale || !near) {
            if (admitted) quietUntil = now + 2500
            since = null; admitted = false
        }
        last = now
        if (!near || now < quietUntil) return false
        if (since == null) since = now
        if (now - since!! >= 800) admitted = true
        return admitted
    }
    fun reset() { since = null; last = null; admitted = false; quietUntil = 0 }
}
