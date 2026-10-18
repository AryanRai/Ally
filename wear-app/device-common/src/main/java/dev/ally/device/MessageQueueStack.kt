package dev.ally.device

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject
import kotlin.math.abs

/** Same controls and revision checks on phone and watch; drag handles do not steal chat scrolling. */
@Composable
fun MessageQueueStack(queue: MessageQueue, changing: Boolean, error: String, onChange: (JSONObject) -> Unit,
                      modifier: Modifier = Modifier, compact: Boolean = false) {
    if (queue.items.isEmpty() && error.isBlank()) return
    var order by remember(queue.chatId, queue.revision) { mutableStateOf(queue.items.map { it.id }) }
    var editing by remember(queue.chatId) { mutableStateOf<QueuedMessage?>(null) }
    var editText by remember { mutableStateOf("") }
    var editRevision by remember { mutableLongStateOf(0) }
    val latestChange by rememberUpdatedState(onChange)
    val latestQueue by rememberUpdatedState(queue)
    val latestChanging by rememberUpdatedState(changing)
    LaunchedEffect(queue.revision,changing,error) {
        val item=editing
        if(item!=null && !changing && error.isBlank() && queue.revision>editRevision && queue.items.find { it.id==item.id }?.text==editText) editing=null
    }
    val color = Color(0xffd7dbe7)
    Column(modifier.fillMaxWidth().background(Color(0xff1c1e25), RoundedCornerShape(12.dp)).padding(if(compact) 8.dp else 12.dp)) {
        QueueText("Queued · ${queue.items.size}", color = color, fontSize = if(compact) 12.sp else 13.sp)
        if (error.isNotBlank()) QueueText(error, color=Color(0xffe5b587), fontSize=11.sp)
        Column(Modifier.heightIn(max=if(compact) 240.dp else 210.dp).verticalScroll(rememberScrollState())) {
            order.forEachIndexed { index, id -> key(id) {
                val item = queue.items.find { it.id == id }
                if (item != null) {
                var rowHeight by remember { mutableIntStateOf(80) }
                val editable = !changing && item.state != "sending"
                val move: (Int) -> Unit = { offset ->
                    val moved = order.toMutableList(); val from = moved.indexOf(id); val to = from + offset
                    if (from >= 0 && to in moved.indices) { moved.add(to, moved.removeAt(from)); latestChange(queue.change("reorder", order=moved)) }
                }
                Column(Modifier.fillMaxWidth().onSizeChanged { rowHeight = it.height }.padding(top=8.dp)) {
                    Row {
                        QueueText("⠿", color=color, modifier=Modifier.sizeIn(minWidth=40.dp,minHeight=48.dp)
                            .semantics {
                                contentDescription = "Reorder queued message ${index+1}. Hold and drag"
                                customActions = listOf(CustomAccessibilityAction("Move earlier") { move(-1); true }, CustomAccessibilityAction("Move later") { move(1); true })
                            }.pointerInput(id, queue.chatId) {
                                var distance = 0f; var revision = 0L; var dragged = false
                                detectDragGesturesAfterLongPress(
                                    onDragStart={ distance=0f; revision=latestQueue.revision; dragged=!latestChanging && latestQueue.items.find { it.id==id }?.state != "sending" },
                                    onDragCancel={ order=latestQueue.items.map { it.id } },
                                    onDragEnd={
                                        if(dragged && revision==latestQueue.revision && order!=latestQueue.items.map { it.id }) latestChange(latestQueue.change("reorder",order=order))
                                        else order=latestQueue.items.map { it.id }
                                        dragged=false
                                    },
                                    onDrag={ change, delta ->
                                        if(dragged && !latestChanging && latestQueue.revision==revision) {
                                            change.consume(); distance+=delta.y
                                            if(abs(distance)>rowHeight/2f) {
                                                val from=order.indexOf(id); val to=from+if(distance>0) 1 else -1
                                                if(from>=0 && to in order.indices) { val next=order.toMutableList(); next.add(to,next.removeAt(from)); order=next; distance=0f }
                                            }
                                        }
                                    })
                            })
                        Column(Modifier.weight(1f)) {
                            QueueText(item.text.ifBlank { "Shared attachments" },color=color,fontSize=if(compact) 11.sp else 13.sp,maxLines=3,overflow=TextOverflow.Ellipsis)
                            if(item.attachments.isNotEmpty()) QueueText(item.attachments.joinToString(" · "),color=Color.Gray,fontSize=10.sp,maxLines=1)
                            if(item.state!="queued" || item.error.isNotBlank()) QueueText(item.error.ifBlank { "Sending…" },color=Color(0xffe5b587),fontSize=10.sp)
                        }
                    }
                    if(compact) {
                        Row { QueueButton({ editing=item; editText=item.text; editRevision=queue.revision },enabled=editable,modifier=Modifier.weight(1f)) { QueueText("Edit",fontSize=10.sp) }
                            QueueButton({ onChange(queue.change("cancel",id)) },enabled=editable,modifier=Modifier.weight(1f)) { QueueText("Cancel",fontSize=10.sp) } }
                        QueueButton({ onChange(queue.change("send",id)) },enabled=editable,modifier=Modifier.fillMaxWidth()) { QueueText("Send now",fontSize=10.sp) }
                    } else Row {
                        QueueButton({ editing=item; editText=item.text; editRevision=queue.revision },enabled=editable) { QueueText("Edit") }
                        QueueButton({ onChange(queue.change("send",id)) },enabled=editable) { QueueText("Send now") }
                        QueueButton({ onChange(queue.change("cancel",id)) },enabled=editable) { QueueText("Cancel") }
                    }
                }
            } } }
        }
    }
    editing?.let { item ->
        Dialog(onDismissRequest={editing=null},properties=DialogProperties(usePlatformDefaultWidth=false)) {
            Column(Modifier.padding(if(compact) 20.dp else 24.dp).widthIn(max=400.dp).fillMaxWidth().background(Color(0xff1c1e25),RoundedCornerShape(12.dp)).padding(12.dp).verticalScroll(rememberScrollState())) {
                QueueText("Edit queued message",color=color,fontSize=13.sp)
                if(error.isNotBlank()) QueueText(error,color=Color(0xffe5b587),fontSize=10.sp)
                if(queue.revision!=editRevision) {
                    QueueText("Current: " + (queue.items.find { it.id==item.id }?.text ?: "Message already sent or removed"),color=Color.Gray,fontSize=10.sp)
                    QueueButton({editRevision=queue.revision},enabled=!changing && queue.items.any { it.id==item.id && it.state!="sending" }) { QueueText("Review latest queue",fontSize=11.sp) }
                }
                BasicTextField(editText,{editText=it},textStyle=TextStyle(color=color,fontSize=14.sp),modifier=Modifier.fillMaxWidth().heightIn(min=64.dp).background(Color.Black.copy(alpha=.2f)).padding(8.dp).semantics { contentDescription="Message" })
                Row {
                    QueueButton({ latestChange(queue.change("edit",item.id,editText).put("revision",editRevision)) },enabled=!changing && (editText.isNotBlank() || item.attachments.isNotEmpty()) && editText.length<=12000) { QueueText("Save",color=color,fontSize=12.sp) }
                    QueueButton({editing=null}) {QueueText("Back",color=color,fontSize=12.sp)}
                }
            }
        }
    }
}

@Composable
private fun QueueText(text: String, color: Color = Color(0xffd7dbe7), fontSize: TextUnit = 12.sp, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE, overflow: TextOverflow = TextOverflow.Clip) {
    BasicText(text,modifier,style=TextStyle(color=color,fontSize=fontSize),maxLines=maxLines,overflow=overflow)
}
@Composable
private fun QueueButton(onClick: () -> Unit, enabled: Boolean = true, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier.heightIn(min=48.dp).clickable(enabled=enabled,role=Role.Button,onClick=onClick).padding(horizontal=8.dp,vertical=12.dp),contentAlignment=androidx.compose.ui.Alignment.Center) { content() }
}
