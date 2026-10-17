package dev.ally.watch

import org.junit.Assert.*
import org.junit.Test
import java.net.ConnectException
import java.net.SocketTimeoutException
import javax.net.ssl.SSLHandshakeException

class ConnectionRecoveryTest {
    @Test fun reconnectsWhenTheCloudTunnelOrDesktopIsTemporarilyUnavailable() {
        listOf(502, 503, 504, 520, 522, 524, 530).forEach { assertTrue(ConnectionRecovery.transientHttpStatus(it)) }
        listOf(400, 401, 403, 404, 409).forEach { assertFalse(ConnectionRecovery.transientHttpStatus(it)) }
    }
    @Test fun reconnectsAfterTunnelLossOrTimeout() {
        assertTrue(ConnectionRecovery.canReconnect(ConnectException("Connection refused")))
        assertTrue(ConnectionRecovery.canReconnect(SocketTimeoutException()))
    }
    @Test fun doesNotAutomaticallyRetryAuthenticationOrAgentErrors() {
        assertFalse(ConnectionRecovery.canReconnect(IllegalStateException("Pair Ally first")))
        assertFalse(ConnectionRecovery.canReconnect(SSLHandshakeException("Invalid certificate")))
    }
    @Test fun unacknowledgedUploadsRequireAnExplicitRetry() {
        assertEquals("Connected · tap to retry your message", ConnectionRecovery.recoveredDetail(true))
    }
}
