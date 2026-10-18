package dev.ally.phone

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.onClick
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.ally.device.AttachmentView
import dev.ally.device.AttachmentParser
import dev.ally.device.DeviceLink
import kotlinx.coroutines.launch
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private val model get() = (application as AllyPhoneApplication).model
    private var destination by mutableStateOf<Pair<String, Int>?>(null)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        acceptDestination(intent)
        window.statusBarColor = android.graphics.Color.rgb(12,12,13)
        window.navigationBarColor = android.graphics.Color.rgb(12,12,13)
        setContent {
            val prefs = remember { DeviceLink.prefs(this) }
            var look by remember { mutableStateOf(PhoneLook.load(prefs)) }
            CompositionLocalProvider(LocalPhoneLook provides look) {
            val body = TextStyle(fontFamily=Geist,fontSize=14.sp,lineHeight=22.sp)
            MaterialTheme(colorScheme=darkColorScheme(primary=White,onPrimary=Ink,background=Ink,surface=Panel,onSurface=White,outline=Line),
                typography=Typography(bodyLarge=body,bodyMedium=body,bodySmall=body.copy(fontSize=12.sp),labelLarge=body, labelMedium=body.copy(fontSize=12.sp))) {
                Surface(Modifier.fillMaxSize(),color=Ink,contentColor=White) { PhoneApp(model,destination) { look=it; it.save(prefs) } }
            }
            }
        }
    }
    override fun onPause() { if(!dev.ally.device.AssistantVisibility.visible && model.state.value.recording) model.cancelRecording(); super.onPause() }
    override fun onResume() { super.onResume(); DeviceLink.resume(this) }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); acceptDestination(intent) }
    private fun acceptDestination(intent: Intent) {
        intent.getStringExtra("openChat")?.takeIf { it.matches(Regex("(codex|claude):[\\w-]{8,100}")) }?.let {
            model.select(it); destination = "Chat" to ((destination?.second ?: 0)+1); intent.removeExtra("openChat")
        }
        if (intent.action == Intent.ACTION_ASSIST || intent.getBooleanExtra("allyAssistant", false)) {
            destination = "Chat" to ((destination?.second ?: 0)+1)
            intent.removeExtra("allyAssistant")
        }
        if (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE) {
            model.receiveShare(intent)
            destination = "Chat" to ((destination?.second ?: 0) + 1)
            intent.action = Intent.ACTION_MAIN; intent.removeExtra(Intent.EXTRA_STREAM); intent.removeExtra(Intent.EXTRA_TEXT); intent.clipData = null
        }
        intent.getStringExtra("allyPage")?.takeIf { it=="Inbox" || it=="Settings" || it=="Chat" }?.let {
            destination=it to ((destination?.second ?: 0)+1)
        }
    }
}

@Composable
private fun PhoneApp(model: PhoneModel,destination: Pair<String,Int>?, changeLook: (PhoneLook)->Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val link by DeviceLink.status.collectAsStateWithLifecycle()
    val inbox by DeviceLink.inbox.collectAsStateWithLifecycle()
    val pendingRequests = dev.ally.device.DeviceInteractions.pending(inbox)
    var page by rememberSaveable { mutableStateOf("Chat") }
    val draftPrefs = DeviceLink.prefs(LocalContext.current)
    var draft by remember(state.selected?.id) { mutableStateOf(draftPrefs.getString("composer:${state.selected?.id}", "")!!) }
    LaunchedEffect(draft, state.selected?.id) { draftPrefs.edit().putString("composer:${state.selected?.id}", draft).apply() }
    val submittedDrafts = remember { mutableMapOf<String?, Pair<String, String>>() }
    LaunchedEffect(state.selected?.id, state.sentSequence) {
        if (state.sentSequence > 0) {
            submittedDrafts[state.selected?.id]?.let { (original, message) -> if (draft == original && state.sentText == message) draft = "" }
            submittedDrafts.remove(state.selected?.id)
        }
    }
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current
    fun navigate(target: String) { model.cancelRecording(); keyboard?.hide(); page=target; scope.launch { drawer.close() }; if(target=="Chats") model.catalog() }
    LaunchedEffect(state.voiceDraft) { if(state.voiceDraft.isNotBlank()) { draft=listOf(draft,state.voiceDraft).filter { it.isNotBlank() }.joinToString(" "); model.voiceDraftRead() } }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle) { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
        while (isActive) { model.refreshSelected(); model.refreshUnread(); delay(2500) }
    } }
    LaunchedEffect(destination) { destination?.let { navigate(it.first) } }
    BackHandler(drawer.isOpen || page!="Chat") { if(drawer.isOpen) scope.launch { drawer.close() } else page="Chat" }
    ModalNavigationDrawer(drawerState=drawer,gesturesEnabled=drawer.isOpen,drawerContent={
        ModalDrawerSheet(drawerContainerColor=Ink,drawerShape=RoundedCornerShape(0.dp),modifier=Modifier.widthIn(max=320.dp)) {
            Row(Modifier.fillMaxWidth().padding(start=24.dp,end=8.dp,top=12.dp,bottom=28.dp),verticalAlignment=Alignment.CenterVertically) {
                Text("ALLY",fontFamily=Tanker,fontSize=30.sp,modifier=Modifier.weight(1f))
                IconControl("close","Close navigation") { scope.launch { drawer.close() } }
            }
            listOf(Triple("chat","Chat","Current conversation"),Triple("folder","Chats","Your conversations"),Triple("inbox","Inbox",if(inbox.isEmpty()) "All caught up" else "${dev.ally.device.DeviceAlerts.ordered(inbox).count { dev.ally.device.DeviceAlerts.blocking(it) }} need you · ${inbox.size} alerts"),Triple("styles","Styles","Orb, colours & glow"),Triple("settings","Settings","Voice, connection & alerts")).forEach { (icon,target,detail) ->
                Row(Modifier.padding(horizontal=12.dp,vertical=3.dp).fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(if(page==target) Panel else Color.Transparent).clickable { navigate(target) }.padding(16.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(16.dp)) {
                    Glyph(icon,color=if(page==target) White else Muted)
                    Column { Text(target,fontSize=15.sp); Text(detail,color=Muted,fontSize=11.sp) }
                }
            }
            Spacer(Modifier.weight(1f))
            HorizontalDivider(color=Line)
            Row(Modifier.padding(24.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(5.dp).background(if(link=="Connected") Color(0xff95b6a1) else Muted,CircleShape))
                MicroLabel(if(link=="Connected") "Desktop connected" else link)
            }
        }
    }) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal=8.dp,vertical=3.dp),verticalAlignment=Alignment.CenterVertically) {
                IconControl(if(page=="Chat") "menu" else "back",if(page=="Chat") "Open navigation" else "Back to chat") { if(page=="Chat") { keyboard?.hide(); scope.launch { drawer.open() } } else page="Chat" }
                Text("ALLY",fontFamily=Tanker,fontSize=23.sp,letterSpacing=.7.sp,modifier=Modifier.padding(start=6.dp))
                Spacer(Modifier.weight(1f))
                Box(Modifier.size(5.dp).background(if(link=="Connected") Color(0xff95b6a1) else Muted,CircleShape))
                MicroLabel(when { link=="Connected" -> "Connected"; link.contains("connecting",true) -> "Connecting"; link=="Not connected" -> "Alerts off"; else -> "Offline" },Modifier.padding(start=7.dp,end=8.dp))
                IconControl("new","New chat",!state.recording && !state.transcribing) { model.newChat(); page="Chat" }
            }
            HorizontalDivider(color=Line,thickness=.5.dp)
            pendingRequests.firstOrNull()?.let { request ->
                TextButton({ model.select(request.optString("chatId")); navigate("Chat") },enabled=!state.recording && !state.transcribing,modifier=Modifier.fillMaxWidth().heightIn(min=48.dp)) {
                    Text("${pendingRequests.size} ${if(pendingRequests.size == 1) "request needs" else "requests need"} your answer · Open chat",color=Warm,fontSize=12.sp)
                }
            }
            when(page) {
                "Chat" -> {
                    if(state.selected!=null) Row(Modifier.fillMaxWidth().clickable { navigate("Chats") }.padding(horizontal=24.dp,vertical=16.dp),verticalAlignment=Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(state.selected!!.title.replace(Regex("\\s+")," "),fontFamily=Geist,fontSize=15.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                            MicroLabel(folderName(state.selected!!.cwd),Modifier.padding(top=5.dp))
                        }
                        if (state.busy || state.externalRunning) Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                            CircularProgressIndicator(Modifier.size(14.dp).semantics { contentDescription = "Chat is working" },color=Muted,strokeWidth=2.dp)
                            Text("Thinking…",color=Muted,fontSize=11.sp)
                        }
                        Glyph("down",Modifier.padding(start=12.dp).size(16.dp),Muted)
                    }
                    Conversation(state,model,Modifier.weight(1f),readerVisible=drawer.isClosed,onBrowse={ navigate("Chats") })
                    dev.ally.device.MessageQueueStack(state.queue,state.queueChanging,state.queueError,model::queueChange,Modifier.padding(horizontal=12.dp,vertical=4.dp))
                    Composer(state,draft,{draft=it},model) { submittedDrafts[state.selected?.id] = draft to listOf(state.share.text, draft).filter { it.isNotBlank() }.joinToString("\n\n"); model.send(draft); keyboard?.hide() }
                }
                "Chats" -> ChatLibrary(state,model,Modifier.weight(1f)) { page="Chat" }
                "Inbox" -> AlertInbox(inbox,(state.chats+state.running+listOfNotNull(state.selected)).distinctBy { it.id },Modifier.weight(1f)) { id -> navigate("Chat"); model.select(id) }
                "Styles" -> PhoneAppearance(Modifier.weight(1f),changeLook)
                "Settings" -> PhoneSettings(link,Modifier.weight(1f)) { navigate("Styles") }
            }
        }
    }
}

@Composable
private fun Conversation(state: PhoneState,model: PhoneModel,modifier: Modifier,readerVisible: Boolean,onBrowse: ()->Unit) {
    val deviceInbox by DeviceLink.inbox.collectAsStateWithLifecycle()
    val requests = dev.ally.device.DeviceInteractions.forChat(deviceInbox,state.selected?.id,state.selected?.sessionKey,state.readReceipt?.key)
    val timeline = dev.ally.device.DeviceInteractions.timeline(requests,state.messages,{it.id},{it.timestamp})
    val scroll=rememberLazyListState()
    val readerLifecycle = LocalLifecycleOwner.current.lifecycle
    val receipt = state.readReceipt
    val latestReplyId = state.messages.lastOrNull { it.role == "assistant" }?.id
    LaunchedEffect(receipt, latestReplyId, readerVisible, state.busy, state.externalRunning) {
        if (receipt?.unread == true && readerVisible && !state.busy && !state.externalRunning && latestReplyId != null) {
            readerLifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                while (isActive) {
                    delay(500)
                    if (scroll.layoutInfo.visibleItemsInfo.any { it.key == latestReplyId }) model.viewed(receipt)
                    delay(2000)
                }
            }
        }
    }
    // Pagination prepends must keep the reader's position; only follow new tail messages.
    var previousChat by remember { mutableStateOf<String?>(null) }
    var previousTail by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(requests.filter { dev.ally.device.DeviceInteractions.awaiting(it) }.map { it.optString("id") }) { if(requests.any { dev.ally.device.DeviceInteractions.awaiting(it) }) { withFrameNanos { }; scroll.animateScrollToItem((scroll.layoutInfo.totalItemsCount-1).coerceAtLeast(0)) } }
    LaunchedEffect(state.selected?.id,state.messages.lastOrNull()?.id,state.busy,state.liveText,state.approval?.optString("id")) {
        val changedChat=previousChat!=state.selected?.id
        val changedTail=previousTail!=state.messages.lastOrNull()?.id
        val nearBottom=!scroll.canScrollForward || scroll.layoutInfo.visibleItemsInfo.lastOrNull()?.let { it.index==scroll.layoutInfo.totalItemsCount-1 && it.offset+it.size<=scroll.layoutInfo.viewportEndOffset+100 }==true
        if(changedChat || ((changedTail || state.busy || state.approval!=null) && nearBottom)) scroll.animateScrollToItem((scroll.layoutInfo.totalItemsCount-1).coerceAtLeast(0))
        previousChat=state.selected?.id; previousTail=state.messages.lastOrNull()?.id
    }
    Box(modifier.fillMaxWidth()) {
        if(requests.isEmpty() && state.messages.isEmpty() && !state.loading && state.error.isBlank() && !state.busy && state.liveText.isBlank()) {
            FlowBackdrop(Modifier.matchParentSize())
            Column(Modifier.align(Alignment.Center).padding(horizontal=32.dp).offset(y=(-28).dp),horizontalAlignment=Alignment.CenterHorizontally) {
                PresenceOrb(Modifier.size(104.dp),state.busy)
                Spacer(Modifier.height(20.dp))
                Text("Hey, what’s on\nyour mind?",fontFamily=Geist,fontSize=30.sp,lineHeight=37.sp,letterSpacing=(-1).sp,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
                Text(if(state.selected==null) "A little closer to your desktop." else "Pick up where you left off.",fontSize=13.sp,color=Muted,modifier=Modifier.padding(top=14.dp))
                if(state.selected==null) OutlinedButton(onBrowse,modifier=Modifier.padding(top=28.dp),shape=RoundedCornerShape(8.dp),border=BorderStroke(1.dp,Line)) { Text("Your conversations",fontSize=13.sp); Spacer(Modifier.width(16.dp)); Glyph("chevron",Modifier.size(14.dp)) }
            }
        }
        if(requests.isNotEmpty() || state.messages.isNotEmpty() || state.loading || state.error.isNotBlank() || state.busy || state.liveText.isNotBlank() || state.approval!=null) LazyColumn(Modifier.fillMaxSize(),state=scroll,contentPadding=PaddingValues(start=24.dp,end=24.dp,top=12.dp,bottom=24.dp),verticalArrangement=Arrangement.spacedBy(28.dp)) {
            if(state.before!=null) item(key="older") { TextButton(model::older,enabled=!state.loading,modifier=Modifier.fillMaxWidth()) { Text("Load earlier messages",color=Muted,fontSize=12.sp) } }
            if(state.loading && state.messages.isEmpty()) item { Text("Opening your conversation…",color=Muted,fontSize=13.sp) }
            items(timeline,key={it.id}) { entry ->
                entry.request?.let { DeviceInteractionCard(it) }
                entry.message?.let { message ->
                Column(Modifier.fillMaxWidth(),horizontalAlignment=if(message.role=="user") Alignment.End else Alignment.Start) {
                    if(message.role=="user") {
                        androidx.compose.foundation.text.selection.SelectionContainer {
                            Text(message.text,fontSize=15.sp,lineHeight=24.sp,fontFamily=Geist,modifier=Modifier.widthIn(max=310.dp).clip(RoundedCornerShape(16.dp,16.dp,4.dp,16.dp)).background(Panel).padding(horizontal=16.dp,vertical=12.dp))
                        }
                    } else {
                        Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(6.dp),modifier=Modifier.padding(bottom=10.dp)) {
                            PresenceOrb(Modifier.size(24.dp)); MicroLabel(state.selected?.provider ?: state.provider)
                        }
                        MessageBody(message.text)
                        message.cards.forEachIndexed { index, card -> key(message.id, index) {
                            Spacer(Modifier.height(16.dp))
                            ReplyCardView(card, !state.busy && !state.loading && !state.recording && !state.transcribing, model::send)
                        } }
                    }
                    AttachmentView(message.attachments)
                }
                }
            }
            if(state.liveText.isNotBlank() || state.liveAttachments.isNotEmpty()) item(key="live-reply") { Column {
                MicroLabel(if(state.busy) "Reply in progress" else "Latest reply",Modifier.padding(bottom=10.dp))
                MessageBody(state.liveText)
                AttachmentView(state.liveAttachments)
            } }
            if(state.busy || state.externalRunning) item(key="activity") { Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) { CircularProgressIndicator(Modifier.size(18.dp),color=Muted,strokeWidth=2.dp); Text(if(state.busy) state.activity else "Thinking · working in another app…",color=Muted,fontSize=12.sp) } }
            if(state.syncStatus.isNotBlank()) item(key="sync-status") { Text(state.syncStatus,color=Muted,fontSize=12.sp) }
            state.approval?.takeIf { approval -> requests.none { it.optString("id") == approval.optString("id") } }?.let { approval -> item(key="approval") { ChatApproval(approval,state.loading,model::answer) } }
            if(state.inputStatus.isNotBlank()) item(key="input-status") { Column {
                Text(state.inputStatus,color=Muted,fontSize=12.sp)
                if(state.inputStatus.contains("unconfirmed")) Row {
                    TextButton(model::retry,enabled=!state.loading) { Text("Retry input") }
                    TextButton(model::dismissInput,enabled=!state.loading) { Text("Dismiss") }
                }
            } }
            if(state.error.isNotBlank()) item(key="error") { Column(Modifier.border(1.dp,Warm.copy(alpha=.3f),RoundedCornerShape(8.dp)).padding(16.dp)) { Text(state.error,color=Warm,fontSize=13.sp); TextButton(model::retry,enabled=!state.loading) { Text("Retry connection") }; TextButton(model::dismissInput,enabled=!state.loading) { Text("Dismiss error") } } }
        }
        if(state.recording || state.transcribing) Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(124.dp).background(Ink).padding(horizontal=20.dp,vertical=8.dp)) {
            Text(state.liveTranscript.ifBlank { if(state.transcribing) "Finishing your words…" else "Listening…" },fontSize=12.sp,color=White,maxLines=3,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f))
            TextButton(model::cancelRecording,modifier=Modifier.height(48.dp)) { Text("Cancel voice",color=Muted,fontSize=11.sp) }
        }
    }
}

@Composable
private fun Composer(state: PhoneState,draft: String,onDraft: (String)->Unit,model: PhoneModel,send: ()->Unit) {
    var permissions by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { model.importUris(it) }
    val editable = !state.loading && !state.pendingSend && !state.importingShare && !state.recording && !state.transcribing
    Column(Modifier.fillMaxWidth().background(Ink).border(BorderStroke(.5.dp,Line)).padding(horizontal=16.dp,vertical=10.dp)) {
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
            Box(Modifier.size(4.dp).background(White)); MicroLabel(state.selected?.provider ?: state.provider,Modifier.padding(start=8.dp))
            Text(" / ",color=Muted,fontSize=10.sp)
            MicroLabel(state.selected?.cwd?.let(::folderName) ?: "Personal",Modifier.weight(1f))
            Box {
                TextButton({permissions=true},enabled=!state.busy && !state.recording && !state.transcribing && state.selected!=null,contentPadding=PaddingValues(horizontal=8.dp,vertical=0.dp),modifier=Modifier.height(48.dp)) {
                    Glyph("shield",Modifier.size(12.dp),if(state.permission=="full") Warm else Muted)
                    MicroLabel(when(state.permission) { "edit" -> "Can edit"; "full" -> "Full access"; else -> "Read only" },Modifier.padding(start=6.dp),if(state.permission=="full") Warm else Muted)
                }
                DropdownMenu(permissions,{permissions=false},containerColor=Panel) {
                    listOf("readonly" to "Read only","edit" to "Edit files","full" to "Full access").forEach { (value,label) -> DropdownMenuItem(text={Text(label)},onClick={model.permission(value);permissions=false}) }
                }
            }
        }
        if (state.importingShare) Text("Copying shared content…", color=Muted, fontSize=12.sp)
        if (state.share.text.isNotBlank() || state.share.files.isNotEmpty()) Column(Modifier.fillMaxWidth().heightIn(max=180.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment=Alignment.CenterVertically) {
                Text("Shared draft · review before sending",fontSize=12.sp,color=Muted,modifier=Modifier.weight(1f))
                TextButton(model::discardShare,enabled=editable) { Text("Discard") }
            }
            if (state.share.text.isNotBlank()) OutlinedTextField(state.share.text,model::shareText,enabled=editable,maxLines=3,modifier=Modifier.fillMaxWidth(),label={Text("Shared text")})
            state.share.files.forEach { file -> Row(verticalAlignment=Alignment.CenterVertically) {
                Text(file.name,fontSize=12.sp,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.weight(1f))
                TextButton({model.removeShared(file.key)},enabled=editable) { Text("Remove") }
            } }
        }
        VoiceControl(state,model,draft.isBlank() && state.share.text.isBlank() && state.share.files.isEmpty())
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(Panel).border(1.dp,if(draft.isNotBlank()) White.copy(alpha=.22f) else Line,RoundedCornerShape(26.dp)).padding(5.dp),verticalAlignment=Alignment.CenterVertically) {
            IconButton({picker.launch(arrayOf("*/*"))},enabled=editable,modifier=Modifier.size(48.dp).semantics { contentDescription="Attach images or files" }) { Text("+",fontSize=24.sp) }
            BasicTextField(draft,{onDraft(it.take(12000))},enabled=editable,modifier=Modifier.weight(1f).padding(horizontal=6.dp,vertical=9.dp).heightIn(min=24.dp,max=128.dp).semantics { contentDescription="Message Ally" },textStyle=TextStyle(color=White,fontFamily=Geist,fontSize=14.sp,lineHeight=22.sp),cursorBrush=SolidColor(White),maxLines=5,decorationBox={ inner -> if(draft.isEmpty()) Text("Hey, what’s on your mind?",color=Muted,fontSize=13.sp); inner() })
            val enabled=(state.selected!=null && (draft.isNotBlank() || state.share.text.isNotBlank() || state.share.files.isNotEmpty()) && editable)
            if(state.busy) IconButton(onClick=model::stop,modifier=Modifier.size(48.dp).semantics { contentDescription="Stop response" }) { Glyph("stop",Modifier.size(18.dp),Muted) }
            IconButton(onClick=send,enabled=enabled,modifier=Modifier.size(48.dp).semantics { contentDescription=if(state.busy || state.externalRunning) (if(state.inputMode=="queue") "Queue message" else "Steer now") else "Send message" }) {
                Box(Modifier.size(34.dp).background(if(enabled) White else Color.White.copy(alpha=.06f),CircleShape),contentAlignment=Alignment.Center) { Glyph("send",Modifier.size(18.dp),if(enabled) Ink else Muted) }
            }
        }
        if (state.busy || state.externalRunning) Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            listOf("queue" to "Queue", "steer" to "Steer now").forEach { (mode, label) ->
                TextButton({model.inputMode(mode)}, enabled=editable) { Text((if(state.inputMode==mode) "✓ " else "")+label, fontSize=12.sp) }
            }
            Text(if(state.inputMode=="queue") "After this response" else "Guide current work",color=Muted,fontSize=10.sp,modifier=Modifier.align(Alignment.CenterVertically))
        }
        Spacer(Modifier.height(5.dp))
    }
}

@Composable
private fun VoiceControl(state: PhoneState,model: PhoneModel,draftEmpty: Boolean) {
    val context=LocalContext.current
    val review=DeviceLink.prefs(context).getBoolean("phone.voice.review",false)
    val keyboard=LocalSoftwareKeyboardController.current
    val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if(!granted) model.voiceError("Microphone permission is needed to talk. You can still type.")
    }
    val enabled=state.selected!=null && !state.loading && !state.transcribing && draftEmpty
    val currentEnabled by rememberUpdatedState(enabled)
    val recording by rememberUpdatedState(state.recording)
    val start by rememberUpdatedState<()->Unit>({
        keyboard?.hide()
        if(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED) model.startRecording()
        else permission.launch(Manifest.permission.RECORD_AUDIO)
    })
    Column(Modifier.fillMaxWidth().padding(bottom=8.dp),horizontalAlignment=Alignment.CenterHorizontally) {
        Box(contentAlignment=Alignment.Center) {
        PhoneActivityGlow(state.recording || state.transcribing || state.busy,Modifier.size(width=240.dp,height=100.dp))
        PresenceOrb(Modifier.size(100.dp).semantics {
            contentDescription=if(state.recording) "Listening. Release to ${if(review) "review" else "send"}." else "Hold to talk to Ally"
            role=Role.Button
            onClick(label="Start or finish voice message") { if(recording) model.finishRecording() else if(currentEnabled) start(); true }
        }.pointerInput(Unit) {
            detectTapGestures(onPress={
                if(currentEnabled) {
                    start()
                    try { if(tryAwaitRelease()) model.finishRecording() else model.cancelRecording() }
                    catch(e: kotlinx.coroutines.CancellationException) { model.cancelRecording(); throw e }
                }
            })
        },state.recording || state.transcribing || state.busy,state.microphoneLevel,state.recording)
        }
        Text(when { state.recording -> "Listening · ${state.recordingSeconds.toInt()}s · release to ${if(review) "review" else "send"}"; state.transcribing -> "Finishing your words…"; !draftEmpty -> "Send your draft to talk"; state.busy -> "Hold to add input · keeps working"; else -> "Hold to talk · up to 5 minutes" },fontSize=11.sp,color=if(state.recording) LocalPhoneLook.current.palette.colors[2] else Muted,maxLines=1,overflow=TextOverflow.Ellipsis,modifier=Modifier.height(24.dp))

    }
}

@Composable
private fun ChatLibrary(state: PhoneState,model: PhoneModel,modifier: Modifier,onSelect: ()->Unit) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (isActive) { model.refreshRunning(); delay(5000) }
        }
    }
    var search by rememberSaveable { mutableStateOf("") }
    val visible=state.chats.filter { it.title.contains(search,true) || it.cwd.contains(search,true) }
    LazyColumn(modifier.fillMaxWidth(),contentPadding=PaddingValues(24.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
        item { MicroLabel("Your workspace"); Text("Conversations",fontFamily=Geist,fontSize=29.sp,letterSpacing=(-.8).sp,modifier=Modifier.padding(top=8.dp,bottom=20.dp)) }
        item { Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Panel).padding(horizontal=14.dp,vertical=14.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) { Glyph("search",Modifier.size(17.dp),Muted); BasicTextField(search,{search=it},textStyle=TextStyle(color=White,fontFamily=Geist,fontSize=14.sp),singleLine=true,cursorBrush=SolidColor(White),modifier=Modifier.weight(1f).semantics { contentDescription="Search conversations" },decorationBox={inner -> if(search.isEmpty()) Text("Search chats or projects",color=Muted,fontSize=13.sp); inner() }) } }
        item { Row(Modifier.padding(vertical=10.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) { listOf("codex","claude").forEach { provider ->
            val selected=state.provider==provider
            TextButton({model.catalog(provider)},enabled=!state.loading,shape=RoundedCornerShape(8.dp),colors=ButtonDefaults.textButtonColors(containerColor=if(selected) Panel else Color.Transparent),contentPadding=PaddingValues(horizontal=18.dp)) { Text(provider.replaceFirstChar { it.uppercase() },color=if(selected) White else Muted,fontSize=13.sp) }
        } } }
        item { Text("Switch freely · each chat keeps working",color=Muted,fontSize=12.sp) }
        item { MicroLabel("Running · ${state.running.size}",color=Warm) }
        items(state.running.filter { it.title.contains(search,true) || it.cwd.contains(search,true) },key={"running:${it.id}"}) { chat ->
            LibraryChoice(chat,state.selected?.id,!state.recording && !state.transcribing) { model.select(chat.id); onSelect() }
        }
        if(state.runningStatus.isNotBlank()) item { Text(state.runningStatus,color=Muted,fontSize=12.sp,modifier=Modifier.padding(vertical=8.dp)) }
        if(search.isBlank() && state.chats.isNotEmpty()) {
            item { MicroLabel("Most recent") }
            items(state.chats.take(3),key={"recent:${it.id}"}) { chat -> LibraryChoice(chat,state.selected?.id,!state.recording && !state.transcribing) { model.select(chat.id); onSelect() } }
        }
        visible.groupBy { it.cwd }.forEach { (folder,chats) ->
            item(key="folder:$folder") { Row(Modifier.padding(top=14.dp,bottom=8.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) { Glyph("folder",Modifier.size(14.dp),Muted); MicroLabel(folderName(folder)); Text("${chats.size}",fontFamily=Mono,color=Muted,fontSize=9.sp) } }
            items(chats,key={it.id}) { chat ->
                val selected=state.selected?.id==chat.id
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(if(selected) Panel else Color.Transparent).clickable(enabled=!state.recording && !state.transcribing) { model.select(chat.id); onSelect() }.padding(horizontal=12.dp,vertical=15.dp),verticalAlignment=Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text(chat.title.replace(Regex("\\s+")," "),fontFamily=Geist,fontSize=14.sp,lineHeight=21.sp,maxLines=2,overflow=TextOverflow.Ellipsis); if(selected) Text("Current conversation",color=Muted,fontSize=10.sp,modifier=Modifier.padding(top=4.dp)) }
                    if(chat.unread) PhoneUnreadDot()
                    if(selected) Glyph("check",Modifier.padding(start=12.dp).size(14.dp),Muted)
                }
            }
        }
        if(visible.isEmpty() && !state.loading) item { Text(if(search.isBlank()) "No conversations yet." else "No matches in loaded conversations.",color=Muted,modifier=Modifier.padding(vertical=24.dp)) }
        if(state.more!=null) item { TextButton({model.catalog(more=true)},enabled=!state.loading) { Text("Load more conversations") } }
        if(state.loading) item { LinearProgressIndicator(Modifier.fillMaxWidth(),color=Muted,trackColor=Panel) }
        if(state.error.isNotBlank()) item { Text(state.error,color=Warm); TextButton({model.catalog()}) { Text("Retry") } }
    }
}

@Composable
private fun LibraryChoice(chat: PhoneChat,selectedId: String?,enabled: Boolean,choose: ()->Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(if(chat.id==selectedId) Panel else Color.Transparent).clickable(enabled=enabled,onClick=choose).padding(horizontal=12.dp,vertical=12.dp),verticalAlignment=Alignment.CenterVertically) {
        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            Text(chat.title.replace(Regex("\\s+")," "),fontSize=14.sp,maxLines=2,overflow=TextOverflow.Ellipsis)
            Text("${if(chat.provider=="codex") "Codex" else "Claude"} · ${folderName(chat.cwd)}",fontSize=10.sp,color=Muted,maxLines=1,overflow=TextOverflow.Ellipsis)
        }
        if(chat.unread) PhoneUnreadDot()
        if(chat.id==selectedId) Glyph("check",Modifier.padding(start=12.dp).size(14.dp),Muted)
    }
}

@Composable
private fun PhoneSettings(link: String,modifier: Modifier, appearance: ()->Unit) {
    val context=LocalContext.current
    val prefs=remember { DeviceLink.prefs(context) }
    var quiet by remember { mutableStateOf(prefs.getBoolean("deviceQuietHours",false)) }
    var muted by remember { mutableStateOf(prefs.getBoolean("muted",false)) }
    var haptics by remember { mutableStateOf(prefs.getBoolean("phone.haptics",true)) }
    var reviewVoice by remember { mutableStateOf(prefs.getBoolean("phone.voice.review",false)) }
    var pairing by rememberSaveable { mutableStateOf(false) }
    var endpoint by remember { mutableStateOf(prefs.getString("endpoint","https://ally.prxptn.com")!!) }
    var token by remember { mutableStateOf(prefs.getString("token","")!!) }
    var error by remember { mutableStateOf("") }
    val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { allowed -> if(allowed) DeviceLink.start(context) }
    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp),verticalArrangement=Arrangement.spacedBy(22.dp)) {
        Column { MicroLabel("Make yourself at home"); Text("Settings",fontFamily=Geist,fontSize=29.sp,modifier=Modifier.padding(top=8.dp)) }
        Row(Modifier.fillMaxWidth().border(1.dp,Line,RoundedCornerShape(8.dp)).padding(18.dp),verticalAlignment=Alignment.CenterVertically) {
            PresenceOrb(Modifier.size(42.dp)); Column(Modifier.padding(start=12.dp).weight(1f)) { Text("Your desktop",fontSize=15.sp); Text(link,color=Muted,fontSize=12.sp) }
        }
        PhoneAssistantSetting()
        SettingRow("styles","Styles","Orb, colours, glow & motion",appearance)
        HorizontalDivider(color=Line)
        ToggleRow("Touch feedback","Gentle pulses for voice, sends and decisions",haptics) { haptics=it; prefs.edit().putBoolean("phone.haptics",it).apply(); if(it) PhoneHaptics.pulse(context) }
        TextButton({PhoneHaptics.pulse(context,true)},enabled=haptics) { Text("Test touch feedback") }
        MicroLabel("Voice")
        ToggleRow("Review before sending","Put your words in the composer when you release",reviewVoice) { reviewVoice=it; prefs.edit().putBoolean("phone.voice.review",it).apply() }
        Text("Hold the orb to talk for up to 5 minutes. Release to send, or review first. Cancel voice discards the recording. Live speech uses Google; unavailable sections use desktop transcription.",color=Muted,fontSize=12.sp,lineHeight=20.sp)
        SettingRow("shield","Microphone & app permissions","Manage access in Android settings") {
            context.startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:${context.packageName}")))
        }
        HorizontalDivider(color=Line)
        MicroLabel("Connection")
        SettingRow("shield","Pairing","Private connection to Ally",onClick={pairing=!pairing})
        if(pairing) Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(endpoint,{endpoint=it},label={Text("HTTPS bridge address")},singleLine=true,modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(8.dp))
            OutlinedTextField(token,{token=it},label={Text("Pairing token")},singleLine=true,visualTransformation=PasswordVisualTransformation(),modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(8.dp))
            Button({
                if(!endpoint.trim().startsWith("https://") || token.isBlank()) error="Enter an HTTPS address and pairing token."
                else { prefs.edit().putString("endpoint",endpoint.trim()).putString("token",token.trim()).apply(); DeviceLink.stop(context); error=""; pairing=false
                    if(android.os.Build.VERSION.SDK_INT>=33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) permission.launch(Manifest.permission.POST_NOTIFICATIONS) else DeviceLink.start(context)
                }
            },shape=RoundedCornerShape(8.dp)) { Text("Save & connect") }
            if(error.isNotEmpty()) Text(error,color=Warm,fontSize=12.sp)
        }
        SettingRow("chat",if(prefs.getBoolean("deviceConnected",false)) "Disconnect" else "Keep connected","Receive notes while Ally is in the background") {
            if(prefs.getBoolean("deviceConnected",false)) DeviceLink.stop(context)
            else if(android.os.Build.VERSION.SDK_INT>=33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
            else DeviceLink.start(context)
        }
        HorizontalDivider(color=Line)
        MicroLabel("Notifications")
        ToggleRow("Quiet hours","10 pm–8 am",quiet) { quiet=it; prefs.edit().putBoolean("deviceQuietHours",it).apply() }
        ToggleRow("Mute alerts","Keep notes in your inbox",muted) { muted=it; prefs.edit().putBoolean("muted",it).apply() }
        SettingRow("inbox","Android notification settings","Sound, vibration & notification access") {
            context.startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,context.packageName))
        }
        HorizontalDivider(color=Line)
        Text("You’re in control",fontSize=16.sp)
        Text("Choose permissions in each conversation. Device actions always need your approval. Keep connected shows an ongoing Android notification.",color=Muted,fontSize=12.sp,lineHeight=20.sp)
        MicroLabel("Ally / Android",Modifier.padding(top=12.dp))
    }
}

@Composable
private fun SettingRow(icon: String,title: String,subtitle: String,onClick: ()->Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick=onClick).padding(vertical=5.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(14.dp)) {
        Glyph(icon,color=Muted); Column(Modifier.weight(1f)) { Text(title,fontSize=14.sp); Text(subtitle,color=Muted,fontSize=11.sp,lineHeight=17.sp) }; Glyph("chevron",Modifier.size(15.dp),Muted)
    }
}

@Composable
internal fun ToggleRow(title: String,subtitle: String,value: Boolean,change: (Boolean)->Unit) {
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(title,fontSize=14.sp); Text(subtitle,color=Muted,fontSize=11.sp) }; Switch(value,change,colors=SwitchDefaults.colors(checkedThumbColor=Ink,checkedTrackColor=White,uncheckedTrackColor=Panel,uncheckedBorderColor=Line)) }
}
@Composable
internal fun ChatApproval(request: JSONObject, sending: Boolean, answer: (String, Map<String, String>) -> Unit) {
    var values by remember(request.optString("id")) { mutableStateOf<Map<String, String>>(emptyMap()) }
    val fields = request.optJSONArray("fields"); val actions = request.optJSONArray("actions")
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Panel).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(request.optString("title"), color = Warm); Text(request.optString("detail"), fontSize = 12.sp)
        AttachmentView(AttachmentParser.list(request))
        for (i in 0 until (fields?.length() ?: 0)) { val field = fields!!.getJSONObject(i); val id = field.getString("id"); val options = field.optJSONArray("options")
            Text(field.optString("label"), fontSize = 12.sp)
            for (j in 0 until (options?.length() ?: 0)) { val option = options!!.getJSONObject(j); FilterChip(selected = values[id] == option.optString("value"), onClick = { values = values + (id to option.optString("value")) }, label = { Text(option.optString("label")) }, enabled = !sending) }
            if (field.optBoolean("freeText")) OutlinedTextField(values[id] ?: "", { values = values + (id to it.take(4000)) }, enabled = !sending, label = {Text("Your answer")}, visualTransformation = if (field.optBoolean("secret")) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None)
        }
        val complete = (0 until (fields?.length() ?: 0)).all { val f = fields!!.getJSONObject(it); !f.optBoolean("required") || !values[f.getString("id")].isNullOrBlank() }
        if(sending) Text("Sending your decision…",color=Muted,fontSize=12.sp)
        for (i in 0 until (actions?.length() ?: 0)) { val action = actions!!.getJSONObject(i); Button(onClick = { answer(action.getString("value"), values) }, modifier = Modifier.heightIn(min=48.dp), enabled = !sending && (complete || action.optString("value") in setOf("decline", "cancel", "reject"))) { Text(action.optString("label")) } }
    }
}

@Composable
private fun PhoneUnreadDot() { Box(Modifier.padding(horizontal=8.dp).size(6.dp).background(Color(0xFF60A5FA), CircleShape).semantics { contentDescription = "Unread reply" }) }
