package dev.ally.phone

/** Monotonic, synthetic-testable signal filtering. RF is proximity evidence, never identity. */
internal class PhysicalTapRules {
    data class Target(val pc: String, val beacon: String, val nonce: String, val expires: Long)
    var target: Target? = null
        private set
    private val samples = ArrayDeque<Pair<Long, Int>>()
    private var firstPeak: Long? = null
    private var lastImpulse = -10000L
    private var lastReview = -10000L
    private var quietSince: Long? = null
    private var motionSince: Long? = null
    private var quietBeforeMotion = 0L
    private var impulseProcessed = false
    fun bind(next: Target, now: Long): Boolean {
        clear()
        if (!next.beacon.matches(Regex("[a-f0-9]{32}")) || !next.nonce.matches(Regex("[a-f0-9]{64}")) ||
            next.pc.isBlank() || next.pc.length > 80 || next.expires - now !in 1..25000) return false
        target = next; return true
    }
    fun radio(beacon: String, rssi: Int, now: Long) {
        if (target?.beacon != beacon || now >= (target?.expires ?: 0) || rssi !in -100..-15) return
        samples.addLast(now to rssi)
        while (samples.isNotEmpty() && now - samples.first().first > 2000) samples.removeFirst()
        while (samples.size > 20) samples.removeFirst()
    }
    fun medianRssi(now: Long): Int? = samples.filter { now - it.first in 0..1500 }.map { it.second }.sorted().let { if (it.size >= 3) it[it.size / 2] else null }
    fun near(now: Long, threshold: Int) = target?.let { now < it.expires && medianRssi(now)?.let { r -> r >= threshold } == true } == true
    /** Two separated, brief impulses after a settled phone; sustained shaking is rejected. */
    fun motion(acceleration: Float, now: Long, threshold: Float): Boolean {
        if (!acceleration.isFinite()) return false
        if (acceleration < 2f) {
            if (quietSince == null) quietSince = now
            motionSince = null; impulseProcessed = false
            return false
        }
        if (motionSince == null) {
            motionSince = now
            quietBeforeMotion = quietSince?.let { now - it } ?: 0L
            quietSince = null
        }
        if (acceleration < threshold || impulseProcessed) return false
        impulseProcessed = true
        // A real impact has a brief rising shoulder. Slow movement still fails this bound.
        if (now - motionSince!! > 100) return false
        if (now - lastImpulse < 100) return false
        val first = firstPeak
        if (first != null && now - first in 140..650 && quietBeforeMotion >= 40) {
            firstPeak = null; lastImpulse = now; quietSince = null; return true
        }
        if (quietBeforeMotion >= 180) { firstPeak = now; lastImpulse = now }
        else if (first != null && now - first > 650) firstPeak = null
        return false
    }
    fun consume(now: Long, unlocked: Boolean, enabled: Boolean, threshold: Int): Target? {
        if (!enabled || !unlocked || !near(now, threshold) || now - lastReview < 5000) return null
        val found = target ?: return null
        lastReview = now; clear(); return found
    }
    fun clear() { target = null; samples.clear(); firstPeak = null; quietSince = null; motionSince = null; quietBeforeMotion = 0; impulseProcessed = false }
    companion object {
        fun proximityCalibration(samples: List<Int>): Int? {
            val sorted = samples.filter { it in -100..-15 }.sorted()
            if (sorted.size < 5 || sorted.last() - sorted.first() > 20) return null
            return (sorted[sorted.size / 2] - 6).coerceIn(-75, -25)
        }
        fun knockCalibration(peak: Float): Float? = if (peak.isFinite() && peak in 8f..60f) (peak * .65f).coerceIn(6f, 30f) else null
    }
}

/** Bluetooth samples must not erase calibration results or flicker at the near threshold. */
internal class PhysicalTapSignalStatus {
    private var protectedUntil = 0L
    private var candidate: Boolean? = null
    private var candidateSince = 0L
    private var published: Boolean? = null
    fun hold(now: Long, milliseconds: Long = 6000) {
        protectedUntil = now + milliseconds
        published = null
    }
    fun offer(near: Boolean, now: Long): Boolean? {
        if (candidate != near) { candidate = near; candidateSince = now }
        if (now < protectedUntil || now - candidateSince < 1200 || published == near) return null
        published = near
        return near
    }
}
