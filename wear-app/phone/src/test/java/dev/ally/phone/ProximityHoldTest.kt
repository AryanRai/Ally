package dev.ally.phone
import org.junit.Assert.*
import org.junit.Test

class ProximityHoldTest {
    @Test fun restoredPersistentToggleCannotRetriggerUntilFreshDeparture() {
        val h=ProximityHold();h.blockUntilDeparture()
        for(t in 0L..8000L step 200){h.observe(true,t);assertFalse(h.take(t))}
        assertTrue(h.requiresDeparture())
        for(t in 8200L..9400L step 200)h.observe(false,t)
        assertFalse(h.requiresDeparture())
        for(t in 9600L..12600L step 200)h.observe(true,t)
        assertTrue(h.take(12600))
    }
    @Test fun screenChangesCancelProgressButDepartureCanStillRearmWhileInReview() {
        val h = ProximityHold(); for(t in 0L..3000L step 200)h.observe(true,t);assertTrue(h.take(3000))
        for(t in 3200L..4400L step 200){h.observe(false,t);h.cancelProgress()}
        for(t in 4600L..7600L step 200)h.observe(true,t)
        assertTrue(h.take(7600))
    }
    @Test fun staleDepartureSamplesDoNotRearmAndResetRevokesPendingCompletion() {
        val h = ProximityHold();for(t in 0L..3000L step 200)h.observe(true,t);h.take(3000)
        h.observe(false,3200);h.observe(false,5000);h.observe(true,5200)
        for(t in 5400L..8600L step 200)h.observe(true,t)
        assertFalse(h.take(8600));h.reset();assertFalse(h.stillClose(8600));assertEquals(0f,h.progress(8600),0f)
    }
    @Test fun requiresThreeSecondsOfContinuousFreshNearSamples() {
        val h = ProximityHold()
        for (t in 0L..2800L step 200) { h.observe(true, t); assertFalse(h.take(t)) }
        h.observe(true, 3000); assertEquals(1f, h.progress(3000), .01f); assertTrue(h.take(3000)); assertFalse(h.take(3001))
    }
    @Test fun movingAwayResetsRatherThanPausesProgress() {
        val h = ProximityHold(); for(t in 0L..1800L step 200) h.observe(true,t)
        assertTrue(h.progress(1800) > .5f); h.observe(false,1900); assertEquals(0f,h.progress(1900),0f)
        h.observe(true,2000); assertEquals(0f,h.progress(2000),0f); assertFalse(h.take(2200))
    }
    @Test fun missingRadioAndClockReversalCancelImmediately() {
        val h = ProximityHold(); h.observe(true,1000); h.observe(true,1500)
        assertEquals(0f,h.progress(2201),0f); h.observe(true,2300); assertEquals(0f,h.progress(2300),0f)
        h.observe(true,100); assertEquals(0f,h.progress(100),0f)
    }
    @Test fun completedHoldRequiresActualDepartureBeforeRearming() {
        val h = ProximityHold(); for(t in 0L..3000L step 200) h.observe(true,t); assertTrue(h.take(3000))
        for(t in 3200L..8000L step 200) {h.observe(true,t);assertFalse(h.take(t))}
        h.reset();h.observe(true,8100);assertFalse(h.take(8100))
        for(t in 8200L..9400L step 200) h.observe(false,t)
        for(t in 9500L..12500L step 200) h.observe(true,t)
        assertTrue(h.take(12500))
    }
    @Test fun movingAwayAfterCompletionRevokesPendingCapture() {
        val h = ProximityHold();for(t in 0L..3000L step 200)h.observe(true,t);h.take(3000)
        assertTrue(h.stillClose(3100));h.observe(false,3200);assertFalse(h.stillClose(3200))
    }
}
