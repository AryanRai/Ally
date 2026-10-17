package dev.ally.watch

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
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
internal fun ChatPicker(model: WatchViewModel, state: WatchState, back: () -> Unit) {
    val scroll = rememberLazyListState()
    LazyColumn(Modifier.fillMaxSize().background(Ink).bezelScroll(scroll), state = scroll, contentPadding = PaddingValues(horizontal = 25.dp, vertical = 30.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("‹", fontSize = 22.sp, modifier = Modifier.clickable(onClick = back).semantics { contentDescription = "Back" }.padding(8.dp))
            Text("Chats", fontFamily = Tanker, fontSize = 20.sp)
            Text("+", color = if (model.busy) Muted else White, fontSize = 22.sp,
                modifier = Modifier.clickable(enabled = !model.busy) { model.newChat(state.chatProvider); back() }.semantics { contentDescription = "New chat" }.padding(8.dp))
        } }
        item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("codex", "claude").forEach { provider ->
                Text(if (provider == "codex") "Codex" else "Claude", color = if (state.chatProvider == provider) White else Muted,
                    fontSize = 12.sp, modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(Panel).clickable { model.listChats(provider) }.padding(10.dp))
            }
        } }
        if (model.busy) item { Text("Finish this turn before switching chats", color = Muted, fontSize = 10.sp) }
        items(state.chats, key = { it.id }) { chat ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(if (chat.id == state.chatId) White.copy(alpha = .12f) else Panel)
                .clickable(enabled = !model.busy) { model.selectChat(chat.id); back() }.padding(10.dp)) {
                Text((if (chat.id == state.chatId) "• " else "") + chat.title, color = White, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(chat.cwd.substringAfterLast('\\').substringAfterLast('/').ifBlank { chat.provider }, color = Muted, fontSize = 9.sp, maxLines = 1)
            }
        }
        if (state.loadingChats) item { Text("Loading chats…", color = Muted, fontSize = 11.sp) }
        if (state.chatError.isNotBlank()) item { Text(state.chatError, color = Amber, fontSize = 11.sp); Button(onClick = { model.listChats(state.chatProvider) }) { Text("Retry") } }
        if (!state.loadingChats && state.chats.isEmpty() && state.chatError.isBlank()) item { Text("No chats yet", color = Muted, fontSize = 12.sp) }
        if (state.chatsOffset != null && !state.loadingChats) item { Button(onClick = { model.listChats(state.chatProvider, true) }) { Text("More chats") } }
        item { Button(onClick = back) { Text("Back") } }
    }
}

@Composable
internal fun HistoryScreen(state: WatchState, send: (String) -> Unit, back: () -> Unit, pulse: (Boolean) -> Unit, chats: () -> Unit, older: () -> Unit, read: (String) -> Unit, stopAudio: () -> Unit) {
    val working = state.phase in setOf(Phase.THINKING, Phase.UPLOADING)
    val scroll = rememberLazyListState()
    LaunchedEffect(state.chatId, state.readySequence, state.messages.isEmpty()) {
        if (state.messages.isNotEmpty()) {
            withFrameNanos { }
            scroll.scrollToItem((scroll.layoutInfo.totalItemsCount - 1).coerceAtLeast(0))
        }
    }
    LazyColumn(Modifier.fillMaxSize().bezelScroll(scroll), state = scroll, contentPadding = PaddingValues(horizontal = 25.dp, vertical = 30.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("${state.context.uppercase()} ▾", fontFamily = Mono, color = Muted, fontSize = 9.sp, maxLines = 2,
            modifier = Modifier.fillMaxWidth().clickable(onClick = chats).padding(vertical = 6.dp), textAlign = TextAlign.Center) }
        if (state.historyBefore != null) item { Button(onClick = older, enabled = !state.loadingHistory && !working) { Text("Earlier messages") } }
        if (state.loadingHistory) item { Text("Loading conversation…", color = Muted, fontSize = 11.sp) }
        if (state.speaking) item { Button(onClick = stopAudio) { Text("Stop audio") } }
        if (state.speechError.isNotBlank()) item { Text(state.speechError, color = Amber, fontSize = 10.sp) }
        items(state.messages, key = { it.id }) { message ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (message.role == "user") Text(message.reply.text, color = White, fontSize = 12.sp, lineHeight = 16.sp,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Panel).border(1.dp, Hairline, RoundedCornerShape(6.dp)).padding(10.dp))
                else {
                    message.steps.forEach { step -> key(message.id, step.id) { ActivityRow(step) } }
                    if (message.reply.text.isNotBlank()) Text(message.reply.text, fontSize = 13.sp, lineHeight = 18.sp)
                    if (message.reply.text.isNotBlank()) Button(onClick = { if (state.speaking) stopAudio() else read(message.reply.text) }, enabled = !state.muted && state.phase != Phase.RECORDING) { Text(if (state.speaking) "Stop audio" else "Read aloud", fontSize = 11.sp) }
                    message.reply.cards.forEachIndexed { index, card -> key(message.id, index, card) { GeneratedCard(card, send, pulse, !working && !state.loadingHistory && state.phase != Phase.RECORDING) } }
                    if (message.usage.isNotBlank()) Text(message.usage, fontFamily = Mono, color = Muted, fontSize = 8.sp)
                }
            }
        }
        if (working) item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (state.transcript.isNotBlank()) Text(state.transcript, color = White, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().background(Panel).padding(10.dp))
                state.steps.forEach { step -> key(state.turnId, step.id) { ActivityRow(step) } }
                Text(state.detail, color = Muted, fontSize = 11.sp)
            }
        }
        if (state.phase in setOf(Phase.ERROR, Phase.OFFLINE)) item { Text(state.detail, color = Amber, fontSize = 11.sp) }
        if (state.messages.isEmpty() && !working && !state.loadingHistory) item {
            Text("What’s on your mind?", fontSize = 19.sp, textAlign = TextAlign.Center)
            Text("Your conversation will stay here.", color = Muted, fontSize = 12.sp)
            Button(onClick = back) { Text("Talk to Ally") }
        }
        item { Text("‹ Swipe back to talk", color = Muted, fontSize = 9.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center) }
    }
}
