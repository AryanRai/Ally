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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.cos
import kotlin.math.sin


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
        setContent { MaterialTheme(colorScheme = MaterialTheme.colorScheme.copy(primary = White, onPrimary = Ink)) {
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
            PresenceGlow(state.phase in setOf(Phase.RECORDING, Phase.UPLOADING, Phase.THINKING))
            HorizontalPager(pager, userScrollEnabled = state.phase != Phase.RECORDING) { page ->
                if (page == 0) InputScreen(state, micHint, start, model::finishRecording, model::cancelRecording,
                    { textInput = true }, { settings = true }, { model.mute() }, model::retry)
                else OutputScreen(state, model::send, { scope.launch { pager.animateScrollToPage(0) } }, pulse)
            }
            if (pager.currentPage == 0) Row(Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                repeat(2) { Box(Modifier.size(if (pager.currentPage == it) 5.dp else 4.dp).background(if (pager.currentPage == it) White else Muted.copy(alpha = .35f), CircleShape)) }
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
            Text("ALLY", fontFamily = Tanker, fontSize = 17.sp, lineHeight = 19.sp, letterSpacing = 2.sp)
            Text(state.context.uppercase(), fontFamily = Mono, color = Muted, fontSize = 8.sp, lineHeight = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(3.dp))
            Orb(state.phase, state.microphoneLevel, canTalk, orbSize.value, if (state.phase in setOf(Phase.OFFLINE, Phase.ERROR)) retry else start, finish, cancel)
            Text(when {
                state.muted -> "Paused"
                state.phase == Phase.RECORDING -> "Listening · ${state.recordingSeconds.toInt()}s"
                state.phase == Phase.UPLOADING -> "Sending…"
                state.phase == Phase.THINKING -> "Thinking…"
                state.phase == Phase.OFFLINE -> "Tap to reconnect"
                state.phase == Phase.ERROR -> "Tap to retry"
                !state.voiceReady -> if (state.voiceState in setOf("starting", "loading")) "Voice getting ready" else "Voice unavailable"
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
private fun Orb(phase: Phase, microphoneLevel: Float, enabled: Boolean, diameter: Float, start: () -> Unit, finish: () -> Unit, cancel: () -> Unit) {
    val level by animateFloatAsState(microphoneLevel, tween(100), label = "microphone level")
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val active = lifecycleState.isAtLeast(Lifecycle.State.STARTED) && phase in setOf(Phase.RECORDING, Phase.THINKING, Phase.UPLOADING)
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
        // Soft overlapping energy fields use the same sunset palette as Orbit's EnergyOrb.
        val r = size.minDimension * (.43f + if (phase == Phase.RECORDING) level * .08f else .04f)
        val angle = rotation * Math.PI / 180
        val drift = Offset((cos(angle) * r * .2).toFloat(), (sin(angle) * r * .18).toFloat())
        val offline = phase == Phase.OFFLINE || phase == Phase.ERROR
        val warm = if (offline) Muted else Sunset
        val pink = if (offline) Muted else Rose
        val gold = if (offline) Muted else Amber
        drawCircle(Brush.radialGradient(listOf(pink.copy(alpha = .6f), pink.copy(alpha = .16f), Color.Transparent), center + drift, r), r, center + drift)
        drawCircle(Brush.radialGradient(listOf(warm.copy(alpha = .95f), warm.copy(alpha = .5f), Color.Transparent), center - drift, r * .8f), r * .8f, center - drift)
        drawCircle(Brush.radialGradient(listOf(gold.copy(alpha = .95f), gold.copy(alpha = .3f), Color.Transparent), center + Offset(-r * .15f, -r * .2f), r * .55f), r * .55f, center + Offset(-r * .15f, -r * .2f))
        if (phase == Phase.RECORDING) {
            // Ally's perceptive presence: two quiet eyes appear while it listens.
            for (x in listOf(-.17f, .17f)) drawRoundRect(Ink.copy(alpha = .8f),
                topLeft = center + Offset(r * x - 2.dp.toPx(), -4.dp.toPx()),
                size = androidx.compose.ui.geometry.Size(4.dp.toPx(), 8.dp.toPx()),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(2.dp.toPx()))
        }
    }
}

@Composable
private fun MiniButton(label: String, description: String, action: () -> Unit, enabled: Boolean = true) {
    Box(Modifier.size(40.dp).clip(CircleShape).background(Panel).border(1.dp, Hairline, CircleShape).clickable(enabled = enabled, onClick = action)
        .semantics { contentDescription = description; role = Role.Button }, contentAlignment = Alignment.Center) {
        Text(label, color = if (enabled) White else Muted.copy(alpha = .4f), fontSize = 15.sp)
    }
}

@Composable
private fun OutputScreen(state: WatchState, send: (String) -> Unit, back: () -> Unit, pulse: (Boolean) -> Unit) {
    val working = state.phase in setOf(Phase.THINKING, Phase.UPLOADING)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 25.dp, vertical = 30.dp),
        horizontalAlignment = Alignment.Start, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(state.context.uppercase(), fontFamily = Mono, color = Muted, fontSize = 9.sp,
            modifier = Modifier.align(Alignment.CenterHorizontally))
        if (state.transcript.isNotBlank()) Text(state.transcript, color = White, fontSize = 12.sp, lineHeight = 16.sp,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Panel).border(1.dp, Hairline, RoundedCornerShape(6.dp)).padding(10.dp))
        state.steps.forEach { step -> key(state.turnId, step.id) { ActivityRow(step) } }
        if (working) Text(state.detail, color = Muted, fontSize = 11.sp)
        if (state.phase == Phase.ERROR || state.phase == Phase.OFFLINE) Text(state.detail, color = Amber, fontSize = 11.sp)
        if (state.reply.text.isNotBlank()) {
            Text(state.reply.text, fontSize = 13.sp, lineHeight = 18.sp)
            state.reply.cards.forEachIndexed { index, card -> key(state.turnId, index, card) { GeneratedCard(card, send, pulse, !working && state.phase != Phase.RECORDING) } }
            if (state.usage.isNotBlank()) Text(state.usage, fontFamily = Mono, color = Muted, fontSize = 8.sp, lineHeight = 12.sp)
        } else if (!working && state.steps.isEmpty() && state.phase !in setOf(Phase.ERROR, Phase.OFFLINE)) {
            Spacer(Modifier.height(12.dp))
            Text("What’s on your mind?", fontSize = 19.sp, textAlign = TextAlign.Center)
            Text("Answers and agent activity appear here.", color = Muted, fontSize = 12.sp, textAlign = TextAlign.Center)
            Button(onClick = back) { Text("Talk to Ally") }
        }
        Text("‹ Swipe back to talk", color = Muted, fontSize = 9.sp, modifier = Modifier.align(Alignment.CenterHorizontally))
    }
}

@Composable
private fun ActivityRow(step: WatchStep) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().heightIn(min = 40.dp).clickable { expanded = !expanded }.padding(vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Box(Modifier.size(4.dp).background(when (step.status) { "running" -> Sunset; "error" -> Rose; else -> Muted }, CircleShape))
            Text(step.label, color = if (step.status == "running") White else Muted, fontSize = 11.sp, maxLines = 2,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(if (expanded) "−" else "+", color = Muted, fontSize = 12.sp)
        }
        if (expanded) Text(step.detail.ifBlank { "No additional detail" }, fontFamily = Mono, color = Muted, fontSize = 9.sp,
            lineHeight = 13.sp, modifier = Modifier.fillMaxWidth().background(Panel).padding(8.dp))
    }
}

@Composable
private fun GeneratedCard(card: WatchCard, send: (String) -> Unit, pulse: (Boolean) -> Unit, enabled: Boolean) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Panel).border(1.dp, Hairline, RoundedCornerShape(6.dp)).padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(card.title, color = White, fontSize = 13.sp, lineHeight = 17.sp)
        if (card.body.isNotBlank()) Text(card.body, color = Color.White, fontSize = 12.sp, lineHeight = 16.sp)
        when (card.type) {
            "checklist" -> card.items.forEach { item ->
                var checked by rememberSaveable(item) { mutableStateOf(false) }
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { checked = !checked }.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text(if (checked) "✓" else "○", color = White)
                    Text(item, color = if (checked) Muted else Color.White, fontSize = 12.sp, lineHeight = 16.sp)
                }
            }
            "actions" -> card.actions.forEach { action -> Button(onClick = { send(action.prompt) }, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text(action.label, fontSize = 12.sp) } }
            "progress" -> {
                Box(Modifier.fillMaxWidth().height(5.dp).clip(CircleShape).background(Ink)) { Box(Modifier.fillMaxWidth(card.progress).fillMaxHeight().background(White)) }
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
        Text(title, color = White, fontSize = 15.sp)
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
        Text("Your Ally", color = White, fontSize = 18.sp)
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
        textStyle = TextStyle(color = Color.White, fontSize = 13.sp, fontFamily = Geist), cursorBrush = SolidColor(White),
        visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
        decorationBox = { inner -> if (value.isEmpty()) Text(hint, color = Muted, fontSize = 12.sp); inner() })
}
