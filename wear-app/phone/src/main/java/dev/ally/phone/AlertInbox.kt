package dev.ally.phone

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.ally.device.*
import kotlinx.coroutines.delay
import org.json.JSONObject

@Composable
internal fun AlertInbox(inbox: List<JSONObject>, chats: List<PhoneChat>, modifier: Modifier, openChat: (String) -> Unit) {
    val activity = LocalActivity.current ?: return
    val connection by DeviceLink.status.collectAsStateWithLifecycle()
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while(true) { delay(1000); now=System.currentTimeMillis() } }
    val ordered=DeviceAlerts.ordered(inbox,now)
    val pending=ordered.filter { DeviceAlerts.blocking(it,now) }
    val recent=ordered.filterNot { DeviceAlerts.blocking(it,now) }
    val known=chats.flatMap { listOf(it.id,it.sessionKey) }
    fun open(item: JSONObject) {
        DeviceAlerts.chat(item,known)?.let { id -> DeviceLink.markAlertViewed(activity,item.optString("id")); openChat(id) }
    }
    LazyColumn(modifier.fillMaxWidth(),contentPadding=PaddingValues(24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item {
            MicroLabel("Your chats, in one place")
            Text("Inbox",fontFamily=Geist,fontSize=29.sp,modifier=Modifier.padding(top=8.dp))
            Text(if(pending.isEmpty()) "You're up to date. Replies and notes are below." else "${pending.size} ${if(pending.size==1) "chat needs" else "chats need"} your attention",color=Muted,fontSize=13.sp,modifier=Modifier.padding(top=8.dp))
        }
        if(ordered.isEmpty()) item { Text("Questions, approvals and finished replies will appear here.",color=Muted,fontSize=14.sp,modifier=Modifier.padding(vertical=40.dp)) }
        listOf("Needs you" to pending,"Updates" to recent).forEach { (section,alerts) ->
            if(alerts.isNotEmpty()) item(key="section:$section") { MicroLabel(section,Modifier.padding(top=12.dp),if(section=="Needs you") Warm else Muted) }
            items(alerts,key={it.optString("id")}) { item ->
                val target=DeviceAlerts.chat(item,known)
                val blocking=DeviceAlerts.blocking(item,now)
                val title=chats.firstOrNull { it.id==target || it.sessionKey==target }?.title
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Panel)
                    .clickable(enabled=target!=null) { open(item) }.padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment=Alignment.CenterVertically) {
                        MicroLabel(DeviceAlerts.kind(item),Modifier.weight(1f),if(blocking) Warm else Muted)
                        if(DeviceAlerts.unread(item)) Box(Modifier.size(6.dp).background(androidx.compose.ui.graphics.Color(0xff60a5fa),CircleShape))
                    }
                    title?.let { Text(it,color=Muted,fontSize=12.sp) }
                    if(item.optBoolean("interaction")) DeviceInteractionCard(item,showHeading=false)
                    else {
                        Text(item.optString("title"),fontSize=17.sp)
                        MessageBody(item.optString("body"))
                        AttachmentView(AttachmentParser.list(item))
                        Text(DeviceAlerts.status(item,now),fontSize=12.sp,color=Muted)
                        if(item.optBoolean("command") && blocking) {
                            Text(item.optString("action").replace('_',' '),fontSize=12.sp,color=Muted)
                            val canDecide=connection=="Connected" && item.optString("_connection")==DeviceLink.service?.connectionId
                            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                                OutlinedButton({DeviceLink.decide(activity,item,false)},enabled=canDecide) { Text("Decline") }
                                Button({DeviceLink.decide(activity,item,true)},enabled=canDecide) { Text("Allow once") }
                            }
                        }
                    }
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                        if(target!=null) OutlinedButton({open(item)},border=BorderStroke(1.dp,Line),modifier=Modifier.heightIn(min=48.dp)) { Text("Open chat") }
                        else Text("Chat link unavailable for this older alert",color=Muted,fontSize=11.sp,modifier=Modifier.weight(1f))
                        if(!blocking) TextButton({DeviceLink.dismiss(activity,item.optString("id"))},modifier=Modifier.heightIn(min=48.dp)) { Text("Dismiss",color=Muted) }
                    }
                }
            }
        }
    }
}
