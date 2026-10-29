package dev.ally.phone

import dev.ally.device.AssistantRecentChats
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class AssistantRecentChatsTest {
    @Test fun fastClaudePublishesImmediatelyAndSlowCodexStillArrivesAfterOldBudget() = runTest {
        val seen = mutableListOf<AssistantRecentChats.Page>()
        val work = async { AssistantRecentChats.load(mapOf("codex" to 0, "claude" to 0), { engine, _ ->
            delay(if (engine == "codex") 4500 else 100)
            AssistantRecentChats.Page(engine, listOf(JSONObject().put("id", "$engine:original")), 30)
        }, seen::add) }
        testScheduler.advanceTimeBy(2501); testScheduler.runCurrent()
        assertEquals(listOf("claude"), seen.map { it.provider })
        assertFalse(work.isCompleted)
        assertEquals(2, work.await().size)
        assertEquals(listOf("claude", "codex"), seen.map { it.provider })
        assertFalse(seen.any { it.failed })
    }
    @Test fun failedProviderKeepsRetryOffsetAndDoesNotEraseSuccessfulEngine() = runTest {
        val rows = AssistantRecentChats.load(mapOf("codex" to 30, "claude" to 0), { engine, _ ->
            if (engine == "codex") throw java.io.IOException("offline")
            AssistantRecentChats.Page(engine, listOf(JSONObject().put("id", "kept")), null)
        })
        assertTrue(rows.first().failed)
        assertEquals(30, rows.first().next)
        assertEquals("kept", rows.last().chats.first().getString("id"))
    }
    @Test fun resetCancellationStopsBothProvidersWithoutPublishingStaleRows() = runTest {
        var stopped = 0; var published = 0
        val work = async { AssistantRecentChats.load(mapOf("codex" to 0, "claude" to 0), { _, _ ->
            try { awaitCancellation() } finally { stopped++ }
        }, { published++ }) }
        testScheduler.runCurrent(); work.cancel()
        try { work.await(); fail("Expected cancellation") } catch (_: CancellationException) {}
        assertEquals(2, stopped); assertEquals(0, published)
    }
    @Test fun stalledProviderStopsWithinItsOwnBudgetWhileOtherPageRemainsUsable() = runTest {
        val seen = mutableListOf<AssistantRecentChats.Page>()
        val result = AssistantRecentChats.load(mapOf("codex" to 0, "claude" to 0), { engine, _ ->
            if (engine == "codex") awaitCancellation()
            AssistantRecentChats.Page(engine, listOf(JSONObject().put("id", "kept")), null)
        }, { seen.add(it) })
        assertEquals("claude", seen.first().provider)
        assertEquals(18_000, testScheduler.currentTime)
        assertTrue(result.first().failed)
        assertEquals(0, result.first().next)
    }
}
