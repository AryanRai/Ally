package dev.ally.phone

import dev.ally.device.BridgeHttpError
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PhoneReconnectTest {
    @Test fun outageThenLostReceiptRecoversTheSameChatWithoutResubmission() = runTest {
        val calls = mutableListOf<String>()
        val originalChat = "codex:original"
        var attempts = 0
        val result = phoneTurnRead(
            { calls += "reconnecting" },
            { calls += "clear-old-receipt"; calls += "history:$originalChat" },
            {
                calls += "read:old-turn"
                if (++attempts == 1) throw BridgeHttpError(503, "Restarting")
                throw BridgeHttpError(404, "Receipt expired")
            },
        )
        assertNull(result)
        assertEquals(listOf("read:old-turn", "reconnecting", "read:old-turn", "clear-old-receipt", "history:codex:original"), calls)
    }

    @Test fun reconnectionToExistingTurnPreservesItsReceipt() = runTest {
        var attempts = 0
        var recovered = false
        val result = phoneTurnRead({}, { recovered = true }) {
            if (++attempts == 1) throw BridgeHttpError(502, "Tunnel reconnecting")
            "still-running"
        }
        assertEquals("still-running", result)
        assertFalse(recovered)
    }

    @Test fun authenticationFailureDoesNotDiscardReceiptOrRetryDelivery() = runTest {
        var calls = 0
        var recovered = false
        try {
            phoneTurnRead({}, { recovered = true }) { calls++; throw BridgeHttpError(401, "Pair again") }
            fail("Must propagate authentication failure")
        } catch (e: BridgeHttpError) { assertEquals(401, e.status) }
        assertEquals(1, calls)
        assertFalse(recovered)
    }

    @Test fun cancellationNeverClearsTheSavedReceipt() = runTest {
        var recovered = false
        try {
            phoneTurnRead({}, { recovered = true }) { throw CancellationException("App closing") }
            fail("Must propagate cancellation")
        } catch (_: CancellationException) {}
        assertFalse(recovered)
    }

    @Test fun failedHistoryRecoveryIsRetriableRatherThanReplayingOldTurn() = runTest {
        var receipt: String? = "old-turn"
        var historyReads = 0
        try {
            phoneTurnRead({}, { receipt = null; historyReads++; throw BridgeHttpError(503, "Still warming") }) {
                throw BridgeHttpError(404, "Old receipt")
            }
            fail("History failure must remain visible")
        } catch (e: BridgeHttpError) { assertEquals(503, e.status) }
        assertNull(receipt)
        assertEquals(1, historyReads)
    }
}
