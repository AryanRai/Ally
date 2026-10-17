package dev.ally.watch

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CardParserTest {
    @Test fun unknownWidgetsAreIgnoredAndValuesAreBounded() {
        val reply = CardParser.parse(JSONObject("""{"text":"Ready","components":[{"type":"html","body":"bad"},{"type":"timer","seconds":999999},{"type":"progress","progress":2},{"type":"actions","actions":[{"label":"More","prompt":"Explain"},{"label":"bad"}]}]}"""))
        assertEquals("Ready", reply.text)
        assertEquals(3, reply.cards.size)
        assertEquals(86400, reply.cards[0].seconds)
        assertEquals(1f, reply.cards[1].progress)
        assertEquals(listOf(WatchAction("More", "Explain")), reply.cards[2].actions)
    }
}
