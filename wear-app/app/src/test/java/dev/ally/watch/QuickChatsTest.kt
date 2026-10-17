package dev.ally.watch

import org.junit.Assert.*
import org.junit.Test

class QuickChatsTest {
    private fun chat(id: String, time: Long, provider: String = "codex") = WatchChat(id, provider, "Same title", "C:/Ally", time)

    @Test fun keepsExactIdentitiesAndBothProvidersWithRunningFirst() {
        val groups = quickChatGroups(listOf(chat("active", 4), chat("active", 4)),
            listOf(chat("active", 4), chat("native-one", 2), chat("native-two", 3, "claude")))
        assertEquals(listOf("active"), groups.running.map { it.id })
        assertEquals(listOf("native-two", "native-one"), groups.recent.map { it.id })
    }

    @Test fun limitsRecentWithoutHidingRunningChats() {
        val groups = quickChatGroups((1..8).map { chat("running-$it", it.toLong()) }, (1..10).map { chat("recent-$it", it.toLong()) })
        assertEquals(8, groups.running.size)
        assertEquals(6, groups.recent.size)
        assertEquals("recent-10", groups.recent.first().id)
    }
}
