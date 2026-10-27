package dev.ally.phone
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.*
class AcousticSignalTest {
 @Test fun repeatCheckKeepsThreeSamplesInsteadOfResettingProgress(){assertEquals(listOf(-22.0,-21.0,-20.0),AcousticSignal.retained(listOf(-23.0,-22.0,-21.0),-20.0));assertEquals(listOf(-23.0),AcousticSignal.retained(listOf(-23.0),Double.NaN))}
 @Test fun detectsSyntheticChallengeButRejectsWrongCodeAndSilence(){val code=intArrayOf(0,1,2,3,2,1,0,3);val freq=intArrayOf(1600,2200,2800,3400);val x=ShortArray(32000){i->val j=i-1600;if(j in 0 until 7680&&j%960<640)(4000*sin(2*PI*freq[code[j/960]]*(j%960)/16000)).toInt().toShort()else 0};assertNotNull(AcousticSignal.detect(x,code));assertNull(AcousticSignal.detect(x,IntArray(8){0}));assertNull(AcousticSignal.detect(ShortArray(32000),code));x.fill(0)}
 @Test fun calibrationNeedsSeparatedRepeatMeasurements(){assertNotNull(AcousticSignal.threshold(listOf(-20.0,-21.0,-22.0),listOf(-40.0,-39.0,-41.0)));assertNull(AcousticSignal.threshold(listOf(-20.0,-22.0,-24.0),listOf(-23.0,-24.0,-25.0)))}
}
