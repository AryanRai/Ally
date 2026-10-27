package dev.ally.phone

/** Proximity can offer, but only a fresh deliberate release can authorize local review. */
internal class ReviewSwipeConsent {
    private var offered:Long?=null
    private var confirmed=false
    val active get()=offered!=null
    fun offer(now:Long){if(offered==null)offered=now}
    fun expired(now:Long)=offered?.let{now-it !in 0..8000}==true
    fun confirm(now:Long,eligible:Boolean){if(active&&!expired(now)&&eligible)confirmed=true}
    fun authorized(now:Long)=active&&!expired(now)&&confirmed
    fun clear(){offered=null;confirmed=false}
}
