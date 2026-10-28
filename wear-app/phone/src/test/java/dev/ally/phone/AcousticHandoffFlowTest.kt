package dev.ally.phone
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.*

class AcousticHandoffFlowTest {
 @Test fun delayedNoisyDesktopEnvelopeAllowsSwipeAndPendingReceipt(){
  val code=intArrayOf(0,1,2,3,2,1,0,3)
  val freq=intArrayOf(1600,2200,2800,3400)
  // Same 40ms tone/20ms silence and 5ms ramp as chirpWave, arriving late in the 4.2s window.
  val pcm=ShortArray(67200){i->
   val j=i-54037;val p=if(j>=0)j%960 else 0
   val tone=if(j in 0 until 7680&&p<640)4500*minOf(1.0,p/80.0,(640-p)/80.0)*sin(2*PI*freq[code[j/960]]*p/16000) else 0.0
   (tone+20*sin(i*0.31)).toInt().toShort()
  }
  val level=AcousticSignal.detect(pcm,code);pcm.fill(0);assertNotNull(level)
  val gate=AudioApproachGate();val hold=ProximityHold();val consent=ReviewSwipeConsent()
  for(t in 0L..4200L step 50)hold.observe(gate.observe(true,false),t)
  assertEquals(1f,hold.progress(4200),0f)
  consent.offer(4200);assertFalse(consent.authorized(4200))
  // A human can take >5 seconds to read the offered card before swiping.
  consent.confirm(11000,level!! > -50&&hold.progress(11000)>=1f) // stale radio cannot authorize
  assertFalse(consent.authorized(11000));consent.clear()
  for(t in 11000L..14000L step 50)hold.observe(gate.observe(true,false),t)
  consent.offer(14000);consent.confirm(14000,hold.progress(14000)>=1f)
  assertTrue(consent.authorized(14000));assertTrue(hold.take(14000));gate.block()
  for(t in 14050L..16950L step 50){hold.observe(gate.observe(true,false,true),t);assertTrue(hold.stillClose(t))}
  // Loss of actual fresh radio still cancels the completed gesture.
  hold.observe(gate.observe(false,false,true),17000);assertFalse(hold.stillClose(17000))
 }
}
