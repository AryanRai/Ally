package dev.ally.watch

import android.Manifest
import android.content.pm.PackageManager
import android.content.Intent
import androidx.compose.ui.platform.LocalContext
import dev.ally.device.DeviceInboxActivity
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
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
import androidx.wear.compose.foundation.hierarchicalFocusGroup
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch


class MainActivity : ComponentActivity() {
    private val model get() = (application as AllyWatchApplication).model
    private var notificationSequence by mutableIntStateOf(0)
    private val ambient = AmbientController()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycle.addObserver(androidx.wear.ambient.AmbientLifecycleObserver(this, ambient))
        // Development provisioning through ADB; release builds ignore launch extras.
        if (BuildConfig.DEBUG) {
            val endpoint = intent.getStringExtra("endpoint")
            val token = intent.getStringExtra("token")
            if (endpoint != null) {
                // Save before first ViewModel access: its initializer starts connection work.
                val edit = application.getSharedPreferences("ally-watch", 0).edit()
                    .putString("endpoint", endpoint.trim())
                if (token != null) edit.putString("token", token.trim())
                edit.apply()
            }
        }
        setContent { MaterialTheme(colorScheme = MaterialTheme.colorScheme.copy(primary = White, onPrimary = Ink)) {
            AmbientHost(ambient, model) {
                WatchApp(model, ::pulse, { checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED }, notificationSequence)
            }
        } }
    }
    override fun onResume() { super.onResume(); dev.ally.device.DeviceLink.resume(this); model.foreground = true; WatchNotifications.foreground = true; model.refresh(); openRequestChat(intent) }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); openRequestChat(intent) }
    private fun openRequestChat(intent: Intent) {
        dev.ally.device.SurfaceActions.handle(this,intent) { model.openNotification(it); notificationSequence++ }
        if(intent.getBooleanExtra("allyAgentMonitor",false)) { intent.removeExtra("allyAgentMonitor"); window.decorView.post { dev.ally.device.AllyAssistantService.showMonitor() } }
        intent.getStringExtra("openChat")?.let { model.openNotification(it); notificationSequence++; intent.removeExtra("openChat") }
    }
    override fun onStart() { super.onStart(); AmbientOngoing.show(this) }
    override fun onStop() { AmbientOngoing.hide(this); model.foreground = false; WatchNotifications.foreground = false; if (!dev.ally.device.AssistantVisibility.visible) model.cancelRecording(); model.stopSpeaking(); super.onStop() }
    private fun pulse(long: Boolean) {
        if (!model.state.value.muted) getSystemService(Vibrator::class.java)?.vibrate(
            VibrationEffect.createOneShot(if (long) 80 else 28, VibrationEffect.DEFAULT_AMPLITUDE))
    }
}

@Composable
private fun WatchApp(model: WatchViewModel, pulse: (Boolean) -> Unit, hasMic: () -> Boolean, notificationSequence: Int) {
    val state by model.state.collectAsStateWithLifecycle()
    val deviceInbox by dev.ally.device.DeviceLink.inbox.collectAsStateWithLifecycle()
    val pendingRequests = dev.ally.device.DeviceInteractions.pending(deviceInbox)
    val pager = rememberPagerState { 2 }
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var chats by rememberSaveable { mutableStateOf(false) }
    var quickChats by rememberSaveable { mutableStateOf(false) }
    val openChats = { model.listChats(); chats = true }
    val openQuickChats = { quickChats = true }
    var settings by rememberSaveable { mutableStateOf(false) }
    var appearance by rememberSaveable { mutableStateOf(false) }
    var queueOpen by rememberSaveable { mutableStateOf(false) }
    var textInput by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(notificationSequence) { if(notificationSequence > 0) { chats=false; quickChats=false; settings=false; appearance=false; textInput=false; queueOpen=false; pager.scrollToPage(1) } }
    BackHandler(chats || quickChats || settings || textInput || appearance || queueOpen) {
        if (queueOpen) queueOpen = false
        else if (appearance) appearance = false
        else if (chats) chats = false
        else if (quickChats) quickChats = false
        else { chats = false; settings = false; textInput = false }
    }
    var micHint by remember { mutableStateOf(false) }
    val requestMic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> micHint = !granted }
    val requestAlerts = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> model.replyAlerts(granted) }
    LaunchedEffect(Unit) { if (model.shouldRequestAlerts() && android.os.Build.VERSION.SDK_INT >= 33) requestAlerts.launch(Manifest.permission.POST_NOTIFICATIONS) }
    val start = {
        if (hasMic()) { micHint = false; model.startRecording() }
        else requestMic.launch(Manifest.permission.RECORD_AUDIO)
    }
    LaunchedEffect(state.phase, state.inputRecording) {
        if (state.inputRecording || state.phase == Phase.RECORDING || state.phase == Phase.UPLOADING) pulse(false)
    }
    LaunchedEffect(state.readySequence) {
        if (state.readySequence > 0) { pulse(true); if (!state.inputRecording && !state.inputSending) pager.animateScrollToPage(1) }
    }
    LaunchedEffect(state.turnId, state.liveText.isNotBlank()) {
        if (state.phase == Phase.THINKING && state.liveText.isNotBlank() && !state.inputRecording && !state.inputSending) pager.animateScrollToPage(1)
    }
    LaunchedEffect(state.chatId,pendingRequests.map { it.optString("id") }) {
        if(pendingRequests.any { it.optString("chatId") in setOf(state.chatId,state.chatSessionKey,state.readReceipt?.key) } && state.phase != Phase.RECORDING && !state.inputRecording) pager.animateScrollToPage(1)
    }
    LaunchedEffect(lifecycle) { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
        var ticks = 0
        while (true) {
            delay(2500)
            model.refreshUnread()
            if (!quickChats && !chats && !settings && !appearance && !textInput) {
                model.refreshSelected()
                if (++ticks % 6 == 0) model.refresh()
            }
        }
    } }
    val pendingApproval = state.approval?.takeIf { approval -> deviceInbox.none { it.optString("id") == approval.id && it.optBoolean("interaction") } }
    CompositionLocalProvider(LocalBezelHaptics provides !state.muted) { when {
        queueOpen -> Column(Modifier.fillMaxSize().background(Ink).padding(horizontal=22.dp,vertical=22.dp),horizontalAlignment=Alignment.CenterHorizontally) {
            Button(onClick={queueOpen=false},modifier=Modifier.height(40.dp)) { Text("Back to chat",fontSize=11.sp) }
            dev.ally.device.MessageQueueStack(state.queue,state.queueChanging,state.queueError,model::queueChange,Modifier.weight(1f),compact=true)
            if(state.queue.items.isEmpty()) Text("Queue is empty",color=Muted,fontSize=12.sp)
        }
        pendingApproval != null -> ApprovalScreen(pendingApproval, state.answeringApproval, state.approvalError, model::answerApproval)
        chats -> ChatPicker(model, state, { chats = false }, { chats = false; quickChats = false; scope.launch { pager.scrollToPage(0) } })
        quickChats -> QuickChats(model, state, { quickChats = false }, openChats, { quickChats = false; scope.launch { pager.scrollToPage(0) } })
        appearance -> AppearanceScreen(state.look, model::appearance, { appearance = false })
        settings -> SettingsScreen(model, state, { settings = false }, { settings = false; openChats() }, { appearance = true })
        textInput -> TextEntry(if(state.turnId != null) "Add input" else "Ask Ally", "What’s on your mind?", { text -> model.send(text); textInput = false }, { textInput = false }, state.turnId != null || state.externalRunning, state.inputMode, model::inputMode, state.chatId)
        else -> Box(Modifier.fillMaxSize().background(Ink)) {
            PresenceGlow(state.inputRecording || state.inputSending || state.phase in setOf(Phase.RECORDING, Phase.UPLOADING, Phase.THINKING), state.look)
            HorizontalPager(pager, userScrollEnabled = state.phase != Phase.RECORDING && !state.inputRecording) { page ->
                Box(Modifier.fillMaxSize().hierarchicalFocusGroup(pager.currentPage == page && !pager.isScrollInProgress)) {
                if (page == 0) InputScreen(if(state.inputRecording) state.copy(phase=Phase.RECORDING,detail=state.inputStatus) else if(state.inputSending) state.copy(phase=Phase.UPLOADING,detail=state.inputStatus) else if(state.inputStatus.isNotBlank()) state.copy(detail=state.inputStatus) else state, micHint, start, model::finishRecording, model::cancelRecording,
                    { textInput = true }, { settings = true }, { if (state.speaking) model.stopSpeaking() else model.mute() }, model::retry, openQuickChats, model::stop, model::resume,
                    pager.currentPage == 0 && !pager.isScrollInProgress,
                    { scope.launch { pager.animateScrollToPage(1) } })
                else HistoryScreen(state, model::send, { scope.launch { pager.animateScrollToPage(0) } }, pulse, openQuickChats, model::olderMessages, model::readReply, model::stopSpeaking, pager.currentPage == 1 && !pager.isScrollInProgress, model::viewed, { queueOpen=true }, model::stop, model::resume)
                }
            }
            if(pager.currentPage == 0 && state.queue.items.isNotEmpty() && state.phase != Phase.RECORDING && !state.inputRecording) {
                Button(onClick={queueOpen=true},modifier=Modifier.align(Alignment.TopCenter).padding(top=if(pendingRequests.isNotEmpty()) 64.dp else 12.dp).heightIn(min=48.dp)) { Text("Queued · ${state.queue.items.size}",fontSize=11.sp) }
            }
            if(pager.currentPage == 0 && state.phase != Phase.RECORDING && !state.inputRecording) pendingRequests.firstOrNull()?.let { request ->
                Button(onClick={ model.openNotification(request.optString("chatId")); scope.launch { pager.animateScrollToPage(1) } },modifier=Modifier.align(Alignment.TopCenter).padding(top=18.dp).heightIn(min=48.dp)) { Text("Answer request",fontSize=11.sp) }
            }
            if (pager.currentPage == 0 && state.phase != Phase.RECORDING && !state.inputRecording) {
                val threshold = with(androidx.compose.ui.platform.LocalDensity.current) { 18.dp.toPx() }
                val open by rememberUpdatedState(openQuickChats)
                Column(Modifier.align(Alignment.BottomCenter).padding(bottom = 3.dp).width(130.dp).height(32.dp)
                    .pointerInput(Unit) {
                        var distance = 0f
                        detectVerticalDragGestures(onDragStart = { distance = 0f }, onVerticalDrag = { change, amount ->
                            change.consume(); distance += amount
                            if (distance < -threshold) { distance = Float.POSITIVE_INFINITY; open() }
                        })
                    }.clickable(onClick = openQuickChats).semantics { contentDescription = "Swipe up or tap to switch chats" },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Box(Modifier.width(18.dp).height(2.dp).background(Muted, CircleShape))
                    Text("Swipe up · Chats", color = Muted, fontSize = 9.sp, modifier = Modifier.padding(top = 3.dp))
                }
            }
        }
    } }
}

@Composable
private fun InputScreen(state: WatchState, micHint: Boolean, start: () -> Unit, finish: () -> Unit, cancel: () -> Unit,
    type: () -> Unit, settings: () -> Unit, mute: () -> Unit, retry: () -> Unit, chats: () -> Unit, stop: () -> Unit, resume: () -> Unit,
    active: Boolean, replies: () -> Unit) {
    val canTalk = !state.externalRunning && !state.muted && state.phase !in setOf(Phase.UPLOADING)
    BoxWithConstraints(Modifier.fillMaxSize().bezelReplies(active && state.phase != Phase.RECORDING, replies)) {
        val orbSize = maxHeight * .25f
        Column(Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, top = 8.dp, bottom = 34.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center) {
            Text("ALLY", fontFamily = Tanker, fontSize = 17.sp, lineHeight = 19.sp, letterSpacing = 2.sp, modifier = Modifier.clickable(onClick = chats).semantics { contentDescription = "Choose chat" })
            Text("CHATS ▾ · ${state.chatTitle}", fontFamily = Mono, color = Muted, fontSize = 9.sp, lineHeight = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.clickable(onClick = chats).padding(vertical = 2.dp))
            Orb(state.look, if (state.externalRunning) Phase.THINKING else state.phase, state.microphoneLevel, canTalk, orbSize.value, if (state.phase in setOf(Phase.OFFLINE, Phase.ERROR)) retry else start, finish, cancel)
            Text(when {
                state.externalRunning -> "Thinking…"
                state.muted -> "Paused"
                state.speaking -> "Speaking…"
                state.phase == Phase.RECORDING -> "Listening · ${state.recordingSeconds.toInt()}s"
                state.phase == Phase.UPLOADING -> "Sending…"
                state.phase == Phase.THINKING -> "Hold to add input"
                state.phase == Phase.OFFLINE -> "Reconnecting · tap to retry now"
                state.phase == Phase.ERROR -> "Tap to retry"
                !state.voiceReady -> if (state.voiceState in setOf("starting", "loading")) "Voice getting ready" else "Voice unavailable"
                state.phase == Phase.READY -> "Ready when you are"
                else -> "Hold to talk"
            }, color = Color.White, fontSize = 14.sp, lineHeight = 18.sp)
            Text(if (state.externalRunning) "Working in another app" else if (micHint) "Allow microphone, then hold again" else if (state.phase == Phase.RECORDING && state.liveTranscript.isNotBlank()) state.liveTranscript else if (state.detail == "Hold to talk") "Swipe or turn bezel for replies" else state.detail, color = Muted,
                fontSize = 10.sp, lineHeight = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
                modifier = Modifier.heightIn(min = 16.dp).padding(horizontal = 5.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                if (state.canStop || (state.phase == Phase.THINKING && state.turnId != null)) MiniButton("■", "Stop response", stop)
                else if (state.resumeToken != null && !state.externalRunning) MiniButton("▶", "Resume response", resume, state.phase !in setOf(Phase.UPLOADING, Phase.RECORDING))
                MiniButton("Aa", "Type a message", type, state.phase !in setOf(Phase.RECORDING, Phase.UPLOADING))
                MiniButton(if (state.speaking) "■" else if (state.muted) "▶" else "Ⅱ", if (state.speaking) "Stop audio" else if (state.muted) "Resume microphone and haptics" else "Pause microphone and haptics", mute)
                MiniButton("···", "Connection and settings", settings)
            }
        }
    }
}

@Composable
private fun Orb(look: WatchLook, phase: Phase, microphoneLevel: Float, enabled: Boolean, diameter: Float, start: () -> Unit, finish: () -> Unit, cancel: () -> Unit) {
    val currentPhase by rememberUpdatedState(phase)
    val currentStart by rememberUpdatedState(start)
    val currentFinish by rememberUpdatedState(finish)
    val currentCancel by rememberUpdatedState(cancel)
    val currentEnabled by rememberUpdatedState(enabled)
    WatchOrb(look, phase, microphoneLevel, Modifier.size(diameter.dp).semantics {
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
    })
}

@Composable
private fun MiniButton(label: String, description: String, action: () -> Unit, enabled: Boolean = true) {
    Box(Modifier.size(40.dp).clip(CircleShape).background(Panel).border(1.dp, Hairline, CircleShape).clickable(enabled = enabled, onClick = action)
        .semantics { contentDescription = description; role = Role.Button }, contentAlignment = Alignment.Center) {
        Text(label, color = if (enabled) White else Muted.copy(alpha = .4f), fontSize = 15.sp)
    }
}

@Composable
internal fun ActivityRow(step: WatchStep) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().heightIn(min = 40.dp).clickable { expanded = !expanded }.padding(vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Box(Modifier.size(4.dp).background(when (step.status) { "running" -> Sunset; "error" -> Rose; else -> Muted }, CircleShape))
            Text(step.label, color = if (step.status == "running") White else Muted, fontSize = 11.sp, maxLines = 2,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(if (expanded) "−" else "+", color = Muted, fontSize = 12.sp)
        }
        if (expanded) Text("${step.name}\n${step.detail.ifBlank { "No additional detail" }}", fontFamily = Mono, color = Muted, fontSize = 9.sp,
            lineHeight = 13.sp, modifier = Modifier.fillMaxWidth().background(Panel).padding(8.dp))
    }
}

@Composable
internal fun GeneratedCard(card: WatchCard, send: (String) -> Unit, pulse: (Boolean) -> Unit, enabled: Boolean) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Panel).border(1.dp, Hairline, RoundedCornerShape(6.dp)).padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (card.title.isNotBlank()) RichReply(card.title, title = true)
        if (card.body.isNotBlank()) RichReply(card.body)
        when (card.type) {
            "checklist" -> card.items.forEach { item ->
                var checked by rememberSaveable(item) { mutableStateOf(false) }
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable { checked = !checked }.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text(if (checked) "✓" else "○", color = White)
                    Box(Modifier.weight(1f)) { RichReply(item) }
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
private fun TextEntry(title: String, hint: String, submit: (String) -> Unit, back: () -> Unit, working: Boolean = false, mode: String = "queue", onMode: (String) -> Unit = {}, chatId: String? = null) {
    val prefs = dev.ally.device.DeviceLink.prefs(LocalContext.current)
    var text by remember(chatId) { mutableStateOf(prefs.getString("composer:$chatId", "")!!) }
    LaunchedEffect(text, chatId) { prefs.edit().putString("composer:$chatId", text).apply() }
    val scroll = rememberScrollState()
    Column(Modifier.fillMaxSize().background(Ink).bezelScroll(scroll).verticalScroll(scroll).padding(horizontal = 27.dp, vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, color = White, fontSize = 15.sp)
        Field(text, { text = it.take(4000) }, hint)
        if (working) Button(onClick = { onMode(if(mode=="queue") "steer" else "queue") }) { Text(if(mode=="queue") "Mode: Queue" else "Mode: Steer now",fontSize=12.sp) }
        Button(onClick = { submit(text) }, enabled = text.isNotBlank()) { Text(if(working) { if(mode=="queue") "Queue" else "Steer now" } else "Send") }
        Button(onClick = back) { Text("Back") }
    }
}

@Composable
private fun SettingsScreen(model: WatchViewModel, state: WatchState, back: () -> Unit, chats: () -> Unit, appearance: () -> Unit) {
    val deviceContext = LocalContext.current
    var endpoint by remember { mutableStateOf(model.endpoint) }
    var token by remember { mutableStateOf(model.token) }
    val notifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> model.replyAlerts(granted) }
    val scroll = rememberScrollState()
    Column(Modifier.fillMaxSize().background(Ink).bezelScroll(scroll).verticalScroll(scroll).padding(horizontal = 27.dp, vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        AssistantSetting()
        if(state.inputDraft.isNotBlank()) {
            Text(state.inputDraft,color=White,fontSize=11.sp)
            Text(state.inputStatus,color=Amber,fontSize=10.sp)
            Button(onClick=model::retryInput,enabled=!state.inputSending) { Text("Retry added input",fontSize=11.sp) }
            Button(onClick=model::dismissInput,enabled=!state.inputSending) { Text("Dismiss draft",fontSize=11.sp) }
        }
        Text("Your Ally", color = White, fontSize = 18.sp)
        Text(state.chatTitle, color = Muted, fontSize = 11.sp, maxLines = 2)
        Button(onClick = chats) { Text("Choose chat") }
        Button(onClick = { model.cancelRecording(); if(!dev.ally.device.AllyAssistantService.showMonitor()) android.widget.Toast.makeText(deviceContext,"Select Ally as your assistant first",android.widget.Toast.LENGTH_SHORT).show() }) { Text("Agent monitor") }
        Button(onClick = appearance) { Text("Appearance") }
        Text("Voice & alerts", color = Muted, fontSize = 12.sp)
        Button(onClick = { deviceContext.startActivity(Intent(deviceContext, DeviceInboxActivity::class.java)) }) { Text("Cards & device connection", fontSize = 11.sp) }
        Text(if (state.liveSpeech) "Google live voice · Orbit. Audio and reply text go to Google." else "Local speech · hold to record", color = Muted, fontSize = 10.sp, textAlign = TextAlign.Center)
        Button(onClick = { model.autoRead(!state.autoRead) }) { Text(if (state.autoRead) "Auto-read: On" else "Auto-read: Off", fontSize = 12.sp) }
        Button(onClick = { model.readReply("Hello. Ally is ready when you are.") }, enabled = !state.muted) { Text("Test voice", fontSize = 12.sp) }
        Text("Auto-read speaks while Ally is open. Tap Read aloud under any reply. Hold the orb to interrupt.", color = Muted, fontSize = 10.sp, textAlign = TextAlign.Center)
        if (state.speaking) Button(onClick = model::stopSpeaking) { Text("Stop audio") }
        if (state.speechError.isNotBlank()) Text(state.speechError, color = Amber, fontSize = 10.sp)
        Text("Turn the touch bezel to scroll. Enable Touch bezel in the watch’s system settings if needed.", color = Muted, fontSize = 10.sp, textAlign = TextAlign.Center)
        Text("Chat permissions", color = Muted, fontSize = 12.sp)
        listOf("readonly" to "Read only", "edit" to "Edit files", "full" to "Full access").forEach { (value, label) ->
            Button(onClick = { model.permission(value) }, enabled = !model.busy) { Text((if (state.permission == value) "✓ " else "") + label, fontSize = 12.sp) }
        }
        Text(if (state.permission == "full") {
            if (state.provider == "codex") "Unrestricted files. Eligible requests use automatic review. Required browser confirmations still appear."
            else "Claude bypass mode. Browser security checks still apply."
        } else "File access is restricted. Approvals ask you. Applies to new messages in this chat.", color = Muted, fontSize = 10.sp)
        if (state.provider == "claude") Text("Claude uses its CLI permission mode. Interactive watch approvals currently require Codex.", color = Muted, fontSize = 10.sp)
        Button(onClick = { model.provider(if (state.provider == "codex") "claude" else "codex") }, enabled = !model.busy) { Text(if (state.provider == "codex") "New Claude chat" else "New Codex chat") }
        Text("Connection", color = Muted, fontSize = 11.sp)
        Field(endpoint, { endpoint = it }, "https://your-bridge")
        Field(token, { token = it }, "Pairing token", secret = true)
        Button(onClick = { model.configure(endpoint, token); back() }, enabled = !model.busy) { Text("Save & connect") }
        Button(onClick = { if (state.replyAlerts) model.replyAlerts(false) else if (android.os.Build.VERSION.SDK_INT >= 33) notifications.launch(Manifest.permission.POST_NOTIFICATIONS) else model.replyAlerts(true) }) { Text(if (state.replyAlerts) "Reply alerts: On" else "Enable reply alerts", fontSize = 12.sp) }
        Button(onClick = back) { Text("Back") }
        Text("Voice records only while held. Release sends; swiping away cancels. Maximum 60 seconds.", color = Muted, fontSize = 10.sp, textAlign = TextAlign.Center)
    }
}

@Composable
internal fun Field(value: String, change: (String) -> Unit, hint: String, secret: Boolean = false) {
    BasicTextField(value, change, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).background(Panel).padding(12.dp),
        textStyle = TextStyle(color = Color.White, fontSize = 13.sp, fontFamily = Geist), cursorBrush = SolidColor(White),
        visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
        decorationBox = { inner -> if (value.isEmpty()) Text(hint, color = Muted, fontSize = 12.sp); inner() })
}
