package dev.ally.phone
import kotlin.math.*

/** Matched frequency sequence detection. Signal level is NOT time-of-flight or distance. */
internal object AcousticSignal {
 fun retained(levels:List<Double>,next:Double):List<Double> = if(next.isFinite())(levels.filter{it.isFinite()}+next).takeLast(3) else levels.takeLast(3)
 private val freq=intArrayOf(1600,2200,2800,3400)
 private fun power(x:ShortArray,start:Int,hz:Int):Double{
  val coeff=2*cos(2*PI*hz/16000);var a=0.0;var b=0.0
  for(i in 0 until 640){val c=x[start+i].toDouble()+coeff*a-b;b=a;a=c}
  return (a*a+b*b-coeff*a*b).coerceAtLeast(0.0)/(640.0*640.0)
 }
 fun detect(pcm:ShortArray,symbols:IntArray):Double?{
  if(symbols.size!=8||symbols.any{it !in 0..3}||pcm.size<7680)return null
  var best:Double?=null
  for(start in 0..pcm.size-7680 step 160){
   var sum=0.0;var valid=true
   for(i in 0..7){val powers=freq.map{power(pcm,start+i*960,it)};val expected=powers[symbols[i]];val other=powers.filterIndexed{j,_->j!=symbols[i]}.max()
    if(expected<4.0||expected<other*6){valid=false;break};sum+=expected
   }
   if(valid){val db=10*log10(sum/8/(32768.0*32768.0));if(best==null||db>best!!)best=db}
  }
  return best
 }
 fun threshold(near:List<Double>,far:List<Double>):Double?{
  if(near.size<3||far.size<3||(near+far).any{!it.isFinite()})return null
  val n=near.sorted();val f=far.sorted()
  return if(n.first()-f.last()>=6)(n[n.size/2]+f[f.size/2])/2 else null
 }
}
