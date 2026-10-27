package dev.ally.device
import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject

/** Local adapters only. Socket traffic begins with an explicit Continue action. */
object MediaContinuation {
 var snapshot:((Context,String?,String?)->JSONObject?)?=null
 var review:((Context,JSONObject)->Unit)?=null
 val protocol=MutableStateFlow(false)
 val result=MutableStateFlow<JSONObject?>(null)
 fun ready(enabled:Boolean){protocol.value=enabled}
 fun disconnected(){protocol.value=false;result.value=null}
 fun receive(value:JSONObject){result.value=value}
 fun send(value:JSONObject):Boolean=protocol.value&&DeviceLink.status.value=="Connected"&&DeviceLink.sendControl(value)
}
