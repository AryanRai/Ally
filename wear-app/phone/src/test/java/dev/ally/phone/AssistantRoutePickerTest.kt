package dev.ally.phone

import dev.ally.device.AssistantEntryPolicy
import dev.ally.device.AssistantRoutePicker
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AssistantRoutePickerTest {
    private fun chat(id: String, title: String, provider: String = "codex", updated: Long = 0) =
        JSONObject().put("id", id).put("title", title).put("provider", provider).put("updatedAt", updated)
    private fun route(kind: String, vararg chats: JSONObject) = JSONObject().put("kind", kind).put("chats", JSONArray(chats.toList()))

    @Test fun suggestsTheTopRankedChatFirstWithNewChatLast() {
        val picker = AssistantRoutePicker.options(route("choose", chat("codex:a", "Ally button"), chat("claude:b", "FPGA", "claude")),
            listOf(chat("codex:c", "Recipes", updated = 5), chat("codex:a", "Ally button", updated = 9)), "codex")
        assertEquals("codex:a", picker.suggested)
        assertEquals(listOf("codex:a", "claude:b", "codex:c", AssistantRoutePicker.NEW), picker.choices.map { it.id })
    }

    @Test fun anIndependentTopicPreselectsNewChatButStillOffersRecentChats() {
        val picker = AssistantRoutePicker.options(route("new"), listOf(chat("codex:old", "Older", updated = 1), chat("claude:new", "Newer", "claude", 7)), "claude")
        assertEquals(AssistantRoutePicker.NEW, picker.suggested)
        assertEquals(listOf(AssistantRoutePicker.NEW, "claude:new", "codex:old"), picker.choices.map { it.id })
        assertEquals("New claude chat", picker.choices.first().title)
    }

    @Test fun theListStaysCompactAndSkipsPlaceholderChats() {
        val recent = (1..12).map { chat("codex:$it", "Chat $it", updated = it.toLong()) } + chat("codex:blank", "New watch chat", updated = 99)
        val picker = AssistantRoutePicker.options(route("choose", chat("codex:3", "Chat 3")), recent, "codex")
        assertEquals(6, picker.choices.size)
        assertEquals(listOf("codex:3", "codex:12", "codex:11", "codex:10", "codex:9", AssistantRoutePicker.NEW), picker.choices.map { it.id })
    }

    @Test fun anEmptyOrUnavailableMatchFallsBackToNewChatWithoutSending() {
        val picker = AssistantRoutePicker.options(JSONObject().put("kind", "choose").put("limited", true), emptyList(), "codex")
        assertEquals(AssistantRoutePicker.NEW, picker.suggested)
        assertEquals(listOf(AssistantRoutePicker.NEW), picker.choices.map { it.id })
    }

    @Test fun unsentPickerWordsCanBeReRecordedButNotAfterSubmission() {
        assertTrue(AssistantEntryPolicy.canReplace(null, null, null, false, "Suggested chat · Send or pick another"))
        assertFalse(AssistantEntryPolicy.canReplace("codex:a", "words", null, false, "Message not confirmed"))
        assertFalse(AssistantEntryPolicy.canReplace(null, null, null, true, "Opening conversation…"))
    }
}
