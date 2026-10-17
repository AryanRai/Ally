package dev.ally.watch

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.cos
import kotlin.math.sin

private val Ink = Color(0xFF070D12)
private val Mint = Color(0xFF91E8D1)
private val Muted = Color(0xFF8B9DA7)
private val Panel = Color(0xFF142129)

class MainActivity : ComponentActivity() {
    private val model: WatchViewModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Development provisioning through ADB; release builds ignore launch extras.
        if (BuildConfig.DEBUG) {
            val endpoint = intent.getStringExtra("endpoint")
            val token = intent.getStringExtra("token")
            if (endpoint != null && token != null) model.configure(endpoint, token)
        }
        setContent { MaterialTheme(colorScheme = MaterialTheme.colorScheme.copy(primary = Mint, onPrimary = Ink)) {
            WatchApp(model, ::pulse, { checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED })
        } }
    }
    override fun onResume() { super.onResume(); model.foreground = true; model.refresh() }
    override fun onStop() { model.foreground = false; model.cancelRecording(); super.onStop() }
    private fun pulse(long: Boolean) {
        if (!model.state.value.muted) getSystemService(Vibrator::class.java)?.vibrate(
            VibrationEffect.createOneShot(if (long) 80 else 28, VibrationEffect.DEFAULT_AMPLITUDE))
    }
}

@Composable
private fun WatchApp(model: WatchViewModel, pulse: (Boolean) -> Unit, hasMic: () -> Boolean) {
    val state by model.state.collectAsStateWithLifecycle()
    val pager = rememberPagerState { 2 }
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var settings by rememberSaveable { mutableStateOf(false) }
    var textInput by rememberSaveable { mutableStateOf(false) }
    var micHint by remember { mutableStateOf(false) }
    val requestMic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> micHint = !granted }
    val start = {
        if (hasMic()) { micHint = false; model.startRecording() }
        else requestMic.launch(Manifest.permission.RECORD_AUDIO)
    }
    LaunchedEffect(state.phase) {
        if (state.phase == Phase.RECORDING || state.phase == Phase.UPLOADING) pulse(false)
    }
    LaunchedEffect(state.readySequence) {
        if (state.readySequence > 0) { pulse(true); pager.animateScrollToPage(1) }
    }
    LaunchedEffect(lifecycle) { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
        while (true) { delay(15000); model.refresh() }
    } }
    when {
        settings -> SettingsScreen(model, state, { settings = false })
        textInput -> TextEntry("Ask Ally", "What’s on your mind?", { text -> model.send(text); textInput = false }, { textInput = false })
        else -> Box(Modifier.fillMaxSize().background(Ink)) {
            HorizontalPager(pager, userScrollEnabled = state.phase != Phase.RECORDING) { page ->
                if (page == 0) InputScreen(state, micHint, start, model::finishRecording, model::cancelRecording,
                    { textInput = true }, { settings = true }, { model.mute() }, model::retry)
                else OutputScreen(state, model::send, { scope.launch { pager.animateScrollToPage(0) } }, pulse)
            }
            Row(Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                repeat(2) { Box(Modifier.size(if (pager.currentPage == it) 5.dp else 4.dp).background(if (pager.currentPage == it) Mint else Muted.copy(alpha = .35f), CircleShape)) }
            }
        }
    }
}

@Composable
private fun InputScreen(state: WatchState, micHint: Boolean, start: () -> Unit, finish: () -> Unit, cancel: () -> Unit,
    type: () -> Unit, settings: () -> Unit, mute: () -> Unit, retry: () -> Unit) {
    val canTalk = !state.muted && state.phase !in setOf(Phase.UPLOADING, Phase.THINKING)
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val orbSize = maxHeight * .34f
        Column(Modifier.fillMaxSize().padding(horizontal = 24.dp, vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center) {
            Text("ALLY", color = Mint, fontSize = 12.sp, lineHeight = 14.sp, letterSpacing = 4.sp)
            Text(state.context, color = Muted, fontSize = 10.sp, lineHeight = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(3.dp))
            Orb(state.phase, canTalk, orbSize.value, if (state.phase in setOf(Phase.OFFLINE, Phase.ERROR)) retry else start, finish, cancel)
            Text(when {
                state.muted -> "Paused"
                state.phase == Phase.RECORDING -> "Listening…"
                state.phase == Phase.UPLOADING -> "Sending…"
                state.phase == Phase.THINKING -> "Thinking…"
                state.phase == Phase.OFFLINE -> "Tap to reconnect"
                state.phase == Phase.ERROR -> "Tap to retry"
                state.phase == Phase.READY -> "Ready when you are"
                else -> "Hold to talk"
            }, color = Color.White, fontSize = 14.sp, lineHeight = 18.sp)
            Text(if (micHint) "Allow microphone, then hold again" else if (state.detail == "Hold to talk") "Release to send · swipe for replies" else state.detail, color = Muted,
                fontSize = 10.sp, lineHeight = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
                modifier = Modifier.heightIn(min = 20.dp).padding(horizontal = 5.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                MiniButton("Aa", "Type a message", type, state.phase !in setOf(Phase.RECORDING, Phase.UPLOADING, Phase.THINKING))
                MiniButton(if (state.muted) "▶" else "Ⅱ", if (state.muted) "Resume microphone and haptics" else "Pause microphone and haptics", mute)
                MiniButton("···", "Connection and settings", settings)
            }
        }
    }
}

@Composable
private fun Orb(phase: Phase, enabled: Boolean, diameter: Float, start: () -> Unit, finish: () -> Unit, cancel: () -> Unit) {
    val active = phase == Phase.RECORDING || phase == Phase.THINKING || phase == Phase.UPLOADING
    val rotation = if (active) {
        val transition = rememberInfiniteTransition(label = "orb")
        val value by transition.animateFloat(0f, 360f, infiniteRepeatable(tween(4500, easing = LinearEasing)), label = "halo")
        value
    } else 35f
    val currentPhase by rememberUpdatedState(phase)
    val currentStart by rememberUpdatedState(start)
    val currentFinish by rememberUpdatedState(finish)
    val currentCancel by rememberUpdatedState(cancel)
    val currentEnabled by rememberUpdatedState(enabled)
    Canvas(Modifier.size(diameter.dp).semantics {
        contentDescription = if (phase == Phase.RECORDING) "Recording. Release to send." else "Hold to talk to Ally"
        role = Role.Button
        onClick(label = "Start or stop recording") { if (currentPhase == Phase.RECORDING) currentFinish() else if (currentEnabled) currentStart(); true }
    }.pointerInput(Unit) {
        detectTapGestures(onPress = {
            if (currentEnabled) {
                currentStart()
                val released = tryAwaitRelease()
                if (released) currentFinish() else currentCancel()
            }
        })
    }) {
        val color = when (phase) { Phase.RECORDING -> Mint; Phase.THINKING, Phase.UPLOADING -> Color(0xFFB2A4FF); Phase.OFFLINE -> Muted; else -> Mint }
        val r = size.minDimension * .34f
        drawCircle(Brush.radialGradient(listOf(color.copy(alpha = .28f), Color.Transparent), center, r * 1.5f), r * 1.5f)
        drawCircle(Brush.radialGradient(listOf(color.copy(alpha = .9f), Color(0xFF225663), Color(0xFF0E2029)), center - Offset(r * .28f, r * .4f), r * 1.8f), r)
        drawCircle(color.copy(alpha = .65f), r, style = Stroke(1.dp.toPx()))
        drawArc(color.copy(alpha = .6f), rotation, 125f, false,
            topLeft = center - Offset(r * 1.15f, r * 1.15f), size = androidx.compose.ui.geometry.Size(r * 2.3f, r * 2.3f), style = Stroke(1.dp.toPx()))
        val angle = rotation * Math.PI / 180
        drawCircle(color, 2.dp.toPx(), center + Offset((cos(angle) * r * 1.15).toFloat(), (sin(angle) * r * 1.15).toFloat()))
    }
}

@Composable
private fun MiniButton(label: String, description: String, action: () -> Unit, enabled: Boolean = true) {
    Box(Modifier.size(40.dp).clip(CircleShape).background(Panel).clickable(enabled = enabled, onClick = action)
        .semantics { contentDescription = description; role = Role.Button }, contentAlignment = Alignment.Center) {
        Text(label, color = if (enabled) Mint else Muted.copy(alpha = .4f), fontSize = 15.sp)
    }
}

@Composable
private fun OutputScreen(state: WatchState, send: (String) -> Unit, back: () -> Unit, pulse: (Boolean) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 25.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("FOR YOU", color = Mint, fontSize = 11.sp, lineHeight = 15.sp, letterSpacing = 2.sp)
        if (state.reply.text.isBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(if (state.phase == Phase.THINKING) "Ally is on it" else "A little space\nfor big ideas.", textAlign = TextAlign.Center, color = Color.White, fontSize = 19.sp)
            Text("Your answer and useful cards will appear here.", textAlign = TextAlign.Center, color = Muted, fontSize = 12.sp)
            Button(onClick = back) { Text("Talk to Ally") }
        } else {
            if (state.transcript.isNotBlank()) Text(state.transcript, color = Muted, fontSize = 10.sp, lineHeight = 14.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
            Text(state.reply.text, color = Color.White, fontSize = 14.sp, lineHeight = 19.sp)
            state.reply.cards.forEachIndexed { index, card -> key(state.turnId, index, card) { GeneratedCard(card, send, pulse, state.phase !in setOf(Phase.THINKING, Phase.UPLOADING, Phase.RECORDING)) } }
            Text("Swipe back to talk", color = Muted, fontSize = 10.sp)
        }
    }
}

@Composable
private fun GeneratedCard(card: WatchCard, send: (String) -> Unit, pulse: (Boolean) -> Unit, enabled: Boolean) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Panel).padding(13.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(card.title, color = Mint, fontSize = 13.sp, lineHeight = 17.sp)
        if (card.body.isNotBlank()) Text(card.body, color = Color.White, fontSize = 12.sp, lineHeight = 16.sp)
        when (card.type) {
            "checklist" -> card.items.forEach { item ->
                var checked by rememberSaveable(item) { mutableStateOf(false) }
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { checked = !checked }.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text(if (checked) "✓" else "○", color = Mint)
                    Text(item, color = if (checked) Muted else Color.White, fontSize = 12.sp, lineHeight = 16.sp)
                }
            }
            "actions" -> card.actions.forEach { action -> Button(onClick = { send(action.prompt) }, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text(action.label, fontSize = 12.sp) } }
            "progress" -> {
                Box(Modifier.fillMaxWidth().height(5.dp).clip(CircleShape).background(Ink)) { Box(Modifier.fillMaxWidth(card.progress).fillMaxHeight().background(Mint)) }
                Text("${(card.progress * 100).toInt()}%", color = Muted, fontSize = 11.sp)
            }
            "timer" -> {
                var end by rememberSaveable { mutableLongStateOf(0L) }
                var remaining by rememberSaveable { mutableIntStateOf(card.seconds) }
                LaunchedEffect(end) {
                    if (end > 0) while (true) {
                        remaining = ((end - System.currentTimeMillis() + 999) / 1000).toInt().coerceAtLeast(0)
                        if (remaining == 0) { end = 0; pulse(true); break }; delay(250)
                    }
                }
                Text("%02d:%02d".format(remaining / 60, remaining % 60), color = Color.White, fontSize = 24.sp)
                Button(onClick = { if (end > 0) { end = 0; remaining = card.seconds } else { remaining = card.seconds; end = System.currentTimeMillis() + card.seconds * 1000L } }) { Text(if (end > 0) "Reset" else "Start") }
                Text("Keep this card open for the alert", color = Muted, fontSize = 9.sp)
            }
        }
    }
}

@Composable
private fun TextEntry(title: String, hint: String, submit: (String) -> Unit, back: () -> Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    Column(Modifier.fillMaxSize().background(Ink).verticalScroll(rememberScrollState()).padding(horizontal = 27.dp, vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, color = Mint, fontSize = 15.sp)
        Field(text, { text = it.take(4000) }, hint)
        Button(onClick = { submit(text) }, enabled = text.isNotBlank()) { Text("Send") }
        Button(onClick = back) { Text("Back") }
    }
}

@Composable
private fun SettingsScreen(model: WatchViewModel, state: WatchState, back: () -> Unit) {
    var endpoint by remember { mutableStateOf(model.endpoint) }
    var token by remember { mutableStateOf(model.token) }
    val notifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    Column(Modifier.fillMaxSize().background(Ink).verticalScroll(rememberScrollState()).padding(horizontal = 27.dp, vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Your Ally", color = Mint, fontSize = 18.sp)
        Text("A dedicated watch chat", color = Muted, fontSize = 11.sp)
        Button(onClick = { model.provider(if (state.provider == "codex") "claude" else "codex") }, enabled = !model.busy) { Text(if (state.provider == "codex") "Engine · Codex" else "Engine · Claude") }
        Text("Connection", color = Muted, fontSize = 11.sp)
        Field(endpoint, { endpoint = it }, "https://your-bridge")
        Field(token, { token = it }, "Pairing token", secret = true)
        Button(onClick = { model.configure(endpoint, token); back() }, enabled = !model.busy) { Text("Save & connect") }
        Button(onClick = { if (android.os.Build.VERSION.SDK_INT >= 33) notifications.launch(Manifest.permission.POST_NOTIFICATIONS) }) { Text("Enable reply alerts") }
        Button(onClick = back) { Text("Back") }
        Text("Voice records only while held. Release sends; swiping away cancels. Maximum 60 seconds.", color = Muted, fontSize = 10.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun Field(value: String, change: (String) -> Unit, hint: String, secret: Boolean = false) {
    BasicTextField(value, change, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).background(Panel).padding(12.dp),
        textStyle = TextStyle(color = Color.White, fontSize = 13.sp), cursorBrush = SolidColor(Mint),
        visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
        decorationBox = { inner -> if (value.isEmpty()) Text(hint, color = Muted, fontSize = 12.sp); inner() })
}
