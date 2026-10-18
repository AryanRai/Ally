package dev.ally.phone

import dev.ally.device.BridgeHttpError
import dev.ally.device.reconnectingTurnRead
import kotlinx.coroutines.CancellationException

/** A missing process-local receipt after restart is not a failed native chat.
 * Recover by reading the same chat; never replay a submission or decision. */
internal suspend fun <T> phoneTurnRead(
    onReconnect: () -> Unit,
    onMissing: suspend () -> Unit,
    read: suspend () -> T,
): T? = try {
    reconnectingTurnRead(onReconnect, read)
} catch (e: CancellationException) {
    throw e
} catch (e: BridgeHttpError) {
    if (e.status != 404) throw e
    onMissing()
    null
}

