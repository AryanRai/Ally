package dev.ally.device.voice

import kotlinx.coroutines.channels.Channel
import java.util.concurrent.atomic.AtomicInteger

/** PCM is bounded by bytes, not variable-sized websocket messages. */
internal class ReplyAudioBuffer(private val maxBytes: Int = 4_800_000) {
    private val queued = AtomicInteger()
    private val chunks = Channel<ByteArray>(Channel.UNLIMITED)
    @Volatile private var complete = false
    fun offer(bytes: ByteArray): Boolean {
        if (queued.addAndGet(bytes.size) > maxBytes) {
            queued.addAndGet(-bytes.size)
            fail(IllegalStateException("Reply audio exceeded its buffer")); return false
        }
        if (!chunks.trySend(bytes).isSuccess) { queued.addAndGet(-bytes.size); return false }
        return true
    }
    fun completed() { complete = true; chunks.close() }
    fun disconnected() { if (!complete) fail(IllegalStateException("Reply audio connection ended before completion")) }
    fun fail(error: Throwable) { if (!complete) chunks.close(error) }
    suspend fun next(): ByteArray? {
        val result = chunks.receiveCatching()
        result.exceptionOrNull()?.let { throw it }
        return result.getOrNull()?.also { queued.addAndGet(-it.size) }
    }
    fun cancel() { chunks.cancel() }
}

