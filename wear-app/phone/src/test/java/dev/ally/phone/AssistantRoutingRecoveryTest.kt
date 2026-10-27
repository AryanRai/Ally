package dev.ally.phone

import dev.ally.device.AssistantRoutingRecovery
import dev.ally.device.AssistantRoutePicker
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class AssistantRoutingRecoveryTest {
    @Test fun matchingTimeoutRetainsRecentDestinationsWithoutWaitingOnThemAgain() = runTest {
        val chat = JSONObject().put("id", "codex:existing").put("provider", "codex").put("title", "Project")
        val result = AssistantRoutingRecovery.lookup({ delay(60_000); JSONObject() }, { listOf(Triple("codex", listOf(chat), null)) })
        assertTrue(result.fallback)
        assertEquals(10_000, testScheduler.currentTime)
        assertEquals("codex:existing", result.pages.first().second.first().getString("id"))
        assertEquals("choose", result.route.getString("kind"))
        assertFalse(result.route.has("requestId"))
    }
    @Test fun offlineMatchingAndListsStillReturnAnExplicitPicker() = runTest {
        val result = AssistantRoutingRecovery.lookup({ throw java.net.SocketTimeoutException("timeout") }, { throw java.io.IOException("offline") })
        assertTrue(result.fallback)
        assertTrue(result.pages.isEmpty())
        assertTrue(AssistantRoutePicker.options(result.route, emptyList(), "codex").chats.isEmpty())
    }
    @Test fun slowRecentLookupHasIndependentBudget() = runTest {
        val route = JSONObject().put("kind", "new")
        val result = AssistantRoutingRecovery.lookup({ route }, { delay(60_000); emptyList() })
        assertFalse(result.fallback)
        assertSame(route, result.route)
        assertTrue(result.pages.isEmpty())
        assertEquals(2500, testScheduler.currentTime)
    }
    @Test fun cancellationDoesNotBecomeFallbackOrLeaveLookupsRunning() = runTest {
        var stopped = 0
        val lookup = async {
            AssistantRoutingRecovery.lookup({ try { awaitCancellation() } finally { stopped++ } },
                { try { awaitCancellation() } finally { stopped++ } })
        }
        testScheduler.runCurrent()
        lookup.cancel()
        try { lookup.await(); fail("Cancellation expected") } catch (_: CancellationException) {}
        assertEquals(2, stopped)
    }
    @Test fun sendTimeoutExplainsUncertainOutcomeInsteadOfInvitingAnotherSend() {
        val reason = AssistantRoutingRecovery.message(java.net.SocketTimeoutException("timeout"), true)
        assertTrue(reason.contains("same send"))
        assertFalse(reason == "timeout")
        assertTrue(AssistantRoutingRecovery.message(java.io.IOException("timeout"), false).contains("words are kept"))
    }
}
