package dev.ally.device.voice

import kotlinx.coroutines.*

/** Serial public narration; Stop cancels the playing update and all queued successors. */
internal class SerialNarration(private val scope: CoroutineScope) {
    private var tail: Job? = null
    private val jobs = linkedSetOf<Job>()
    fun enqueue(play: suspend () -> Unit) {
        // Never build an unbounded backlog while a long answer is being read.
        if (jobs.size >= 32) return
        val previous = tail
        lateinit var job: Job
        job = scope.launch(start = CoroutineStart.LAZY) {
            try { previous?.join(); ensureActive(); play() }
            finally { jobs.remove(job) }
        }
        jobs.add(job); tail = job; job.start()
    }
    fun stop() { jobs.toList().forEach { it.cancel() }; jobs.clear(); tail = null }
}
