package dev.ally.phone

import dev.ally.device.*
import dev.ally.device.voice.SerialNarration
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProgressNarrationTest {
    @Test fun deltaPollingReconnectAndFinalNeverRepeatAnUpdate() {
        val cursor=ProgressReadCursor()
        val partial=LiveProgress("a","Checking",false,"commentary")
        assertTrue(cursor.updates("turn",listOf(partial),true).isEmpty())
        val complete=partial.copy(text="Checked.",complete=true)
        assertEquals(listOf("Checked."),cursor.updates("turn",listOf(complete),true))
        assertTrue(cursor.updates("turn",listOf(complete),true).isEmpty())
        assertTrue(cursor.claimFinal("turn"));assertFalse(cursor.claimFinal("turn"))
    }
    @Test fun muteAndStopDoNotAccumulateCatchupSpeechAndNewTurnCanRead() {
        val cursor=ProgressReadCursor();val row=LiveProgress("a","Checking.",true,"commentary")
        assertTrue(cursor.updates("turn",listOf(row),false).isEmpty())
        assertTrue(cursor.updates("turn",listOf(row),true).isEmpty())
        cursor.stop("turn");assertTrue(cursor.updates("turn",listOf(row.copy(id="b")),true).isEmpty())
        assertEquals(listOf("Checking."),cursor.updates("new",listOf(row),true))
    }
    @Test fun finalSkipsOnlyTheExactStudyPrefixAlreadyQueued() {
        val cursor=ProgressReadCursor()
        cursor.updates("turn",listOf(LiveProgress("say1","First.",true,"study")),true)
        assertEquals("Final.",cursor.finalText("turn","First.\n\nFinal."))
        assertEquals("Another answer.",cursor.finalText("turn","Another answer."))
    }
    @Test fun finalWaitsForProgressAndStopWithdrawsEveryPendingUpdate() = runTest {
        val output=mutableListOf<String>();val queue=SerialNarration(this)
        queue.enqueue { output.add("progress start");delay(100);output.add("progress end") }
        queue.enqueue { output.add("final") }
        runCurrent();assertEquals(listOf("progress start"),output)
        advanceUntilIdle();assertEquals(listOf("progress start","progress end","final"),output)
        queue.enqueue { output.add("new progress");delay(100);output.add("must not finish") }
        queue.enqueue { output.add("must not start") }
        runCurrent();queue.stop();advanceUntilIdle()
        assertFalse(output.contains("must not finish"));assertFalse(output.contains("must not start"))
    }
}
