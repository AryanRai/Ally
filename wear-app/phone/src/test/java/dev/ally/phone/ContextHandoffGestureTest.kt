package dev.ally.phone

import dev.ally.device.ContextHandoffGesture
import dev.ally.device.ContextHandoffGesture.Gesture
import org.junit.Assert.*
import org.junit.Test

class ContextHandoffGestureTest {
    @Test fun proximityIsOnlyEligibilityAndDeliberateGestureIsOneShot() {
        var time=0L;val hints=ContextHandoffGesture({time})
        assertFalse(hints.review(Gesture.KNOCK,"pc",true,true))
        hints.proximity("pc",true,true)
        assertFalse(hints.review(Gesture.KNOCK,"other",true,true))
        assertFalse(hints.review(Gesture.KNOCK,"pc",false,true))
        assertFalse(hints.review(Gesture.KNOCK,"pc",true,false))
        assertTrue(hints.review(Gesture.KNOCK,"pc",true,true))
        assertFalse(hints.review(Gesture.KNOCK,"pc",true,true))
        hints.proximity("pc",true,true);time=1000
        assertFalse(hints.review(Gesture.NFC,"pc",true,true))
    }
    @Test fun staleUnauthenticatedOrWithdrawnProximityCannotProposeReview() {
        var time=0L;val hints=ContextHandoffGesture({time})
        hints.proximity("pc",false,true);assertFalse(hints.review(Gesture.NFC,"pc",true,true))
        hints.proximity("pc",true,true);time=3001;assertFalse(hints.review(Gesture.NFC,"pc",true,true))
        hints.proximity("pc",true,true);hints.proximity("pc",true,false)
        assertFalse(hints.review(Gesture.NFC,"pc",true,true))
        time=6000;hints.proximity("pc",true,true);assertTrue(hints.review(Gesture.NFC,"pc",true,true))
        time=12000;hints.proximity("pc",true,true);hints.clear();assertFalse(hints.review(Gesture.KNOCK,"pc",true,true))
    }
}
