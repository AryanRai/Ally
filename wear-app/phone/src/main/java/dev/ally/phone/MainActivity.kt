package dev.ally.phone

import android.os.Bundle
import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.ally.device.DeviceInboxActivity
import dev.ally.device.DeviceLink
import org.json.JSONObject

private val Ink = Color(0xff101012)
private val Panel = Color(0xff1c1c20)
private val Line = Color(0xff343438)
private val Muted = Color(0xffa0a0aa)
private val Accent = Color(0xffc1b6ff)
private val Geist = FontFamily(Font(R.font.geist_regular))
private val Mono = FontFamily(Font(R.font.geist_mono))
private val Tanker = FontFamily(Font(R.font.tanker))

class MainActivity : ComponentActivity() {
    private val model: PhoneModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(16,16,18); window.navigationBarColor = android.graphics.Color.rgb(16,16,18)
        setContent { MaterialTheme(colorScheme = darkColorScheme(primary = Accent, background = Ink, surface = Panel, onSurface = Color.White),
            typography = Typography(bodyMedium = androidx.compose.ui.text.TextStyle(fontFamily = Geist, fontSize = 14.sp, lineHeight = 22.sp))) {
            Surface(Modifier.fillMaxSize(), color = Ink, contentColor = Color.White) { PhoneApp(model) }
        } }
    }
    override fun onResume() { super.onResume(); DeviceLink.resume(this) }
}

@Composable
private fun PhoneApp(model: PhoneModel) {
    val state by model.state.collectAsStateWithLifecycle()
    val link by DeviceLink.status.collectAsStateWithLifecycle()
    val inbox by DeviceLink.inbox.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var page by rememberSaveable { mutableStateOf("Chat") }
    var draft by rememberSaveable { mutableStateOf("") }
    var search by rememberSaveable { mutableStateOf("") }
    val scroll = rememberLazyListState()
    LaunchedEffect(state.messages.size, state.busy) { if (state.messages.isNotEmpty()) scroll.animateScrollToItem(scroll.layoutInfo.totalItemsCount.minus(1).coerceAtLeast(0)) }
    LaunchedEffect(Unit) { if (state.selected == null) { page = "Chats"; model.catalog() } }
    Column(Modifier.fillMaxSize().background(Ink).statusBarsPadding().navigationBarsPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                PresenceOrb(Modifier.size(36.dp), state.busy)
                Text("ALLY", fontFamily = Tanker, letterSpacing = 2.sp, fontSize = 27.sp)
            }
            Text(if (link == "Not connected") "ALERTS OFF" else link.uppercase(), color = if (link == "Connected") Accent else Muted, fontFamily = Mono, fontSize = 9.sp,
                modifier = Modifier.clickable { context.startActivity(Intent(context, DeviceInboxActivity::class.java)) })
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("Chat", "Chats", "Inbox", "Settings").forEach { tab ->
                TextButton(onClick = { page = tab; if (tab == "Chats") model.catalog() }, modifier = Modifier.weight(1f)) { Text(if (tab == "Inbox" && inbox.isNotEmpty()) "Inbox · ${inbox.size}" else tab, color = if (page == tab) Color.White else Muted, fontSize = 12.sp) }
            }
        }
        HorizontalDivider(color = Line, thickness = .5.dp)
        when (page) {
            "Chat" -> {
                Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(Modifier.weight(1f).clickable { page = "Chats"; model.catalog() }) {
                        Text(state.selected?.title ?: "Choose a chat", fontFamily = Geist, maxLines = 2, fontSize = 16.sp)
                        Text("${state.provider.uppercase()}  ▾", fontFamily = Mono, color = Muted, fontSize = 10.sp)
                    }
                    var permissions by remember { mutableStateOf(false) }
                    Box { TextButton(onClick = { permissions = true }, enabled = !state.busy) { Text(when (state.permission) { "edit" -> "Edit files"; "full" -> "Full access"; else -> "Read only" }, fontSize = 11.sp) }
                        DropdownMenu(expanded = permissions, onDismissRequest = { permissions = false }) { listOf("readonly" to "Read only", "edit" to "Edit files", "full" to "Full access").forEach { (value, label) -> DropdownMenuItem(text = { Text(label) }, onClick = { model.permission(value); permissions = false }) } }
                    }
                }
                LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = scroll, contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
                    if (state.before != null) item { TextButton(onClick = model::older, enabled = !state.loading) { Text("Earlier messages") } }
                    if (state.messages.isEmpty()) item { Column(Modifier.fillMaxWidth().padding(top = 30.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        PresenceOrb(Modifier.size(120.dp), state.busy); Spacer(Modifier.height(20.dp)); Text("What’s on your mind?", fontSize = 23.sp, fontFamily = Tanker)
                        Text("Your chats, wherever you are.", color = Muted, fontSize = 13.sp)
                    } }
                    items(state.messages, key = { it.id }) { message ->
                        Column(Modifier.fillMaxWidth(), horizontalAlignment = if (message.role == "user") Alignment.End else Alignment.Start) {
                            Text(if (message.role == "user") "YOU" else state.provider.uppercase(), fontFamily = Mono, fontSize = 9.sp, color = Muted, modifier = Modifier.padding(bottom = 6.dp))
                            Text(message.text, fontFamily = Geist, fontSize = 14.sp, lineHeight = 23.sp, modifier = if (message.role == "user") Modifier.widthIn(max = 310.dp).clip(RoundedCornerShape(14.dp)).background(Panel).border(.5.dp, Line, RoundedCornerShape(14.dp)).padding(14.dp) else Modifier.fillMaxWidth())
                        }
                    }
                    if (state.busy) item { Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 1.5.dp); Text(state.activity, color = Muted, fontSize = 12.sp) } }
                    state.approval?.let { approval -> item { ChatApproval(approval, state.loading, model::answer) } }
                    if (state.error.isNotBlank()) item { Text(state.error, color = Color(0xffedbba1), fontSize = 12.sp); TextButton(onClick = model::retry) { Text("Retry connection") } }
                }
                Row(Modifier.fillMaxWidth().padding(14.dp).clip(RoundedCornerShape(18.dp)).background(Panel).border(.5.dp, Line, RoundedCornerShape(18.dp)).padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    TextField(value = draft, onValueChange = { draft = it.take(4000) }, placeholder = { Text("Message Ally…", color = Muted) }, modifier = Modifier.weight(1f), maxLines = 5, colors = TextFieldDefaults.colors(focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent, focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent))
                    Button(onClick = { if (state.busy) model.stop() else { model.send(draft); draft = "" } }, enabled = state.busy || (state.selected != null && draft.isNotBlank() && !state.loading), shape = CircleShape, contentPadding = PaddingValues(12.dp)) { Text(if (state.busy) "Stop" else "↑", fontSize = 16.sp) }
                }
            }
            "Chats" -> LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { Text("Your conversations", fontSize = 26.sp, fontFamily = Tanker); Text("Continue the exact chat on any device.", color = Muted, fontSize = 12.sp) }
                item { Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { listOf("codex", "claude").forEach { provider -> FilterChip(selected = state.provider == provider, onClick = { model.catalog(provider) }, label = { Text(provider.replaceFirstChar { it.uppercase() }) }) }; TextButton(onClick = { model.newChat(); page = "Chat" }, enabled = !state.busy && !state.loading) { Text("+ New") } } }
                item { OutlinedTextField(search, { search = it }, placeholder = { Text("Search chats or folders") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(14.dp)) }
                state.chats.filter { it.title.contains(search, true) || it.cwd.contains(search, true) }.groupBy { it.cwd }.forEach { (folder, chats) ->
                    item { Text(folder.replace('\\', '/').substringAfterLast('/').ifBlank { "OTHER CHATS" }.uppercase(), fontFamily = Mono, fontSize = 10.sp, color = Muted, modifier = Modifier.padding(top = 14.dp)) }
                    items(chats, key = { it.id }) { chat -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Panel).clickable(enabled = !state.busy && !state.loading) { model.select(chat.id); page = "Chat" }.padding(16.dp)) { Text(chat.title.replace(Regex("\\s+"), " "), fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis); Text(chat.provider.uppercase(), color = Muted, fontFamily = Mono, fontSize = 9.sp) } }
                }
                if (state.more != null) item { TextButton(onClick = { model.catalog(more = true) }) { Text("Load more chats") } }
                if (state.loading) item { CircularProgressIndicator(Modifier.size(18.dp)) }
                if (state.error.isNotBlank()) item { Text(state.error, color = Muted); TextButton(onClick = { model.catalog() }) { Text("Retry") } }
            }
            "Inbox" -> LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { Text("For you", fontFamily = Tanker, fontSize = 28.sp); Text("Notes and requests from your connected desktop.", color = Muted, fontSize = 12.sp) }
                if (inbox.isEmpty()) item { Text("All caught up", color = Muted, modifier = Modifier.padding(vertical = 40.dp)) }
                items(inbox, key = { it.optString("id") }) { card -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Panel).border(.5.dp, Line, RoundedCornerShape(16.dp)).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(card.optString("title"), fontSize = 17.sp); Text(card.optString("body"), color = Muted)
                    if (card.optBoolean("command")) TextButton(onClick = { context.startActivity(Intent(context, DeviceInboxActivity::class.java)) }) { Text("Review request →") }
                    else TextButton(onClick = { DeviceLink.dismiss(context, card.optString("id")) }) { Text("Dismiss") }
                } }
            }
            else -> Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Text("Make yourself at home", fontFamily = Tanker, fontSize = 28.sp)
                Text("Ally connects to your desktop through your private bridge. Your chats and permission choices stay with the selected conversation.", color = Muted)
                Button(onClick = { context.startActivity(Intent(context, DeviceInboxActivity::class.java)) }, modifier = Modifier.fillMaxWidth()) { Text("Connection, alerts & quiet hours") }
                Text("Keep connected uses an ongoing Android notification. Cards and controls arrive while the connection service is active; controls always ask for your approval.", color = Muted, fontSize = 12.sp)
                Text("Read only is the default. Full access affects new chat messages and does not remove required browser or device confirmations.", color = Muted, fontSize = 12.sp)
                Text("ALLY / ANDROID", fontFamily = Mono, fontSize = 10.sp, color = Muted)
            }
        }
    }
}

@Composable
private fun PresenceOrb(modifier: Modifier, active: Boolean) {
    val rotation by rememberInfiniteTransition(label = "orb").animateFloat(0f, 360f, infiniteRepeatable(tween(if (active) 4000 else 18000, easing = LinearEasing)), label = "rotation")
    Canvas(modifier) { val radius = size.minDimension / 2; drawCircle(Brush.radialGradient(listOf(Accent.copy(alpha = .3f), Ink.copy(alpha = 0f))), radius)
        rotate(rotation) { repeat(7) { i -> drawOval(Brush.sweepGradient(listOf(Accent.copy(alpha = .1f), Color.White.copy(alpha = .75f), Accent.copy(alpha = .1f))), topLeft = androidx.compose.ui.geometry.Offset(radius * .12f + i, radius * .1f + i * 2), size = androidx.compose.ui.geometry.Size(radius * 1.75f - i * 2, radius * 1.7f - i * 4), style = Stroke(1.2f)); rotate(18f) {} } }
    }
}

@Composable
private fun ChatApproval(request: JSONObject, sending: Boolean, answer: (String, Map<String, String>) -> Unit) {
    var values by remember(request.optString("id")) { mutableStateOf<Map<String, String>>(emptyMap()) }
    val fields = request.optJSONArray("fields"); val actions = request.optJSONArray("actions")
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Panel).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(request.optString("title"), color = Accent); Text(request.optString("detail"), fontSize = 12.sp)
        for (i in 0 until (fields?.length() ?: 0)) { val field = fields!!.getJSONObject(i); val id = field.getString("id"); val options = field.optJSONArray("options")
            Text(field.optString("label"), fontSize = 12.sp)
            for (j in 0 until (options?.length() ?: 0)) { val option = options!!.getJSONObject(j); FilterChip(selected = values[id] == option.optString("value"), onClick = { values = values + (id to option.optString("value")) }, label = { Text(option.optString("label")) }, enabled = !sending) }
            if (field.optBoolean("freeText")) OutlinedTextField(values[id] ?: "", { values = values + (id to it.take(4000)) }, visualTransformation = if (field.optBoolean("secret")) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None)
        }
        val complete = (0 until (fields?.length() ?: 0)).all { val f = fields!!.getJSONObject(it); !f.optBoolean("required") || !values[f.getString("id")].isNullOrBlank() }
        for (i in 0 until (actions?.length() ?: 0)) { val action = actions!!.getJSONObject(i); Button(onClick = { answer(action.getString("value"), values) }, enabled = !sending && (complete || action.optString("value") in setOf("decline", "cancel", "reject"))) { Text(action.optString("label")) } }
    }
}
