package dev.ally.phone
import org.junit.Assert.*
import org.junit.Test
class AudioApproachGateTest {
 @Test fun coarseRadioCanStartSilentCheckWithoutStrictRssiApproach(){val g=AudioApproachGate();assertTrue(g.observe(true,false));assertFalse(g.observe(false,false))}
 @Test fun droppedRadioCannotRearmButVerifiedFarCan(){val g=AudioApproachGate();g.block();assertFalse(g.observe(false,false));assertFalse(g.observe(true,false));assertTrue(g.waitingForDeparture());assertFalse(g.observe(true,true));assertFalse(g.waitingForDeparture());assertTrue(g.observe(true,false))}
 @Test fun silentHoldCanAccumulateWhileAudioCheckRuns(){val g=AudioApproachGate();val h=ProximityHold();for(t in 0L..3000L step 200)h.observe(g.observe(true,false),t);assertEquals(1f,h.progress(3000),0f);assertTrue(h.take(3000));g.block();for(t in 3200L..6000L step 200)h.observe(g.observe(true,false),t);assertFalse(h.take(6000));for(t in 6200L..7600L step 200)h.observe(g.observe(true,true),t);for(t in 7800L..10800L step 200)h.observe(g.observe(true,false),t);assertTrue(h.take(10800))}
}
