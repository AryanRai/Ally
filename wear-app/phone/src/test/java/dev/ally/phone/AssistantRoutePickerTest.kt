package dev.ally.phone

import dev.ally.device.AssistantChoice
import dev.ally.device.AssistantEntryPolicy
import dev.ally.device.AssistantRoutePicker
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AssistantRoutePickerTest {
    @Test fun providerFiltersExposeCodexEvenBehindManyRecentClaudeChatsWithoutChangingDestination() {
        val recent = (1..12).map { chat("claude:$it", "Claude $it", "claude", it.toLong()) } + chat("codex:original", "Study", "codex", 0)
        val picker = AssistantRoutePicker.options(route("choose", recent.first()), recent, "claude")
        assertFalse(ids(AssistantRoutePicker.rows(picker, 5)).contains("codex:original"))
        assertEquals(listOf("codex:original", AssistantRoutePicker.NEW), ids(AssistantRoutePicker.rows(picker, 5, provider = "codex")))
        assertEquals("claude:1", picker.suggested)
        assertEquals("New Claude Code chat · PC", picker.fresh.title)
    }
    private fun chat(id: String, title: String, provider: String = "codex", updated: Long = 0) =
        JSONObject().put("id", id).put("title", title).put("provider", provider).put("updatedAt", updated)
    private fun route(kind: String, vararg chats: JSONObject) = JSONObject().put("kind", kind).put("chats", JSONArray(chats.toList()))
    private fun ids(rows: List<dev.ally.device.AssistantChoice>) = rows.map { it.id }

    @Test fun suggestsTheTopRankedChatFirstWithNewChatLast() {
        val picker = AssistantRoutePicker.options(route("choose", chat("codex:a", "Ally button"), chat("claude:b", "FPGA", "claude")),
            listOf(chat("codex:c", "Recipes", updated = 5), chat("codex:a", "Ally button", updated = 9)), "codex")
        assertEquals("codex:a", picker.suggested)
        assertEquals(listOf("codex:a", "claude:b", "codex:c", AssistantRoutePicker.NEW), ids(AssistantRoutePicker.rows(picker, 5)))
    }

    @Test fun anIndependentTopicPreselectsNewChatButStillOffersRecentChats() {
        val picker = AssistantRoutePicker.options(route("new"), listOf(chat("codex:old", "Older", updated = 1), chat("claude:new", "Newer", "claude", 7)), "claude")
        assertEquals(AssistantRoutePicker.NEW, picker.suggested)
        assertEquals(listOf(AssistantRoutePicker.NEW, "claude:new", "codex:old"), ids(AssistantRoutePicker.rows(picker, 5)))
        assertEquals("New Claude Code chat · PC", picker.fresh.title)
    }

    @Test fun theWindowStaysCompactAndMoreRevealsLaterPages() {
        val recent = (1..12).map { chat("codex:$it", "Chat $it", updated = it.toLong()) } + chat("codex:blank", "New watch chat", updated = 99)
        val picker = AssistantRoutePicker.options(route("choose", chat("codex:3", "Chat 3")), recent, "codex")
        assertEquals(listOf("codex:3", "codex:12", "codex:11", "codex:10", "codex:9", AssistantRoutePicker.NEW), ids(AssistantRoutePicker.rows(picker, 5)))
        assertEquals(11, AssistantRoutePicker.rows(picker, 10).size)
        val paged = AssistantRoutePicker.more(picker, listOf(chat("claude:x", "Older page", "claude", 0), chat("codex:12", "Chat 12")))
        assertEquals("claude:x", paged.chats.last().id)
        assertEquals(picker.chats.size + 1, paged.chats.size)
    }

    @Test fun searchFiltersLoadedChatsAndAddsDesktopHitsWithoutNewChat() {
        val picker = AssistantRoutePicker.options(route("new"), listOf(chat("codex:a", "Ally watch picker"), chat("codex:b", "Dinner")), "codex")
        val hits = AssistantRoutePicker.hits(JSONObject().put("hits", JSONArray(listOf(
            JSONObject().put("provider", "claude").put("id", "s1").put("title", "Old watch notes"),
            JSONObject().put("provider", "bogus").put("id", "s2").put("title", "Ignored")))))
        assertEquals(listOf("claude:s1"), ids(hits))
        assertEquals(listOf("codex:a", "claude:s1"), ids(AssistantRoutePicker.rows(picker, 5, "watch", hits)))
        assertEquals(emptyList<String>(), ids(AssistantRoutePicker.rows(picker, 5, "nothing")))
    }

    @Test fun anEmptyOrUnavailableMatchFallsBackToNewChatWithoutSending() {
        val picker = AssistantRoutePicker.options(JSONObject().put("kind", "choose").put("limited", true), emptyList(), "codex")
        assertEquals(AssistantRoutePicker.NEW, picker.suggested)
        assertEquals(listOf(AssistantRoutePicker.NEW), ids(AssistantRoutePicker.rows(picker, 5)))
    }

    @Test fun unsentPickerWordsCanBeReRecordedButNotAfterSubmission() {
        assertTrue(AssistantEntryPolicy.canReplace(null, null, null, false, "Suggested chat · Send or pick another"))
        assertFalse(AssistantEntryPolicy.canReplace("codex:a", "words", null, false, "Message not confirmed"))
        assertFalse(AssistantEntryPolicy.canReplace(null, null, null, true, "Opening conversation…"))
    }

    @Test fun phoneRequestsSuggestAMatchingPhoneChatOrANewOne() {
        val chats = listOf(AssistantChoice("codex:a", "Phone · Set an alarm for tomorrow", "phone"), AssistantChoice("codex:b", "Phone · Clean home screen widgets page", "phone"))
        val match = AssistantRoutePicker.phoneOptions("Clean my second home screen page", chats)
        assertEquals("codex:b", match.suggested)
        assertEquals(listOf("codex:b", "codex:a"), match.chats.map { it.id })
        assertEquals("codex:b", AssistantRoutePicker.rows(match, 5).first().id)
        val fresh = AssistantRoutePicker.phoneOptions("Open YouTube", chats)
        assertEquals(AssistantRoutePicker.PHONE_NEW, fresh.suggested)
        assertEquals(AssistantRoutePicker.PHONE_NEW, AssistantRoutePicker.rows(fresh, 5).first().id)
        assertEquals(AssistantRoutePicker.PHONE_NEW, AssistantRoutePicker.phoneOptions("anything", emptyList()).suggested)
    }

    @Test fun newChatRowsOfferEveryPlaceToRun() {
        val others = AssistantRoutePicker.newChats("codex", phone = true)
        assertEquals(listOf("New Claude Code chat · PC", "New Codex chat · phone"), others.map { it.title })
        assertEquals("claude", AssistantRoutePicker.newProvider(others[0].id))
        assertEquals(null, AssistantRoutePicker.newProvider(others[1].id))
        assertEquals(listOf("New Codex chat · PC"), AssistantRoutePicker.newChats("claude", phone = false).map { it.title })
        val picker = AssistantRoutePicker.options(JSONObject().put("kind", "new"), listOf(chat("codex:1", "Notes")), "codex")
        assertEquals(listOf(AssistantRoutePicker.NEW, AssistantRoutePicker.NEW_ON + "claude", AssistantRoutePicker.PHONE_NEW, "codex:1"),
            AssistantRoutePicker.rows(picker, 5, otherNew = others).map { it.id })
    }
}
