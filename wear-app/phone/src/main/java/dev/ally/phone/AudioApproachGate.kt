package dev.ally.phone

/** Coarse radio starts a silent check. Only verified acoustic departure rearms an offered handoff. */
internal class AudioApproachGate {
 private var blocked=false
 fun observe(radioFresh:Boolean,verifiedFar:Boolean):Boolean{
  if(verifiedFar){blocked=false;return false}
  return radioFresh&&!blocked
 }
 fun block(){blocked=true}
 fun waitingForDeparture()=blocked
}
