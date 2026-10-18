package dev.ally.device

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull

/** One OS assistant snapshot, held only in memory until this query is submitted.
 * Tokens reject late compression/results; later orb presses never recapture. */
internal class AssistantScreenContext {
    private var generation = 0L
    private var open = false
    private var bytes: ByteArray? = null
    private var assist = ""
    private var screenshotPending = false
    private var assistPending = false
    private var ownScreen = false
    private var ready = CompletableDeferred<Unit>()
    var enabled = false; private set
    var notice = ""; private set
    fun begin(allow: Boolean, screenshot: Boolean, data: Boolean): Long {
        clear(); enabled = allow; open = allow
        screenshotPending = allow && screenshot; assistPending = allow && data
        notice = if (allow) "Screen unavailable" else ""
        if (!screenshotPending && !assistPending) ready.complete(Unit)
        return generation
    }
    fun accepts(token: Long) = open && token == generation
    fun screenshot(token: Long, image: ByteArray?) {
        if (!accepts(token) || ownScreen || !screenshotPending) { image?.fill(0); return }
        bytes = image; screenshotPending = false; update()
    }
    fun assist(token: Long, text: String, own: Boolean) {
        if (!accepts(token) || !assistPending) return
        ownScreen = own; assistPending = false
        assist = if (own) "" else text.take(6000)
        if (own) { bytes?.fill(0); bytes = null; screenshotPending = false }
        update()
    }
    private fun update() {
        notice = when { !enabled -> ""; bytes != null -> "Screen attached"; assist.isNotBlank() -> "Screen text available"; else -> "Screen unavailable" }
        if (!screenshotPending && !assistPending) ready.complete(Unit)
    }
    suspend fun settle() {
        withTimeoutOrNull(1500) { ready.await() }
        // A late callback cannot alter a request whose payload has been frozen.
        seal()
    }
    fun seal() { open = false; screenshotPending = false; assistPending = false; ready.complete(Unit); update() }
    fun image() = bytes?.copyOf()
    fun text() = assist
    fun clear() {
        generation++; open = false; bytes?.fill(0); bytes = null; assist = ""
        screenshotPending = false; assistPending = false; ownScreen = false
        enabled = false; notice = ""; ready.complete(Unit); ready = CompletableDeferred()
    }
}
