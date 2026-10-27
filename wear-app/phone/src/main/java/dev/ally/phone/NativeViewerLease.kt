package dev.ally.phone
/** One native capture decision per offer. Never restored or reused after disconnect/Stop. */
internal class NativeViewerLease(private val now:()->Long){
 var id="";private set
 var token="";private set
 private var expires=0L
 private var consumed=false
 fun offer(id:String,token:String,ttl:Long){require(id.matches(Regex("[\\w-]{8,80}"))&&token.matches(Regex("[a-f0-9]{64}"))&&ttl in 1..900000);this.id=id;this.token=token;expires=now()+ttl;consumed=false}
 fun valid(id:String=this.id,token:String=this.token)=id==this.id&&token==this.token&&id.isNotBlank()&&now()<expires
 fun consume():Boolean{if(!valid()||consumed)return false;consumed=true;return true}
 fun remaining()=(expires-now()).coerceAtLeast(0)
 fun clear(){id="";token="";expires=0;consumed=true}
}
