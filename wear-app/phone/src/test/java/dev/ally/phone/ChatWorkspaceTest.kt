package dev.ally.phone

import dev.ally.device.ChatWorkspace
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.runCurrent
import org.junit.Test
import org.junit.Assert.*

@OptIn(ExperimentalCoroutinesApi::class)
class ChatWorkspaceTest {
    private class Chat(val id: String) {
        val state = MutableStateFlow("$id:idle")
        val approval = "$id:approval"
        val retry = "$id:request"
    }
    @Test fun switchingKeepsTwoRunsAndTheirApprovalAndRetryTargetsIndependent() = runTest {
        val workspace = ChatWorkspace(this, "a", ::Chat, { it.state })
        val a = workspace.current
        val finishA = CompletableDeferred<Unit>()
        val jobA = launch { a.state.value = "a:running"; finishA.await(); a.state.value = "a:done" }
        runCurrent()
        workspace.open("b"); val b = workspace.current
        val finishB = CompletableDeferred<Unit>()
        val jobB = launch { b.state.value = "b:approval"; finishB.await(); b.state.value = "b:done" }
        runCurrent()
        assertEquals("b:approval", workspace.state.value)
        finishA.complete(Unit); runCurrent()
        assertEquals("b:approval", workspace.state.value)
        assertEquals("b:approval", workspace.current.approval)
        assertEquals("b:request", workspace.current.retry)
        workspace.open("a"); runCurrent()
        assertSame(a, workspace.current); assertEquals("a:done", workspace.state.value)
        finishB.complete(Unit); runCurrent()
        assertEquals("a:done", workspace.state.value)
        assertTrue(jobA.isCompleted); assertTrue(jobB.isCompleted)
        coroutineContext[kotlinx.coroutines.Job]!!.children.forEach { it.cancel() }
    }
    @Test fun delayedHistoryNeverReplacesTheVisibleChatAndRestoredRunsAreReused() = runTest {
        var made = 0
        val workspace = ChatWorkspace(this, "a", { Chat(it).also { made++ } }, { it.state })
        workspace.restore(listOf("a", "b")); val a = workspace.current
        workspace.open("b"); runCurrent()
        a.state.value = "a:late-history"; runCurrent()
        assertEquals("b:idle", workspace.state.value)
        workspace.open("a"); runCurrent()
        assertEquals("a:late-history", workspace.state.value); assertEquals(2, made)
        coroutineContext[kotlinx.coroutines.Job]!!.children.forEach { it.cancel() }
    }
    @Test fun newlyCreatedChatKeepsItsOriginalControllerAndRequestReceipts() = runTest {
        val workspace = ChatWorkspace(this, "draft", ::Chat, { it.state })
        val original = workspace.current
        workspace.alias("real-id"); runCurrent()
        workspace.open("other"); workspace.open("real-id"); runCurrent()
        assertSame(original, workspace.current)
        coroutineContext[kotlinx.coroutines.Job]!!.children.forEach { it.cancel() }
    }
}
