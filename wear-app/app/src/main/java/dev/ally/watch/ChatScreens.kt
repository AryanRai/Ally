package dev.ally.watch

import dev.ally.device.AttachmentView

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Button

@Composable
internal fun ChatPicker(model: WatchViewModel, state: WatchState, back: () -> Unit, chosen: () -> Unit = back) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (isActive) { model.refreshRunning(); delay(5000) }
        }
    }
    val scroll = rememberLazyListState()
    var query by remember { mutableStateOf("") }
    var expanded by remember(state.chatProvider) { mutableStateOf(setOf<String>()) }
    val folders = remember(state.chats, query) { chatFolders(state.chats, query) }
    LazyColumn(Modifier.fillMaxSize().background(Ink).bezelScroll(scroll), state = scroll, contentPadding = PaddingValues(horizontal = 25.dp, vertical = 30.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("‹", fontSize = 22.sp, modifier = Modifier.clickable(onClick = back).semantics { contentDescription = "Back" }.padding(8.dp))
            Text("Chats", fontFamily = Tanker, fontSize = 20.sp)
            Text("+", color = if (model.canSwitchChat) White else Muted, fontSize = 22.sp,
                modifier = Modifier.clickable(enabled = model.canSwitchChat) { model.newChat(state.chatProvider); chosen() }.semantics { contentDescription = "New chat" }.padding(8.dp))
        } }
        item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("codex", "claude").forEach { provider ->
                Text(if (provider == "codex") "Codex" else "Claude", color = if (state.chatProvider == provider) White else Muted,
                    fontSize = 12.sp, modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(Panel).clickable { model.listChats(provider) }.padding(10.dp))
            }
        } }
        if (!model.canSwitchChat) item { Text("Finish recording to switch chats", color = Muted, fontSize = 10.sp) }
        item { Text(if (state.chatProvider == "codex") "Codex chats" else "Claude chats", fontFamily = Tanker, fontSize = 20.sp) }
        item { Field(query, { query = it }, "Find chat or folder") }
        item { Text("RUNNING · ${state.running.size}", fontFamily = Mono, color = Amber, fontSize = 10.sp, modifier = Modifier.fillMaxWidth()) }
        items(state.running.filter { it.title.contains(query, true) || it.cwd.contains(query, true) }, key = { "running:${it.id}" }) { chat ->
            ChatChoice(chat, state.chatId, model.canSwitchChat) { model.selectChat(chat.id); chosen() }
        }
        if (state.runningStatus.isNotBlank()) item { Text(state.runningStatus, color = Muted, fontSize = 10.sp) }
        if (query.isBlank() && state.chats.isNotEmpty()) {
            item { Text("RECENT", fontFamily = Mono, color = Muted, fontSize = 10.sp, modifier = Modifier.fillMaxWidth()) }
            items(state.chats.sortedByDescending { it.updatedAt }.take(3), key = { "recent:${it.id}" }) { chat -> ChatChoice(chat, state.chatId, model.canSwitchChat) { model.selectChat(chat.id); chosen() } }
        }
        item { Text("PROJECTS & FOLDERS", fontFamily = Mono, color = Muted, fontSize = 10.sp, modifier = Modifier.fillMaxWidth()) }
        folders.forEach { folder ->
            val open = folder.path in expanded || query.isNotBlank()
            item(key = "folder:${folder.path}") {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Panel).clickable { expanded = if (folder.path in expanded) expanded - folder.path else expanded + folder.path }.padding(12.dp)) {
                    Text("${if (open) "▾" else "▸"} ${folder.title} · ${folder.chats.size}", color = White, fontSize = 13.sp, maxLines = 2)
                    if (folder.parent.isNotBlank()) Text(folder.parent, color = Muted, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (open) items(folder.chats, key = { "folder-chat:${it.id}" }) { chat -> ChatChoice(chat, state.chatId, model.canSwitchChat) { model.selectChat(chat.id); chosen() } }
        }
        if (query.isNotBlank() && folders.isEmpty()) item { Text("No matching chats in the loaded list", color = Muted, fontSize = 11.sp) }
        if (state.loadingChats) item { Text("Loading chats…", color = Muted, fontSize = 11.sp) }
        if (state.chatError.isNotBlank()) item { Text(state.chatError, color = Amber, fontSize = 11.sp); Button(onClick = { model.listChats(state.chatProvider) }) { Text("Retry") } }
        if (!state.loadingChats && state.chats.isEmpty() && state.chatError.isBlank()) item { Text("No chats yet", color = Muted, fontSize = 12.sp) }
        if (state.chatsOffset != null && !state.loadingChats) item { Button(onClick = { model.listChats(state.chatProvider, true) }) { Text("More chats") } }
        item { Button(onClick = back) { Text("Back") } }
    }
}

@Composable
internal fun ChatChoice(chat: WatchChat, selected: String?, enabled: Boolean, choose: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(if (chat.id == selected) White.copy(alpha = .12f) else Panel)
        .clickable(enabled = enabled, onClick = choose).heightIn(min = 48.dp).padding(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
        Text((if (chat.id == selected) "✓ " else "") + chat.title, color = White, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (chat.unread) Box(Modifier.padding(start = 6.dp).size(5.dp).background(androidx.compose.ui.graphics.Color(0xFF60A5FA), androidx.compose.foundation.shape.CircleShape).semantics { contentDescription = "Unread reply" })
        }
        Text("${if (chat.provider == "codex") "Codex" else "Claude"} · " + chat.cwd.replace('\\', '/').substringAfterLast('/').ifBlank { "Other chats" }, color = Muted, fontSize = 9.sp, maxLines = 1)
    }
}

@Composable
internal fun HistoryScreen(state: WatchState, send: (String) -> Unit, back: () -> Unit, pulse: (Boolean) -> Unit, chats: () -> Unit, older: () -> Unit, read: (String) -> Unit, stopAudio: () -> Unit, readerVisible: Boolean, viewed: suspend (dev.ally.device.ChatReadReceipt) -> Unit, openQueue: () -> Unit = {}) {
    val deviceInbox by dev.ally.device.DeviceLink.inbox.collectAsState()
    val sessionKey = (state.chats + state.quickChats + state.running).firstOrNull { it.id == state.chatId }?.sessionKey
    val requests = dev.ally.device.DeviceInteractions.forChat(deviceInbox,state.chatId,state.chatSessionKey,sessionKey,state.readReceipt?.key)
    val timeline = dev.ally.device.DeviceInteractions.timeline(requests,state.messages,{it.id},{it.timestamp})
    val working = state.externalRunning || state.phase in setOf(Phase.THINKING, Phase.UPLOADING)
    val scroll = rememberLazyListState()
    LaunchedEffect(requests.filter { dev.ally.device.DeviceInteractions.awaiting(it) }.map { it.optString("id") }) { if(requests.any { dev.ally.device.DeviceInteractions.awaiting(it) }) { withFrameNanos { }; scroll.animateScrollToItem((scroll.layoutInfo.totalItemsCount-1).coerceAtLeast(0)) } }
    val readerLifecycle = LocalLifecycleOwner.current.lifecycle
    val receipt = state.readReceipt
    val latestReplyId = state.messages.lastOrNull { it.role == "assistant" }?.id
    LaunchedEffect(receipt, latestReplyId, readerVisible, working) {
        if (receipt?.unread == true && readerVisible && !working && latestReplyId != null) {
            readerLifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                while (isActive) {
                    delay(500)
                    if (scroll.layoutInfo.visibleItemsInfo.any { it.key == latestReplyId }) viewed(receipt)
                    delay(2000)
                }
            }
        }
    }
    LaunchedEffect(state.chatId, state.readySequence, state.messages.isEmpty()) {
        if (state.messages.isNotEmpty()) {
            withFrameNanos { }
            val headerItems = 1 + (if (state.queue.items.isNotEmpty()) 1 else 0) + (if (state.historyBefore != null) 1 else 0) + (if (state.loadingHistory) 1 else 0) + (if (state.speaking) 1 else 0) + (if (state.speechError.isNotBlank()) 1 else 0)
            val answer = timeline.indexOfLast { it.message?.role == "assistant" }.takeIf { it >= 0 } ?: timeline.lastIndex
            scroll.scrollToItem(headerItems + answer)
        }
    }
    LaunchedEffect(state.turnId, state.liveText.isNotBlank()) {
        if (working && state.liveText.isNotBlank()) {
            withFrameNanos { }
            scroll.scrollToItem((scroll.layoutInfo.totalItemsCount - 3).coerceAtLeast(0))
        }
    }
    LazyColumn(Modifier.fillMaxSize().bezelScroll(scroll), state = scroll, contentPadding = PaddingValues(horizontal = 25.dp, vertical = 30.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("${state.context.uppercase()} ▾", fontFamily = Mono, color = Muted, fontSize = 9.sp, maxLines = 2,
            modifier = Modifier.fillMaxWidth().clickable(onClick = chats).padding(vertical = 6.dp), textAlign = TextAlign.Center) }
        if (state.historyBefore != null) item { Button(onClick = older, enabled = !state.loadingHistory && !working) { Text("Earlier messages") } }
        if (state.queue.items.isNotEmpty()) item(key="queue") { Button(onClick=openQueue,modifier=Modifier.fillMaxWidth()) { Text("Queued · ${state.queue.items.size}",fontSize=11.sp) } }
        if (state.loadingHistory) item { Text("Loading conversation…", color = Muted, fontSize = 11.sp) }
        if (state.speaking) item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { ReplyAudioControl(true, true, stopAudio) } }
        if (state.speechError.isNotBlank()) item { Text(state.speechError, color = Amber, fontSize = 10.sp) }
        items(timeline, key = { it.id }) { entry ->
            entry.request?.let { DeviceInteractionCard(it) }
            entry.message?.let { message ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (message.role == "user") Text(message.reply.text, color = White, fontSize = 12.sp, lineHeight = 16.sp,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Panel).border(1.dp, Hairline, RoundedCornerShape(6.dp)).padding(10.dp))
                else {
                    message.steps.forEach { step -> key(message.id, step.id) { ActivityRow(step) } }
                    if (message.reply.text.isNotBlank()) RichReply(message.reply.text)
                    message.reply.cards.forEachIndexed { index, card -> key(message.id, index, card) { GeneratedCard(card, send, pulse, !working && !state.loadingHistory && state.phase != Phase.RECORDING) } }
                    AttachmentView(message.attachments, compact = true)
                    val spokenText = remember(message.reply) { message.reply.readAloudText() }
                    if (spokenText.isNotBlank()) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                        ReplyAudioControl(state.speaking, state.speaking || (!state.muted && state.phase != Phase.RECORDING && !state.inputRecording && !state.inputSending)) {
                            if (state.speaking) stopAudio() else read(spokenText)
                        }
                    }
                    if (message.usage.isNotBlank()) Text(message.usage, fontFamily = Mono, color = Muted, fontSize = 8.sp)
                }
                if (message.role == "user") AttachmentView(message.attachments, compact = true)
            }
            }
        }
        if (state.liveText.isNotBlank() || state.liveAttachments.isNotEmpty()) item(key = "live-reply") {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(if (working) "Reply in progress" else "Partial reply", color = Muted, fontSize = 10.sp)
                RichReply(state.liveText)
                AttachmentView(state.liveAttachments, compact = true)
            }
        }
        if (working) item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (state.transcript.isNotBlank()) Text(state.transcript, color = White, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().background(Panel).padding(10.dp))
                state.steps.forEach { step -> key(state.turnId, step.id) { ActivityRow(step) } }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    androidx.wear.compose.material3.CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    Text(if (state.externalRunning) "Thinking · working in another app…" else state.detail, color = Muted, fontSize = 11.sp)
                }
            }
        }
        if (state.phase in setOf(Phase.ERROR, Phase.OFFLINE)) item { Text(state.detail, color = Amber, fontSize = 11.sp) }
        if (requests.isEmpty() && state.messages.isEmpty() && !working && !state.loadingHistory) item {
            Text("What’s on your mind?", fontSize = 19.sp, textAlign = TextAlign.Center)
            Text("Your conversation will stay here.", color = Muted, fontSize = 12.sp)
            Button(onClick = back) { Text("Talk to Ally") }
        }
        item { Text("‹ Swipe back to talk", color = Muted, fontSize = 9.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) }
    }
}
