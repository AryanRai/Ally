package dev.ally.device.voice

/** Audio belongs to an explicit read, not the interactive display lifecycle. */
internal class SpeechLifetime(private val acquire: () -> Unit, private val release: () -> Unit) {
    private var generation = 0
    private var active = false
    fun begin(): Int {
        stop()
        acquire()
        active = true
        return generation
    }
    fun finish(id: Int) { if (id == generation) stop() }
    fun stop() {
        generation++
        if (active) { active = false; release() }
    }
}

