package dev.ally.phone

import dev.ally.device.AssistantHold
import org.junit.Assert.*
import org.junit.Test

class AssistantHoldTest {
    @Test fun releaseRequiresPressAndIsSentOnce() {
        var starts=0; var releases=0; var cancels=0
        val hold=AssistantHold({starts++},{releases++},{cancels++})
        hold.up(); assertEquals(0,releases)
        hold.down(); hold.down(); hold.up(); hold.up()
        assertEquals(1,starts); assertEquals(1,releases); assertEquals(0,cancels)
    }
    @Test fun dismissAndSwipeCancelWithoutSending() {
        var releases=0; var cancels=0
        val hold=AssistantHold({},{releases++},{cancels++})
        hold.down(); hold.abort(); hold.up(); hold.abort()
        assertEquals(0,releases); assertEquals(1,cancels); assertFalse(hold.held)
        hold.down(); hold.up(); assertEquals(1,releases)
    }
}
