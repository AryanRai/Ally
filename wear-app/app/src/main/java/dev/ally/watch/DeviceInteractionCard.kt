package dev.ally.watch

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.material3.Button
import dev.ally.device.DeviceInteractions
import dev.ally.device.DeviceLink
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject

@Composable
internal fun DeviceInteractionCard(item: JSONObject) {
    val activity = LocalActivity.current ?: return
    val connected by DeviceLink.status.collectAsStateWithLifecycle()
    val sending by DeviceLink.interactionSending.collectAsStateWithLifecycle()
    val errors by DeviceLink.interactionErrors.collectAsStateWithLifecycle()
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(item.optString("id")) { while(true) { delay(1000); now=System.currentTimeMillis() } }
    val id=item.optString("id")
    val request=remember(item.toString()) { ApprovalParser.parse(JSONObject().put("approvals",JSONArray().put(item))) }
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Text(if(DeviceInteractions.awaiting(item,now)) { if(item.optString("kind") == "question") "YOUR ANSWER NEEDED" else "YOUR APPROVAL NEEDED" } else { if(item.optString("kind") == "question") "QUESTION" else "APPROVAL" },fontSize=10.sp,color=if(DeviceInteractions.awaiting(item,now)) Amber else Muted)
        if(request != null && DeviceInteractions.canAnswer(item,connected == "Connected",DeviceLink.service?.connectionId,now)) {
            ApprovalScreen(request,id in sending,errors[id].orEmpty(),{action,values -> DeviceLink.answerInteraction(activity,item,action,values)},embedded=true)
        } else {
            Text(item.optString("title"),fontSize=13.sp)
            if(item.optString("detail").isNotBlank()) Text(item.optString("detail"),fontSize=11.sp,color=Muted)
            DeviceInteractions.answerSummary(item).takeIf { it.isNotBlank() }?.let { Text(it,fontSize=11.sp) }
            Text(if(item.optString("interactionState") == "pending" && item.optLong("expiresAt") > now) "Reconnect to answer" else DeviceInteractions.status(item,now),fontSize=11.sp,color=Muted)
            if(item.optBoolean("authorized") && item.optLong("expiresAt") > now) Button({DeviceLink.continueAuthorized(activity,item)}) { Text("Continue action") }
        }
    }
}
