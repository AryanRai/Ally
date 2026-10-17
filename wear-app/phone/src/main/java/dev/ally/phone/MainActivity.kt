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
import androidx.activity.viewModels
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import dev.ally.device.DeviceLink
import kotlinx.coroutines.launch
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private val model: PhoneModel by viewModels()
    private var destination by mutableStateOf<Pair<String, Int>?>(null)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        acceptDestination(intent)
        window.statusBarColor = android.graphics.Color.rgb(12,12,13)
        window.navigationBarColor = android.graphics.Color.rgb(12,12,13)
        setContent {
            val body = TextStyle(fontFamily=Geist,fontSize=14.sp,lineHeight=22.sp)
            MaterialTheme(colorScheme=darkColorScheme(primary=White,onPrimary=Ink,background=Ink,surface=Panel,onSurface=White,outline=Line),
                typography=Typography(bodyLarge=body,bodyMedium=body,bodySmall=body.copy(fontSize=12.sp),labelLarge=body, labelMedium=body.copy(fontSize=12.sp))) {
                Surface(Modifier.fillMaxSize(),color=Ink,contentColor=White) { PhoneApp(model,destination) }
            }
        }
    }
    override fun onResume() { super.onResume(); DeviceLink.resume(this) }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); acceptDestination(intent) }
    private fun acceptDestination(intent: Intent) {
        intent.getStringExtra("allyPage")?.takeIf { it=="Inbox" || it=="Settings" }?.let {
            destination=it to ((destination?.second ?: 0)+1)
        }
    }
}

@Composable
private fun PhoneApp(model: PhoneModel,destination: Pair<String,Int>?) {
    val state by model.state.collectAsStateWithLifecycle()
    val link by DeviceLink.status.collectAsStateWithLifecycle()
    val inbox by DeviceLink.inbox.collectAsStateWithLifecycle()
    var page by rememberSaveable { mutableStateOf("Chat") }
    var draft by rememberSaveable(state.selected?.id) { mutableStateOf("") }
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current
    fun navigate(target: String) { keyboard?.hide(); page=target; scope.launch { drawer.close() }; if(target=="Chats") model.catalog() }
    LaunchedEffect(destination) { destination?.let { navigate(it.first) } }
    BackHandler(drawer.isOpen || page!="Chat") { if(drawer.isOpen) scope.launch { drawer.close() } else page="Chat" }
    ModalNavigationDrawer(drawerState=drawer,gesturesEnabled=drawer.isOpen,drawerContent={
        ModalDrawerSheet(drawerContainerColor=Ink,drawerShape=RoundedCornerShape(0.dp),modifier=Modifier.widthIn(max=320.dp)) {
            Row(Modifier.fillMaxWidth().padding(start=24.dp,end=8.dp,top=12.dp,bottom=28.dp),verticalAlignment=Alignment.CenterVertically) {
                Text("ALLY",fontFamily=Tanker,fontSize=30.sp,modifier=Modifier.weight(1f))
                IconControl("close","Close navigation") { scope.launch { drawer.close() } }
            }
            listOf(Triple("chat","Chat","Current conversation"),Triple("folder","Chats","Your conversations"),Triple("inbox","Inbox",if(inbox.isEmpty()) "All caught up" else "${inbox.size} waiting"),Triple("settings","Settings","Connection & preferences")).forEach { (icon,target,detail) ->
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
                IconControl("new","New chat",!state.busy && !state.loading) { model.newChat(); page="Chat" }
            }
            HorizontalDivider(color=Line,thickness=.5.dp)
            when(page) {
                "Chat" -> {
                    if(state.selected!=null) Row(Modifier.fillMaxWidth().clickable { navigate("Chats") }.padding(horizontal=24.dp,vertical=16.dp),verticalAlignment=Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(state.selected!!.title.replace(Regex("\\s+")," "),fontFamily=Geist,fontSize=15.sp,maxLines=1,overflow=TextOverflow.Ellipsis)
                            MicroLabel(folderName(state.selected!!.cwd),Modifier.padding(top=5.dp))
                        }
                        Glyph("down",Modifier.padding(start=12.dp).size(16.dp),Muted)
                    }
                    Conversation(state,model,Modifier.weight(1f),onBrowse={ navigate("Chats") })
                    Composer(state,draft,{draft=it},model) { model.send(draft); draft=""; keyboard?.hide() }
                }
                "Chats" -> ChatLibrary(state,model,Modifier.weight(1f)) { page="Chat" }
                "Inbox" -> PhoneInbox(inbox,Modifier.weight(1f))
                "Settings" -> PhoneSettings(link,Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun Conversation(state: PhoneState,model: PhoneModel,modifier: Modifier,onBrowse: ()->Unit) {
    val scroll=rememberLazyListState()
    // Pagination prepends must keep the reader's position; only follow new tail messages.
    var previousChat by remember { mutableStateOf<String?>(null) }
    var previousTail by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(state.selected?.id,state.messages.lastOrNull()?.id,state.busy,state.approval?.optString("id")) {
        val changedChat=previousChat!=state.selected?.id
        val changedTail=previousTail!=state.messages.lastOrNull()?.id
        val nearBottom=!scroll.canScrollForward || scroll.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it>=scroll.layoutInfo.totalItemsCount-3 }==true
        if(changedChat || ((changedTail || state.busy || state.approval!=null) && nearBottom)) scroll.animateScrollToItem((scroll.layoutInfo.totalItemsCount-1).coerceAtLeast(0))
        previousChat=state.selected?.id; previousTail=state.messages.lastOrNull()?.id
    }
    Box(modifier.fillMaxWidth()) {
        if(state.messages.isEmpty() && !state.loading && state.error.isBlank()) {
            FlowBackdrop(Modifier.matchParentSize())
            Column(Modifier.align(Alignment.Center).padding(horizontal=32.dp).offset(y=(-28).dp),horizontalAlignment=Alignment.CenterHorizontally) {
                PresenceOrb(Modifier.size(104.dp),state.busy)
                Spacer(Modifier.height(20.dp))
                Text("Hey, what’s on\nyour mind?",fontFamily=Geist,fontSize=30.sp,lineHeight=37.sp,letterSpacing=(-1).sp,textAlign=androidx.compose.ui.text.style.TextAlign.Center)
                Text(if(state.selected==null) "A little closer to your desktop." else "Pick up where you left off.",fontSize=13.sp,color=Muted,modifier=Modifier.padding(top=14.dp))
                if(state.selected==null) OutlinedButton(onBrowse,modifier=Modifier.padding(top=28.dp),shape=RoundedCornerShape(8.dp),border=BorderStroke(1.dp,Line)) { Text("Your conversations",fontSize=13.sp); Spacer(Modifier.width(16.dp)); Glyph("chevron",Modifier.size(14.dp)) }
            }
        }
        if(state.messages.isNotEmpty() || state.loading || state.error.isNotBlank() || state.busy || state.approval!=null) LazyColumn(Modifier.fillMaxSize(),state=scroll,contentPadding=PaddingValues(start=24.dp,end=24.dp,top=12.dp,bottom=24.dp),verticalArrangement=Arrangement.spacedBy(28.dp)) {
            if(state.before!=null) item(key="older") { TextButton(model::older,enabled=!state.loading,modifier=Modifier.fillMaxWidth()) { Text("Load earlier messages",color=Muted,fontSize=12.sp) } }
            if(state.loading && state.messages.isEmpty()) item { Text("Opening your conversation…",color=Muted,fontSize=13.sp) }
            items(state.messages,key={it.id}) { message ->
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
                    }
                }
            }
            if(state.busy) item(key="activity") { Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) { PresenceOrb(Modifier.size(26.dp),true); Text(state.activity,color=Muted,fontSize=12.sp) } }
            state.approval?.let { approval -> item(key="approval") { ChatApproval(approval,state.loading,model::answer) } }
            if(state.error.isNotBlank()) item(key="error") { Column(Modifier.border(1.dp,Warm.copy(alpha=.3f),RoundedCornerShape(8.dp)).padding(16.dp)) { Text(state.error,color=Warm,fontSize=13.sp); TextButton(model::retry,enabled=!state.loading) { Text("Retry connection") } } }
        }
    }
}

@Composable
private fun Composer(state: PhoneState,draft: String,onDraft: (String)->Unit,model: PhoneModel,send: ()->Unit) {
    var permissions by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().background(Ink).border(BorderStroke(.5.dp,Line)).padding(horizontal=16.dp,vertical=10.dp)) {
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
            Box(Modifier.size(4.dp).background(White)); MicroLabel(state.selected?.provider ?: state.provider,Modifier.padding(start=8.dp))
            Text(" / ",color=Muted,fontSize=10.sp)
            MicroLabel(state.selected?.cwd?.let(::folderName) ?: "Personal",Modifier.weight(1f))
            Box {
                TextButton({permissions=true},enabled=!state.busy && state.selected!=null,contentPadding=PaddingValues(horizontal=8.dp,vertical=0.dp),modifier=Modifier.height(48.dp)) {
                    Glyph("shield",Modifier.size(12.dp),if(state.permission=="full") Warm else Muted)
                    MicroLabel(when(state.permission) { "edit" -> "Can edit"; "full" -> "Full access"; else -> "Read only" },Modifier.padding(start=6.dp),if(state.permission=="full") Warm else Muted)
                }
                DropdownMenu(permissions,{permissions=false},containerColor=Panel) {
                    listOf("readonly" to "Read only","edit" to "Edit files","full" to "Full access").forEach { (value,label) -> DropdownMenuItem(text={Text(label)},onClick={model.permission(value);permissions=false}) }
                }
            }
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(26.dp)).background(Panel).border(1.dp,if(draft.isNotBlank()) White.copy(alpha=.22f) else Line,RoundedCornerShape(26.dp)).padding(5.dp),verticalAlignment=Alignment.CenterVertically) {
            PresenceOrb(Modifier.size(38.dp),state.busy)
            BasicTextField(draft,{onDraft(it.take(4000))},modifier=Modifier.weight(1f).padding(horizontal=6.dp,vertical=9.dp).heightIn(min=24.dp,max=128.dp).semantics { contentDescription="Message Ally" },textStyle=TextStyle(color=White,fontFamily=Geist,fontSize=14.sp,lineHeight=22.sp),cursorBrush=SolidColor(White),maxLines=5,decorationBox={ inner -> if(draft.isEmpty()) Text("Hey, what’s on your mind?",color=Muted,fontSize=13.sp); inner() })
            val enabled=state.busy || (state.selected!=null && draft.isNotBlank() && !state.loading)
            IconButton(onClick={if(state.busy) model.stop() else send()},enabled=enabled,modifier=Modifier.size(48.dp).semantics { contentDescription=if(state.busy) "Stop response" else "Send message" }) {
                Box(Modifier.size(34.dp).background(if(enabled) White else Color.White.copy(alpha=.06f),CircleShape),contentAlignment=Alignment.Center) { Glyph(if(state.busy) "stop" else "send",Modifier.size(18.dp),if(enabled) Ink else Muted) }
            }
        }
        Spacer(Modifier.height(5.dp))
    }
}

@Composable
private fun ChatLibrary(state: PhoneState,model: PhoneModel,modifier: Modifier,onSelect: ()->Unit) {
    var search by rememberSaveable { mutableStateOf("") }
    val visible=state.chats.filter { it.title.contains(search,true) || it.cwd.contains(search,true) }
    LazyColumn(modifier.fillMaxWidth(),contentPadding=PaddingValues(24.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
        item { MicroLabel("Your workspace"); Text("Conversations",fontFamily=Geist,fontSize=29.sp,letterSpacing=(-.8).sp,modifier=Modifier.padding(top=8.dp,bottom=20.dp)) }
        item { Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Panel).padding(horizontal=14.dp,vertical=14.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) { Glyph("search",Modifier.size(17.dp),Muted); BasicTextField(search,{search=it},textStyle=TextStyle(color=White,fontFamily=Geist,fontSize=14.sp),singleLine=true,cursorBrush=SolidColor(White),modifier=Modifier.weight(1f).semantics { contentDescription="Search conversations" },decorationBox={inner -> if(search.isEmpty()) Text("Search chats or projects",color=Muted,fontSize=13.sp); inner() }) } }
        item { Row(Modifier.padding(vertical=10.dp),horizontalArrangement=Arrangement.spacedBy(8.dp)) { listOf("codex","claude").forEach { provider ->
            val selected=state.provider==provider
            TextButton({model.catalog(provider)},enabled=!state.loading,shape=RoundedCornerShape(8.dp),colors=ButtonDefaults.textButtonColors(containerColor=if(selected) Panel else Color.Transparent),contentPadding=PaddingValues(horizontal=18.dp)) { Text(provider.replaceFirstChar { it.uppercase() },color=if(selected) White else Muted,fontSize=13.sp) }
        } } }
        if(state.busy) item { Text("Finish the current response before switching chats.",color=Warm,fontSize=12.sp) }
        visible.groupBy { it.cwd }.forEach { (folder,chats) ->
            item(key="folder:$folder") { Row(Modifier.padding(top=14.dp,bottom=8.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) { Glyph("folder",Modifier.size(14.dp),Muted); MicroLabel(folderName(folder)); Text("${chats.size}",fontFamily=Mono,color=Muted,fontSize=9.sp) } }
            items(chats,key={it.id}) { chat ->
                val selected=state.selected?.id==chat.id
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(if(selected) Panel else Color.Transparent).clickable(enabled=!state.busy && !state.loading) { model.select(chat.id); onSelect() }.padding(horizontal=12.dp,vertical=15.dp),verticalAlignment=Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text(chat.title.replace(Regex("\\s+")," "),fontFamily=Geist,fontSize=14.sp,lineHeight=21.sp,maxLines=2,overflow=TextOverflow.Ellipsis); if(selected) Text("Current conversation",color=Muted,fontSize=10.sp,modifier=Modifier.padding(top=4.dp)) }
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
private fun PhoneInbox(inbox: List<JSONObject>,modifier: Modifier) {
    val activity=LocalActivity.current ?: return
    LazyColumn(modifier.fillMaxWidth(),contentPadding=PaddingValues(24.dp),verticalArrangement=Arrangement.spacedBy(24.dp)) {
        item { MicroLabel("From your desktop"); Text("For you",fontFamily=Geist,fontSize=29.sp,modifier=Modifier.padding(top=8.dp)) }
        if(inbox.isEmpty()) item { Column(Modifier.fillMaxWidth().padding(vertical=70.dp),horizontalAlignment=Alignment.CenterHorizontally) { Glyph("inbox",Modifier.size(32.dp),Muted); Text("All caught up",fontSize=19.sp,modifier=Modifier.padding(top=20.dp)); Text("Notes and requests will appear here.",color=Muted,fontSize=12.sp,modifier=Modifier.padding(top=8.dp)) } }
        items(inbox,key={it.optString("id")}) { card ->
            Column(Modifier.fillMaxWidth().border(1.dp,Line,RoundedCornerShape(8.dp)).padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                MicroLabel(if(card.optBoolean("command")) "Your approval needed" else "Desktop note",color=if(card.optBoolean("command")) Warm else Muted)
                Text(card.optString("title"),fontSize=17.sp); MessageBody(card.optString("body"))
                if(card.optBoolean("command")) {
                    Text(card.optString("action").replace('_',' '),fontFamily=Mono,fontSize=11.sp,color=Muted)
                    if(card.has("url")) Text(card.optString("url"),fontSize=12.sp)
                    if(card.has("seconds")) Text("${card.optInt("seconds")} seconds · opens your timer app",fontSize=12.sp)
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                        OutlinedButton({DeviceLink.decide(activity,card,false)},shape=RoundedCornerShape(8.dp)) { Text("Decline") }
                        Button({DeviceLink.decide(activity,card,true)},shape=RoundedCornerShape(8.dp)) { Text("Allow once") }
                    }
                } else TextButton({DeviceLink.dismiss(activity,card.optString("id"))}) { Text("Dismiss",color=Muted) }
            }
        }
    }
}

@Composable
private fun PhoneSettings(link: String,modifier: Modifier) {
    val context=LocalContext.current
    val prefs=remember { DeviceLink.prefs(context) }
    var quiet by remember { mutableStateOf(prefs.getBoolean("deviceQuietHours",false)) }
    var muted by remember { mutableStateOf(prefs.getBoolean("muted",false)) }
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
private fun ToggleRow(title: String,subtitle: String,value: Boolean,change: (Boolean)->Unit) {
    Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text(title,fontSize=14.sp); Text(subtitle,color=Muted,fontSize=11.sp) }; Switch(value,change,colors=SwitchDefaults.colors(checkedThumbColor=Ink,checkedTrackColor=White,uncheckedTrackColor=Panel,uncheckedBorderColor=Line)) }
}
@Composable
private fun ChatApproval(request: JSONObject, sending: Boolean, answer: (String, Map<String, String>) -> Unit) {
    var values by remember(request.optString("id")) { mutableStateOf<Map<String, String>>(emptyMap()) }
    val fields = request.optJSONArray("fields"); val actions = request.optJSONArray("actions")
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Panel).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(request.optString("title"), color = Warm); Text(request.optString("detail"), fontSize = 12.sp)
        for (i in 0 until (fields?.length() ?: 0)) { val field = fields!!.getJSONObject(i); val id = field.getString("id"); val options = field.optJSONArray("options")
            Text(field.optString("label"), fontSize = 12.sp)
            for (j in 0 until (options?.length() ?: 0)) { val option = options!!.getJSONObject(j); FilterChip(selected = values[id] == option.optString("value"), onClick = { values = values + (id to option.optString("value")) }, label = { Text(option.optString("label")) }, enabled = !sending) }
            if (field.optBoolean("freeText")) OutlinedTextField(values[id] ?: "", { values = values + (id to it.take(4000)) }, visualTransformation = if (field.optBoolean("secret")) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None)
        }
        val complete = (0 until (fields?.length() ?: 0)).all { val f = fields!!.getJSONObject(it); !f.optBoolean("required") || !values[f.getString("id")].isNullOrBlank() }
        for (i in 0 until (actions?.length() ?: 0)) { val action = actions!!.getJSONObject(i); Button(onClick = { answer(action.getString("value"), values) }, enabled = !sending && (complete || action.optString("value") in setOf("decline", "cancel", "reject"))) { Text(action.optString("label")) } }
    }
}

