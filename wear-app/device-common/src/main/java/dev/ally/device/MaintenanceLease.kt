package dev.ally.device

/** In-memory bounded lease. No boot/restart replay or remote renewal. */
internal class MaintenanceLease(private val now:()->Long) {
    private var deadline=0L
    fun start(duration:Long=600000){require(duration in 1000..600000);deadline=now()+duration}
    fun remaining():Long=(deadline-now()).coerceAtLeast(0)
    fun active():Boolean=remaining()>0
    fun stop(){deadline=0}
}
