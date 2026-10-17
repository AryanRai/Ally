package dev.ally.watch

import java.io.IOException
import javax.net.ssl.SSLException

/** Retry transport loss, not rejected credentials, invalid replies, or agent failures. */
object ConnectionRecovery {
    fun transientHttpStatus(status: Int) = status in setOf(408, 429, 502, 503, 504, 520, 521, 522, 523, 524, 530)
    fun canReconnect(error: Exception) = error is IOException && error !is SSLException
    fun recoveredDetail(hasUnacknowledgedMessage: Boolean) = if (hasUnacknowledgedMessage)
        "Connected · tap to retry your message" else "Hold to talk"
}
