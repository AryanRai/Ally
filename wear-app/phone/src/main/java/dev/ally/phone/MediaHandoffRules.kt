package dev.ally.phone
import java.net.URI
import java.net.URLDecoder

internal object MediaHandoffRules {
 fun youtube(raw:String?):String?=runCatching{
  val u=URI(raw?.trim()?:return null)
  if(u.scheme!="https"||u.userInfo!=null||u.port!=-1)return null
  val id=when(u.host?.lowercase()){
   "youtu.be"->u.path.trim('/').takeIf{!it.contains('/')}
   "youtube.com","www.youtube.com","m.youtube.com"->if(u.path=="/watch")u.rawQuery?.split('&')?.firstOrNull{it.startsWith("v=")}?.substring(2)?.let{URLDecoder.decode(it,"UTF-8")}else u.path.takeIf{it.startsWith("/shorts/")||it.startsWith("/live/")}?.substringAfterLast('/')
   else->null
  }
  id?.takeIf{it.matches(Regex("[A-Za-z0-9_-]{11}"))}?.let{"https://www.youtube.com/watch?v=$it"}
 }.getOrNull()
 fun position(base:Long,updated:Long,now:Long,speed:Float,playing:Boolean,duration:Long):Long?{
  if(base<0||updated<=0||now-updated !in 0..300000||!speed.isFinite()||speed !in 0f..4f)return null
  val value=base+if(playing)((now-updated)*speed).toLong()else 0L
  return value.coerceAtMost(if(duration>0)duration else 604800000).takeIf{it>=0}
 }
}
