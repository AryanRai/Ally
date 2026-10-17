package dev.ally.phone

import dev.ally.device.ReplyContentParser
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ReplyContentTest {
    @Test fun retainsAllSixResearchSectionsAndTheirLinks() {
        val cards = (1..6).joinToString(",") { """{"type":"card","title":"Section $it","body":"Details and [Paper](https://example.org/$it)"}""" }
        val reply = ReplyContentParser.parse(JSONObject("""{"text":"Introduction","components":[$cards]}"""))
        assertEquals(6, reply.cards.size)
        assertEquals("Details and [Paper](https://example.org/6)", reply.cards.last().body)
    }
    @Test fun keepsChecklistAndSuggestedFollowupContentButRejectsUnknownWidgets() {
        val reply = ReplyContentParser.parse(JSONObject("""{"text":"","components":[{"type":"checklist","items":["One","Two"]},{"type":"actions","actions":[{"label":"Continue","prompt":"More detail"}]},{"type":"script","body":"ignored"}]}"""))
        assertEquals(listOf("One", "Two"), reply.cards.first().items)
        assertEquals("More detail", reply.cards.last().actions.single().prompt)
        assertEquals(2, reply.cards.size)
    }
}
