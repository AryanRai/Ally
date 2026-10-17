package dev.ally.watch

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ActivityParserTest {
    @Test fun parsesStatusesAndIgnoresUnknownStates() {
        val steps = ActivityParser.steps(JSONObject("""{"steps":[{"id":"a","name":"shell","status":"running","detail":"pwd"},{"id":"b","status":"invented"},{"id":"c","name":"Read","status":"error"}]}"""))
        assertEquals(2, steps.size)
        assertEquals("Running shell", steps[0].label)
        assertEquals("pwd", steps[0].detail)
        assertEquals("Failed · Read", steps[1].label)
    }
    @Test fun missingMetricsAreNotInvented() {
        assertEquals("", ActivityParser.usage(JSONObject("{}")))
        assertEquals("0 out · 2s", ActivityParser.usage(JSONObject("""{"usage":{"outputTokens":0,"durationMs":2500}}""")))
        assertEquals("", ActivityParser.usage(JSONObject("""{"usage":{"inputTokens":-1,"costUsd":-1}}""")))
    }
}
