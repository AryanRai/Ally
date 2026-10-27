package dev.ally.phone
import org.junit.Assert.*
import org.junit.Test
class ProximityCalibrationTest {
 @Test fun smallStableRiseCanOfferSwipeButNoiseOrNoRiseCannot(){assertEquals(ProximityCalibration(-43,-45),ProximityCalibration.adaptive(List(15){-42},List(15){-46}));assertNull(ProximityCalibration.adaptive(List(15){-46},List(15){-46}));assertNull(ProximityCalibration.adaptive(List(15){if(it%2==0)-40 else -50},List(15){-49}))}
 @Test fun overlappingOrMissingSamplesNeverProduceProfile(){assertNull(ProximityCalibration.fit(List(15){-50},List(15){-55}));assertNull(ProximityCalibration.fit(listOf(-40),List(15){-70}))}
 @Test fun separatedDistributionsProduceConservativeThresholds(){assertEquals(ProximityCalibration(-55,-69),ProximityCalibration.fit(List(15){-40},List(15){-70}))}
 @Test fun isolatedOutliersDoNotInvalidateSeparatedDistributions(){assertEquals(ProximityCalibration(-55,-69),ProximityCalibration.fit(List(14){-40}+(-85),List(14){-70}+(-25)))}
 @Test fun alreadyNearNeverActivates(){val g=CalibratedApproach();for(t in 0L..20000L step 200)assertFalse(g.observe(true,false,t))}
 @Test fun genuineApproachWorksAndMustDepartAgain(){val g=CalibratedApproach();for(t in 0L..1400L step 200)assertFalse(g.observe(false,true,t));for(t in 1600L..2200L step 200)assertFalse(g.observe(true,false,t));assertTrue(g.observe(true,false,2400));assertFalse(g.observe(false,false,2600));for(t in 2800L..10000L step 200)assertFalse(g.observe(true,false,t))}
 @Test fun gapsAndMiddleSignalNeverArm(){val g=CalibratedApproach();g.observe(false,true,0);g.observe(false,true,1000);for(t in 1200L..6000L step 200)assertFalse(g.observe(true,false,t));g.reset();for(t in 0L..10000L step 200)assertFalse(g.observe(false,false,t))}
}
