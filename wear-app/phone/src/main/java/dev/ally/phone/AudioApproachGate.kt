package dev.ally.phone

/** Coarse radio starts a silent check. Only verified acoustic departure rearms an offered handoff. */
internal class AudioApproachGate {
 private var blocked=false
 fun observe(radioFresh:Boolean,verifiedFar:Boolean,inFlight:Boolean=false):Boolean{
  if(verifiedFar){blocked=false;return false}
  // Blocking the NEXT offer must not erase the completed hold awaiting the PC receipt.
  return radioFresh&&(!blocked||inFlight)
 }
 fun block(){blocked=true}
 fun waitingForDeparture()=blocked
}
