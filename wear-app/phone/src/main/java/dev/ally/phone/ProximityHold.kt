package dev.ally.phone

/** A cancellable gesture from fresh, already socket-bound radio observations.
 * No RF value authenticates a PC. Failure/gaps discard all progress, never pause it. */
internal class ProximityHold(private val duration: Long = 3000, private val gap: Long = 700) {
    private var began: Long? = null
    private var lastSample: Long? = null
    private var lastNear = false
    private var departed: Long? = null
    private var armed = true
    private var completed = false
    fun observe(near: Boolean, now: Long) {
        if (lastSample?.let { now - it !in 0..gap } == true) { began = null; departed = null }
        lastSample = now; lastNear = near
        if (!near) {
            began = null; completed = false
            if (departed == null) departed = now
            if (now - departed!! >= 1000) armed = true
        } else {
            departed = null
            if (armed && began == null) began = now
        }
    }
    fun progress(now: Long): Float {
        if (!armed || !lastNear || lastSample?.let { now - it !in 0..gap } != false) { began = null; return 0f }
        return began?.let { ((now - it).toFloat() / duration).coerceIn(0f, 1f) } ?: 0f
    }
    fun take(now: Long): Boolean {
        if (progress(now) < 1f) return false
        armed = false; completed = true; began = null
        return true
    }
    fun stillClose(now: Long): Boolean = completed && lastNear && lastSample?.let { now - it in 0..gap } == true
    fun cancelProgress() { began = null; completed = false }
    fun blockUntilDeparture() { reset(); armed = false }
    fun requiresDeparture(): Boolean = !armed
    fun reset() { began = null; lastSample = null; lastNear = false; completed = false; departed = null }
}
