package dev.ally.phone

import org.junit.Assert.*
import org.junit.Test

class HoldApproachGateTest {
    @Test fun briefSpikesAndThresholdChatterStaySilent() {
        val g=HoldApproachGate()
        for(t in 0L..10000L step 200) assertFalse(g.observe(t%1000<600,t))
    }
    @Test fun sustainedApproachQualifiesAndWithdrawalCancelsImmediately() {
        val g=HoldApproachGate()
        for(t in 0L..600L step 200) assertFalse(g.observe(true,t))
        assertTrue(g.observe(true,800));assertTrue(g.observe(true,1000))
        assertFalse(g.observe(false,1200))
        for(t in 1400L..4200L step 200) assertFalse(g.observe(true,t))
        assertTrue(g.observe(true,4600))
    }
    @Test fun gapsCannotJoinSeparateApproaches() {
        val g=HoldApproachGate();g.observe(true,0);g.observe(true,600)
        assertFalse(g.observe(true,1500));assertFalse(g.observe(true,2100))
        assertTrue(g.observe(true,2300));assertFalse(g.observe(true,3100))
    }
    @Test fun completedHoldCannotRearmFromQualificationOrBackoff() {
        val g=HoldApproachGate();val h=ProximityHold()
        fun sample(near:Boolean,t:Long){val qualified=g.observe(near,t);h.observe(if(h.requiresDeparture())near else qualified,t)}
        for(t in 0L..3800L step 200)sample(true,t)
        assertTrue(h.take(3800))
        sample(false,4000)
        for(t in 4200L..10000L step 200){sample(true,t);assertFalse(h.take(t))}
        assertTrue(h.requiresDeparture())
        for(t in 10200L..11400L step 200)sample(false,t)
        for(t in 11600L..16600L step 200)sample(true,t)
        assertTrue(h.take(16600))
    }
}
