package dev.ally.device

import java.util.UUID

/** Local snapshot transfer only. Owning a token never authorizes a network send. */
internal class ContextHandoff(private val now: () -> Long, private val ttlMs: Long = 60_000) {
    internal class Snapshot(val text: String, val image: ByteArray?,val context:String?=null) {
        fun clear() { image?.fill(0) }
    }
    private data class Pending(val token: String, val expires: Long, val snapshot: Snapshot)
    private var pending: Pending? = null
    init { require(ttlMs in 1..60_000) }
    @Synchronized fun offer(text: String, image: ByteArray?,context:String?=null): String {
        require(text.length <= 12_000) { "Context is too long" }
        require(image == null || image.size in 1..20 * 1024 * 1024) { "Screen image must be under 20 MB" }
        require(text.isNotBlank() || image != null) { "No screen context is available" }
        clear()
        val token = UUID.randomUUID().toString()
        require(context==null||context.length<=6000)
        pending = Pending(token, now() + ttlMs, Snapshot(text, image?.copyOf(),context))
        return token
    }
    @Synchronized fun take(token: String): Snapshot? {
        val current = pending ?: return null
        if (now() >= current.expires) { clear(); return null }
        if (current.token != token) return null
        pending = null
        return current.snapshot
    }
    @Synchronized fun expire(token: String) { if (pending?.token == token) clear() }
    @Synchronized fun clear() { pending?.snapshot?.clear(); pending = null }
}
