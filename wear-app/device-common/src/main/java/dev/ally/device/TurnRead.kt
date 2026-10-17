package dev.ally.device

import java.io.IOException
import javax.net.ssl.SSLException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

class BridgeHttpError(val status: Int, message: String) : Exception(message)

/** Only use for idempotent reads. Never replay a message, approval, or Stop request. */
suspend fun <T> reconnectingTurnRead(onReconnect: () -> Unit, read: suspend () -> T): T {
    var backoff = 1500L
    while (true) {
        try { return read() }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) {
            val transient = if (e is BridgeHttpError) e.status in setOf(408, 429, 502, 503, 504, 520, 521, 522, 523, 524, 530)
                else e is IOException && e !is SSLException
            if (!transient) throw e
            onReconnect()
            delay(backoff)
            backoff = (backoff * 2).coerceAtMost(30000L)
        }
    }
}
