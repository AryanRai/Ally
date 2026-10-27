package dev.ally.phone

internal data class ProximityCalibration(val near: Int, val far: Int) {
    companion object {
        /** Suggestion-only profile. Explicit local swipe is mandatory before capture. */
        fun adaptive(near: List<Int>, far: List<Int>): ProximityCalibration? {
            if(near.size<15||far.size<15||(near+far).any{it !in -100..-15})return null
            val n=near.sorted();val f=far.sorted()
            val nm=n[n.size/2];val fm=f[f.size/2]
            val noise=maxOf(n[n.size*3/4]-n[n.size/4],f[f.size*3/4]-f[f.size/4])
            if(nm-fm<maxOf(3,noise+2))return null
            val middle=(nm+fm)/2
            return ProximityCalibration(middle+1,middle-1)
        }
        fun fit(near: List<Int>, far: List<Int>): ProximityCalibration? {
            fun valid(v:List<Int>)=v.size>=15 && v.all{it in -100..-15}
            if(!valid(near)||!valid(far))return null
            val n=near.sorted();val f=far.sorted()
            // Conservative inner quartiles must be separated, not just their averages.
            val weakNear=n[n.size/5];val strongFar=f[f.size*4/5]
            if(weakNear-strongFar<10)return null
            val close=(weakNear+strongFar)/2
            return if(close in -75..-25) ProximityCalibration(close,strongFar+1) else null
        }
    }
}

/** An already-near phone is not an approach. Only actual far samples arm it. */
internal class CalibratedApproach {
    private val gate=HoldApproachGate()
    private var farSince:Long?=null
    private var last:Long?=null
    private var armedUntil=0L
    private var admitted=false
    fun observe(near:Boolean,far:Boolean,now:Long):Boolean {
        if(last?.let{now-it !in 0..700}==true)reset()
        last=now
        if(far){
            if(farSince==null)farSince=now
            if(now-farSince!!>=1200)armedUntil=now+12000
        }else farSince=null
        val allowed=armedUntil>now
        val result=gate.observe(near&&allowed,now)
        if(admitted&&!near){armedUntil=0;admitted=false}
        if(result)admitted=true
        return result
    }
    fun reset(){gate.reset();farSince=null;last=null;armedUntil=0;admitted=false}
}
