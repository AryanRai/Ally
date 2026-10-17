package dev.ally.phone

import dev.ally.device.BridgeHttpError
import dev.ally.device.reconnectingTurnRead
import java.io.IOException
import javax.net.ssl.SSLException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class TurnReadTest {
    @Test fun resumesSameReadAfterTransportAndTunnelLoss() = runTest {
        var reads = 0
        var reconnects = 0
        val result = reconnectingTurnRead({ reconnects++ }) {
            reads++
            when (reads) { 1 -> throw IOException("network switched"); 2 -> throw BridgeHttpError(502, "tunnel restarting"); else -> "same-turn partial answer" }
        }
        assertEquals("same-turn partial answer", result)
        assertEquals(3, reads)
        assertEquals(2, reconnects)
    }
    @Test fun neverRetriesAuthExpiryTlsCancellationOrMalformedReplies() = runTest {
        for (failure in listOf(BridgeHttpError(401, "pair again"), BridgeHttpError(404, "expired"), SSLException("certificate"), CancellationException("closed"), IllegalStateException("invalid"))) {
            var reads = 0
            try {
                reconnectingTurnRead({ fail("Must not reconnect") }) { reads++; throw failure }
                fail("Expected failure")
            } catch (actual: Exception) { assertSame(failure, actual) }
            assertEquals(1, reads)
        }
    }
}
