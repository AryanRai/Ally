package dev.ally.watch

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.wear.compose.material3.Button
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

internal data class QuickChatGroups(val running: List<WatchChat>, val recent: List<WatchChat>)

internal fun quickChatGroups(running: List<WatchChat>, recent: List<WatchChat>): QuickChatGroups {
    val active = running.distinctBy { it.id }.sortedByDescending { it.updatedAt }
    val activeIds = active.map { it.id }.toSet()
    return QuickChatGroups(active, recent.distinctBy { it.id }.filterNot { it.id in activeIds }
        .sortedByDescending { it.updatedAt }.take(6))
}

@Composable
internal fun QuickChats(model: WatchViewModel, state: WatchState, back: () -> Unit, allChats: () -> Unit, chosen: () -> Unit) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val scope = rememberCoroutineScope()
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            launch { while (isActive) { model.refreshRunning(); delay(5000) } }
            launch { while (isActive) { model.refreshQuickChats(); delay(15000) } }
        }
    }
    val groups = remember(state.running, state.quickChats) { quickChatGroups(state.running, state.quickChats) }
    val scroll = rememberLazyListState()
    LazyColumn(Modifier.fillMaxSize().background(Ink).bezelScroll(scroll), state = scroll,
        contentPadding = PaddingValues(horizontal = 25.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        item { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("⌄", fontSize = 20.sp, modifier = Modifier.clickable(onClick = back).semantics { contentDescription = "Back to Ally" }.padding(8.dp))
            Text("Switch chat", fontFamily = Tanker, fontSize = 20.sp)
            Text("···", fontSize = 18.sp, modifier = Modifier.clickable(onClick = allChats).semantics { contentDescription = "All chats, search and folders" }.padding(8.dp))
        } }
        if (!model.canSwitchChat) item { Text("Finish this turn or resolve your draft to switch chats.", color = Amber, fontSize = 10.sp, textAlign = TextAlign.Center) }
        item { Text("RUNNING · ${groups.running.size}", fontFamily = Mono, color = Amber, fontSize = 10.sp, modifier = Modifier.fillMaxWidth()) }
        items(groups.running, key = { "running:${it.id}" }) { chat ->
            ChatChoice(chat, state.chatId, model.canSwitchChat) { model.selectChat(chat.id); chosen() }
        }
        if (state.runningStatus.isNotBlank()) item { Text(state.runningStatus, color = Muted, fontSize = 10.sp) }
        item { Text("RECENT", fontFamily = Mono, color = Muted, fontSize = 10.sp, modifier = Modifier.fillMaxWidth()) }
        items(groups.recent, key = { "recent:${it.id}" }) { chat ->
            ChatChoice(chat, state.chatId, model.canSwitchChat) { model.selectChat(chat.id); chosen() }
        }
        if (state.loadingQuickChats && groups.recent.isEmpty()) item { Text("Loading recent chats…", color = Muted, fontSize = 11.sp) }
        if (!state.loadingQuickChats && groups.recent.isEmpty() && state.quickChatsError.isBlank()) item { Text("No other recent chats", color = Muted, fontSize = 11.sp) }
        if (state.quickChatsError.isNotBlank()) item {
            Text(state.quickChatsError, color = Amber, fontSize = 10.sp,
                modifier = Modifier.fillMaxWidth().clickable(enabled = !state.loadingQuickChats) { scope.launch { model.refreshQuickChats() } }.padding(8.dp))
        }
        item { Button(onClick = allChats, modifier = Modifier.fillMaxWidth()) { Text("All chats · search & folders", fontSize = 10.sp) } }
    }
}
