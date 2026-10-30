package dev.ally.watch

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ActivityTimelineTest {
    @Test fun questionStaysBetweenItsCommandAndNextUpdate() {
        val request=JSONObject("""{"id":"q","createdAt":25}""")
        val steps=listOf(WatchStep("ask","question","done","",startedAt=20,endedAt=30))
        val rows=ActivityTimeline.rows(listOf(ActivityEntry("tool","tool",stepId="ask"),ActivityEntry("update","update","Continuing")),emptyList(),steps,listOf(request))
        assertEquals(listOf("tool","request","update"),rows.map { it.type })
        assertEquals("q",rows[1].request?.optString("id"))
    }
    @Test fun preservesOrderAndGroupsOnlyAdjacentCommands() {
        val rows = ActivityTimeline.read(JSONObject("""{"timeline":[{"id":"a","type":"update","text":"Checking"},{"id":"b","type":"tool","stepId":"cmd"},{"id":"c","type":"tool","stepId":"read"},{"id":"d","type":"update","text":"Verified"},{"id":"private","type":"reasoning","text":"hidden"}]}"""))
        assertEquals(listOf("update", "tool", "tool", "update"), rows.map { it.type })
        assertEquals(listOf(1, 2, 1), ActivityTimeline.groups(rows).map { it.size })
        assertEquals(rows, ActivityTimeline.rows(rows, listOf("duplicate"), listOf(WatchStep("cmd", "shell", "done", "echo done"))))
    }
    @Test fun legacyFallbackAndDurationNeverInvented() {
        val rows = ActivityTimeline.rows(emptyList(), listOf("Old update"), listOf(WatchStep("cmd", "shell", "done", "echo done")))
        assertEquals(listOf("update", "tool"), rows.map { it.type })
        assertEquals(0L, ActivityTimeline.duration(JSONObject()))
        assertEquals(65000L, ActivityTimeline.duration(JSONObject("""{"usage":{"durationMs":65000}}""")))
        assertEquals(" · 1m 5s", ActivityTimeline.time(65000))
    }
}
