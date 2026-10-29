package dev.ally.phone

/** No stationary chirp loop: two bounded attempts per visit, then require a real radio change.
 * Radio schedules checks only; it never substitutes for a matched acoustic result or authentication. */
internal class AcousticTrigger {
 private var stableSince:Long?=null
 private var awaySince:Long?=null
 private var lastAt:Long?=null
 private var lastRssi:Int?=null
 private var attempts=0
 fun shouldProbe(radio:Int?,now:Long,busy:Boolean,near:Boolean,offering:Boolean):Boolean{
  if(radio==null){
   stableSince=null
   if(awaySince==null)awaySince=now
   if(now-awaySince!!>=1500){attempts=0;lastRssi=null}
   return false
  }
  awaySince=null
  if(stableSince==null)stableSince=now
  if(busy||near||offering||now-stableSince!!<1500||lastAt?.let{now-it<12000}==true)return false
  if(attempts>=2&&lastRssi?.let{kotlin.math.abs(radio-it)<4}!=false)return false
  lastAt=now;lastRssi=radio;attempts++;return true
 }
}
