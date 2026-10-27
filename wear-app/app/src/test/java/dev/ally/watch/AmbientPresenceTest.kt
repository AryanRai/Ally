package dev.ally.watch

import dev.ally.device.AssistantAgent
import org.junit.Assert.*
import org.junit.Test

class AmbientPresenceTest {
    private fun agent(id: String, status: String = "running", detail: String = "Working…", text: String = "") =
        AssistantAgent(id, "Chat $id", "codex", status, detail, false, 1, text, id)
    private val idle = WatchState(phase = Phase.IDLE)

    @Test fun idleWhenNothingIsActive() {
        val p = AmbientPresenceModel.build(listOf(agent("a", "completed")), false, idle)
        assertEquals(AmbientMood.IDLE, p.mood)
        assertEquals("All quiet", p.headline)
        assertTrue(p.agents.isEmpty())
    }

    @Test fun headlineUsesRealDetailAndCountsAgents() {
        val p = AmbientPresenceModel.build(listOf(agent("a", detail = "Running tests"), agent("b")), false, idle)
        assertEquals(AmbientMood.WORKING, p.mood)
        assertEquals("2 agents running", p.headline)
        assertEquals(listOf("Running tests", "Working"), p.agents.map { it.status })
    }

    @Test fun genericDetailFallsBackToLatestPublicSentence() {
        val p = AmbientPresenceModel.build(listOf(agent("a", text = "Read the config. **Now updating** the parser.")), false, idle)
        assertEquals("Now updating the parser.", p.agents.single().status)
    }

    @Test fun needsInputIsAttentionAndListedFirst() {
        val p = AmbientPresenceModel.build(listOf(agent("a"), agent("b", "needs_input")), false, idle)
        assertEquals(AmbientMood.ATTENTION, p.mood)
        assertEquals("Needs you", p.headline)
        assertEquals("Chat b", p.agents.first().title)
    }

    @Test fun ownTurnContributesItsRunningStepWithoutDuplicates() {
        val own = idle.copy(phase = Phase.THINKING, turnId = "t", chatId = "a", chatSessionKey = "codex:a", chatTitle = "Mine",
            steps = listOf(WatchStep("1", "Ran npm test", "done", ""), WatchStep("2", "Editing parser", "running", "")))
        assertEquals(listOf("Editing parser"), AmbientPresenceModel.build(listOf(agent("a")), false, own).agents.map { it.status })
        val alone = AmbientPresenceModel.build(emptyList(), false, own)
        assertEquals(listOf("Mine"), alone.agents.map { it.title })
        assertEquals("1 agent running", alone.headline)
        assertEquals(listOf("Editing parser"), alone.agents.map { it.status })
    }

    @Test fun staleAndOfflineNeverInventProgress() {
        assertEquals(AmbientMood.OFFLINE, AmbientPresenceModel.build(emptyList(), true, idle).mood)
        val p = AmbientPresenceModel.build(listOf(agent("a")), true, idle)
        assertEquals(AmbientMood.WORKING, p.mood)
        assertEquals("Status may be out of date", p.note)
    }

    @Test fun verbsRotateAndShiftStaysSmall() {
        assertNotEquals(AmbientPresenceModel.verb(0), AmbientPresenceModel.verb(1))
        assertTrue(AmbientPresenceModel.verb(-3).endsWith("…"))
        (0L..40L).map { AmbientPresenceModel.shift(it) }.forEach { (x, y) -> assertTrue(kotlin.math.abs(x) <= 3 && kotlin.math.abs(y) <= 3) }
        assertEquals(9, (0L..8L).map { AmbientPresenceModel.shift(it) }.toSet().size)
    }
}
