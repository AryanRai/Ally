package dev.ally.phone
import org.junit.Assert.*
import org.junit.Test
class AcousticTriggerTest {
 @Test fun briefRadioSpikeDoesNotChirp(){val t=AcousticTrigger();assertFalse(t.shouldProbe(-40,0,false,false,false));assertFalse(t.shouldProbe(null,500,false,false,false));assertFalse(t.shouldProbe(-40,1000,false,false,false));assertFalse(t.shouldProbe(-40,2000,false,false,false));assertTrue(t.shouldProbe(-40,2500,false,false,false))}
 @Test fun stationaryPhoneDoesNotLoopChirps(){val t=AcousticTrigger();t.shouldProbe(-45,0,false,false,false);assertTrue(t.shouldProbe(-45,1500,false,false,false));assertFalse(t.shouldProbe(-45,13000,false,false,false));assertTrue(t.shouldProbe(-45,13500,false,false,false));assertFalse(t.shouldProbe(-44,30000,false,false,false));assertFalse(t.shouldProbe(-44,60000,false,false,false));assertTrue(t.shouldProbe(-40,61000,false,false,false))}
 @Test fun busyNearOrVisibleReviewNeverStartsAnotherCheck(){val t=AcousticTrigger();t.shouldProbe(-40,0,false,false,false);assertFalse(t.shouldProbe(-40,1500,true,false,false));assertFalse(t.shouldProbe(-40,1600,false,true,false));assertFalse(t.shouldProbe(-40,1700,false,false,true));assertTrue(t.shouldProbe(-40,1800,false,false,false))}
 @Test fun genuineDepartureAllowsAnotherVisitButKeepsCooldown(){val t=AcousticTrigger();t.shouldProbe(-40,0,false,false,false);assertTrue(t.shouldProbe(-40,1500,false,false,false));assertTrue(t.shouldProbe(-40,13500,false,false,false));t.shouldProbe(null,14000,false,false,false);t.shouldProbe(null,16000,false,false,false);t.shouldProbe(-40,17000,false,false,false);assertFalse(t.shouldProbe(-40,19000,false,false,false));assertTrue(t.shouldProbe(-40,26000,false,false,false))}
}
