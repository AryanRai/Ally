package dev.ally.phone

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.ally.device.DeviceInteractions
import dev.ally.device.DeviceLink
import kotlinx.coroutines.delay
import org.json.JSONObject

@Composable
internal fun DeviceInteractionCard(item: JSONObject, showHeading: Boolean = true) {
    val activity = LocalActivity.current ?: return
    val connected by DeviceLink.status.collectAsStateWithLifecycle()
    val sending by DeviceLink.interactionSending.collectAsStateWithLifecycle()
    val errors by DeviceLink.interactionErrors.collectAsStateWithLifecycle()
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(item.optString("id")) { while(true) { delay(1000); now = System.currentTimeMillis() } }
    val id = item.optString("id")
    val active = DeviceInteractions.canAnswer(item,connected == "Connected",DeviceLink.service?.connectionId,now)
    Column(Modifier.fillMaxWidth(),verticalArrangement=Arrangement.spacedBy(8.dp)) {
        if(showHeading) MicroLabel(if(DeviceInteractions.awaiting(item,now)) { if(item.optString("kind") == "question") "Ally needs your answer" else "Your approval needed" } else { if(item.optString("kind") == "question") "Question" else "Approval" },color=if(DeviceInteractions.awaiting(item,now)) Warm else Muted)
        if(active) ChatApproval(item,id in sending) { action,values -> DeviceLink.answerInteraction(activity,item,action,values) }
        else Column(Modifier.fillMaxWidth().background(Panel,RoundedCornerShape(14.dp)).padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
            Text(item.optString("title"),fontSize=15.sp)
            if(item.optString("detail").isNotBlank()) Text(item.optString("detail"),color=Muted,fontSize=13.sp)
            DeviceInteractions.answerSummary(item).takeIf { it.isNotBlank() }?.let { Text(it,fontSize=13.sp) }
            Text(if(item.optString("interactionState") == "pending" && item.optLong("expiresAt") > now) "Reconnect to answer this request" else DeviceInteractions.status(item,now),color=Muted,fontSize=12.sp)
            if(item.optBoolean("authorized") && item.optLong("expiresAt") > now) Button({DeviceLink.continueAuthorized(activity,item)},modifier=Modifier.heightIn(min=48.dp)) { Text("Continue on this phone") }
        }
        errors[id]?.let { Text(it,color=Warm,fontSize=12.sp) }
    }
}
