package dev.ally.phone

import org.junit.Assert.*
import org.junit.Test

class PhysicalTapRulesTest {
    @Test fun briefRisingAndFallingShouldersDoNotEraseTheSettledDoubleKnock() {
        val r = PhysicalTapRules()
        r.motion(0f, 0, 8.69f)
        assertFalse(r.motion(3f, 220, 8.69f))
        assertFalse(r.motion(6f, 240, 8.69f))
        assertFalse(r.motion(12f, 260, 8.69f))
        assertFalse(r.motion(5f, 280, 8.69f))
        assertFalse(r.motion(0f, 300, 8.69f))
        assertFalse(r.motion(3f, 420, 8.69f))
        assertFalse(r.motion(7f, 440, 8.69f))
        assertTrue(r.motion(13f, 460, 8.69f))
    }
    @Test fun slowMovementAndRepeatedPeaksInOneImpulseAreNotDoubleKnocks() {
        val r = PhysicalTapRules()
        r.motion(0f, 0, 8f)
        r.motion(3f, 220, 8f)
        assertFalse(r.motion(12f, 500, 8f))
        assertFalse(r.motion(20f, 700, 8f))
        val single = PhysicalTapRules()
        single.motion(0f, 0, 8f)
        assertFalse(single.motion(12f, 250, 8f))
        assertFalse(single.motion(6f, 300, 8f))
        assertFalse(single.motion(14f, 460, 8f))
    }
    @Test fun signalCannotOverwriteCalibrationAndDoesNotRepeatTheSameStatus() {
        val status = PhysicalTapSignalStatus()
        status.hold(1000, 10000)
        assertNull(status.offer(true, 1000))
        assertNull(status.offer(true, 5000))
        assertNull(status.offer(true, 10999))
        assertEquals(true, status.offer(true, 11000))
        assertNull(status.offer(true, 12000))
    }
    @Test fun borderlineSignalFlickerRequiresAStableChangeBeforePublishing() {
        val status = PhysicalTapSignalStatus()
        assertNull(status.offer(true, 0))
        assertEquals(true, status.offer(true, 1200))
        assertNull(status.offer(false, 1400))
        assertNull(status.offer(true, 1700))
        assertNull(status.offer(false, 2100))
        assertNull(status.offer(false, 3200))
        assertEquals(false, status.offer(false, 3300))
        status.hold(3400)
        assertNull(status.offer(false, 4000))
    }
    private fun bound(): PhysicalTapRules = PhysicalTapRules().also { assertTrue(it.bind(PhysicalTapRules.Target("paired-pc", "a".repeat(32), "b".repeat(64), 25000), 0)) }
    private fun nearby(r: PhysicalTapRules, now: Long = 1000) { repeat(3) { r.radio("a".repeat(32), -45, now - it * 100) } }
    @Test fun radioAloneCannotConsumeWithoutCallerGestureAndFreshPairing() {
        val r = bound(); repeat(5) { r.radio("c".repeat(32), -20, 500) }; assertFalse(r.near(1000, -55))
        nearby(r); assertTrue(r.near(1000, -55)); assertNull(r.consume(1000, false, true, -55)); assertNull(r.consume(1000, true, false, -55))
        assertNotNull(r.consume(1000, true, true, -55)); assertNull(r.consume(1001, true, true, -55))
    }
    @Test fun staleOrWeakOrSingleRadioSampleIsRefused() {
        val r = bound(); r.radio("a".repeat(32), -40, 1000); assertFalse(r.near(1000, -55))
        nearby(r); assertFalse(r.near(3000, -55)); assertFalse(r.near(26000, -55))
        val weak = bound(); repeat(4) { weak.radio("a".repeat(32), -80, 1000) }; assertFalse(weak.near(1000, -55))
    }
    @Test fun requiresSettledDoubleImpulseAndRejectsSustainedShaking() {
        val r = bound(); assertFalse(r.motion(0f, 0, 12f)); assertFalse(r.motion(15f, 250, 12f))
        assertFalse(r.motion(0f, 280, 12f)); assertTrue(r.motion(15f, 500, 12f))
        val shaking = bound(); repeat(20) { assertFalse(shaking.motion(18f, it * 80L, 12f)) }
        assertFalse(r.motion(Float.NaN, 1000, 12f))
    }
    @Test fun singleImpulseAndWidelySeparatedKnocksDoNotTrigger() {
        val r = bound(); r.motion(0f, 0, 12f); assertFalse(r.motion(15f, 250, 12f)); r.motion(0f, 300, 12f)
        assertFalse(r.motion(15f, 1200, 12f))
    }
    @Test fun cooldownSurvivesFreshTargetAndDisconnectClear() {
        val r = bound(); nearby(r); assertNotNull(r.consume(1000, true, true, -55))
        r.clear(); r.bind(PhysicalTapRules.Target("paired-pc", "a".repeat(32), "b".repeat(64), 25000), 1500); nearby(r, 2000)
        assertNull(r.consume(2000, true, true, -55)); nearby(r, 6100); assertNotNull(r.consume(6100, true, true, -55))
    }
    @Test fun calibrationRequiresEnoughStableSamplesAndBoundedKnocks() {
        assertNull(PhysicalTapRules.proximityCalibration(listOf(-40, -41)))
        assertNull(PhysicalTapRules.proximityCalibration(listOf(-20, -30, -80, -70, -40)))
        assertEquals(-48, PhysicalTapRules.proximityCalibration(listOf(-40, -41, -42, -43, -44)))
        assertNull(PhysicalTapRules.knockCalibration(2f)); assertNull(PhysicalTapRules.knockCalibration(100f))
        assertEquals(13f, PhysicalTapRules.knockCalibration(20f)!!, .01f)
    }
    @Test fun malformedOrExpiredSocketTargetClearsRadioEvidence() {
        val r = bound(); nearby(r)
        assertFalse(r.bind(PhysicalTapRules.Target("unpaired", "public", "", 20000), 1000)); assertFalse(r.near(1000, -55))
        assertFalse(r.bind(PhysicalTapRules.Target("pc", "a".repeat(32), "b".repeat(64), 1000), 1000))
    }
}
