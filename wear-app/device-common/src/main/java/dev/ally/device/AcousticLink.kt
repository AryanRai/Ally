package dev.ally.device
import org.json.JSONObject
object AcousticLink {
 var available=false
 var handler:((JSONObject)->Unit)?=null
 fun disconnected(){available=false;handler?.invoke(JSONObject().put("type","acoustic_disconnected"))}
}
