package dev.ally.device
import android.content.Intent
import android.os.Bundle
import android.graphics.Color
import android.widget.*
import android.text.Editable
import android.text.TextWatcher
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.UUID

/** Incoming shares are independent of the open composer. Selection never submits. */
class ShareToChatActivity : ComponentActivity() {
    private val prefs by lazy { DeviceLink.prefs(this) }
    private val store by lazy { ShareDraftStore(File(filesDir, "share-picker")) }
    private var draft = ShareDraft()
    private var rows = listOf<JSONObject>()
    private var selected: JSONObject? = null
    private var provider = "codex"
    private var offset: Int? = null
    private var query = ""
    private var busy = false
    private var loadingChats = false
    private var sendPhase:String?=null
    private var contextDetails=false
    private var note = ""
    private var arrivalPending = false
    private var handoffReceipt:JSONObject?=null
    private var offeredScreen: Pair<Intent, ContextHandoff.Snapshot>? = null
    private var chatRows: LinearLayout? = null
    private val pending get() = prefs.getString("sharePickerPending", null)?.let { JSONObject(it) }
    private val originalPicker=registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.OpenMultipleDocuments()){uris->
        if(uris.isNotEmpty()&&!busy&&pending==null)importOriginals(uris,"android_picker","")
    }
    private fun importOriginals(uris:List<android.net.Uri>,origin:String,text:String,intentPage:Int?=null){
        if(busy||pending!=null)return
        busy=true;render()
        lifecycleScope.launch{
            try{
                val sources=shareSources(this@ShareToChatActivity,uris)
                val oldKeys=draft.files.map{it.key}.toSet()
                draft=withContext(Dispatchers.IO){store.append(draft,text,sources)}
                val added=draft.files.filter{it.key !in oldKeys}
                val contexts=withContext(Dispatchers.IO){added.mapIndexed{i,item->ContinuityContext.envelope(origin,sharedText=text,sourceUri=uris.getOrNull(i)?.toString(),document=DocumentContext.describe(item,store.file(item)),intentPage=if(item.mimeType=="application/pdf")intentPage else null).toString()}}
                val media=MediaContinuation.snapshot?.invoke(this@ShareToChatActivity,null,text)?.takeIf{it.optString("urlSource")=="explicit_android_share"}
                draft=store.addContexts(draft,if(contexts.isEmpty())listOf(ContinuityContext.envelope(origin,sharedText=text,media=media).toString())else contexts)
                note="Original files copied into this private draft. Review files and context, choose a chat, then Send."
            }catch(e:Exception){if(e is CancellationException)throw e;note=e.message?:"Could not import original document"}
            finally{busy=false;render();load()}
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE); window.statusBarColor=Color.rgb(12,12,13);window.navigationBarColor=Color.rgb(12,12,13); draft = store.read()
        pending?.let { selected=it.getJSONObject("chat");provider=selected!!.getString("provider") }
        handoffReceipt=runCatching{JSONObject(prefs.getString("sharePickerHandoffReceipt",null)?:"")}.getOrNull()
        render()
        if(savedInstanceState==null && intent.action in listOf(Intent.ACTION_SEND,Intent.ACTION_SEND_MULTIPLE,ContextHandoffLauncher.ACTION)) receive(intent) else load()
    }
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent);setIntent(intent)
        if(pending!=null || busy){ContextHandoffLauncher.discard(intent);note="Finish or retry the previous share first. Its destination is locked.";render();return}
        receive(intent)
    }
    private fun receive(value:Intent) {
        if(value.action == ContextHandoffLauncher.ACTION) { receiveHandoff(value); return }
        if(pending!=null){note="Previous send is unconfirmed. Retry uses the same request.";render();load();return}
        selected=null
        val intentPage=value.getIntExtra("android.intent.extra.PAGE_NUMBER",-1).takeIf{it>=1}
        importOriginals(value.sharedUris(),"android_share",value.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty(),intentPage)
    }
    /** Only an in-process one-shot snapshot token is accepted, never arbitrary image extras. */
    private fun receiveHandoff(value: Intent) {
        val snapshot = ContextHandoffLauncher.take(value)
        if(snapshot == null) { ContextHandoffLauncher.discard(value);note="Screen context expired. Open Ally again to try a new handoff.";render();load();return }
        when(ContextHandoffDraftPolicy.review(draft,pending!=null)) {
            ContextHandoffDraftPolicy.Review.PENDING -> {
                snapshot.clear();ContextHandoffLauncher.discard(value);note="Your previous send is unconfirmed. Its draft and destination are preserved.";render();load();return
            }
            ContextHandoffDraftPolicy.Review.CHOOSE -> {
                busy=true;render();offeredScreen=value to snapshot
                val dialog=android.app.AlertDialog.Builder(this)
                    .setTitle("A shared draft is already saved")
                    .setMessage("Keep the saved content and add this new screen, or review the saved draft on its own. Nothing sends until you choose a chat and tap Send.")
                    .setPositiveButton("Add new screen") { _, _ -> offeredScreen=null;busy=false;importHandoff(value,snapshot) }
                    .setNegativeButton("Review saved draft") { _, _ -> offeredScreen=null;busy=false;snapshot.clear();ContextHandoffLauncher.discard(value);note="Saved draft preserved. New screen was not added.";render();load() }
                    .setOnCancelListener { offeredScreen=null;busy=false;snapshot.clear();ContextHandoffLauncher.discard(value);render();load() }
                    .show()
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    if(offeredScreen?.second===snapshot){offeredScreen=null;busy=false;snapshot.clear();ContextHandoffLauncher.discard(value);dialog.dismiss();if(!isFinishing&&!isDestroyed){note="New screen expired. Saved draft preserved.";render();load()}}
                },60_000)
                return
            }
            ContextHandoffDraftPolicy.Review.IMPORT -> Unit
        }
        importHandoff(value,snapshot)
    }
    private fun importHandoff(value: Intent, snapshot: ContextHandoff.Snapshot) {
        selected=null;busy=true;render()
        lifecycleScope.launch {
            try {
                val sources = snapshot.image?.let { image -> listOf(Triple("Phone-screen.png", "image/png", { java.io.ByteArrayInputStream(image) as java.io.InputStream })) }.orEmpty()
                draft=withContext(Dispatchers.IO){store.append(draft,snapshot.text,sources)}
                snapshot.context?.let{draft=store.addContexts(draft,listOf(it))}
                handoffReceipt=value.getStringExtra(ContextHandoffLauncher.RECEIPT)?.let{runCatching{JSONObject(it)}.getOrNull()}
                prefs.edit().putString("sharePickerHandoffReceipt",handoffReceipt?.toString()).apply()
                if(selected==null){
                    val offered=handoffReceipt?.optJSONObject("chat")?.let{chat->ShareDestination.pcSelection(JSONObject().put("selected",JSONObject(chat.toString()).put("chatId",chat.optString("id"))))}
                    (offered?:runCatching{ShareDestination.pcSelection(request("/v1/selection"))}.getOrNull())?.let{selected=it;provider=it.getString("provider")}
                }
                note="Phone context ready. Choose a conversation, review, then Send."
                arrivalPending = true
                ContextHandoffLauncher.reviewed(value)
            }catch(e:Exception){if(e is CancellationException)throw e;note=e.message?:"Could not import phone context"}
            finally{snapshot.clear();ContextHandoffLauncher.discard(value);busy=false;if(!isFinishing){render();load()}}
        }
    }
    override fun onDestroy() {
        offeredScreen?.let{(value,snapshot)->snapshot.clear();ContextHandoffLauncher.discard(value)};offeredScreen=null
        super.onDestroy()
    }
    private fun dp(value:Int)=(value*resources.displayMetrics.density).toInt()
    private fun font(name:String):android.graphics.Typeface {
        val id=resources.getIdentifier(name,"font",packageName)
        return if(id!=0) resources.getFont(id) else android.graphics.Typeface.DEFAULT
    }
    private fun panel(fill:Int, radius:Float=14f)=android.graphics.drawable.GradientDrawable().apply {
        setColor(fill);cornerRadius=dp(radius.toInt()).toFloat();setStroke(dp(1),Color.rgb(42,42,45))
    }
    private fun label(value:String,size:Float=15f)=TextView(this).apply {
        text=value;textSize=size;typeface=font("geist_regular");setTextColor(Color.rgb(244,244,245));setPadding(0,dp(10),0,dp(10))
    }
    private fun button(value:String,enabled:Boolean=true,action:()->Unit)=Button(this).apply {
        text=value;isEnabled=enabled;isAllCaps=false;typeface=font("geist_medium");textSize=14f;gravity=android.view.Gravity.CENTER_VERTICAL
        minHeight=dp(52);minimumHeight=dp(52);setPadding(dp(16),dp(10),dp(16),dp(10))
        setTextColor(if(enabled)Color.rgb(244,244,245) else Color.rgb(115,115,122));backgroundTintList=null
        background=android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x22ffffff),panel(Color.rgb(24,24,26)),null)
        layoutParams=LinearLayout.LayoutParams(-1,-2).apply { setMargins(0,dp(4),0,dp(4)) }
        setOnClickListener{action()}
    }
    private fun textInput(value:String,hintText:String,enabled:Boolean,changed:(String)->Unit)=EditText(this).apply {
        filters=arrayOf(android.text.InputFilter.LengthFilter(12000));setText(value);hint=hintText
        typeface=font("geist_regular");textSize=14f;setPadding(dp(16),dp(14),dp(16),dp(14));background=panel(Color.rgb(24,24,26))
        setTextColor(Color.WHITE);setHintTextColor(Color.rgb(153,153,158));isEnabled=enabled;maxLines=4
        layoutParams=LinearLayout.LayoutParams(-1,-2).apply { setMargins(0,dp(8),0,dp(12)) }
        addTextChangedListener(object:TextWatcher{
            override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
            override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){changed(s.toString())}
            override fun afterTextChanged(s:Editable?){}
        })
    }
    private fun render() {
        chatRows=null
        val scroll=ScrollView(this);val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;val inset=((if(packageName.endsWith(".watch")) 30 else 20)*resources.displayMetrics.density).toInt();setPadding(inset,inset,inset,inset);setBackgroundColor(Color.rgb(12,12,13))}
        scroll.addView(box);setContentView(scroll)
        box.addView(label("ALLY",28f).apply { typeface=font("tanker");letterSpacing=.05f })
        box.addView(label("Share to a conversation",18f))
        if(arrivalPending) {
            arrivalPending = false
            box.addView(label("◉ Screen review ready",17f).apply {
                setTextColor(Color.rgb(118,220,193));alpha=0f;scaleX=.5f;scaleY=.5f
                animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(700).start()
            })
        }
        if(draft.files.isNotEmpty()) {
            val previews=LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL }
            draft.files.filter{it.mimeType.startsWith("image/")}.take(3).forEach { file ->
                val options=android.graphics.BitmapFactory.Options().apply{inJustDecodeBounds=true}
                android.graphics.BitmapFactory.decodeFile(store.file(file).path,options)
                options.inSampleSize=(maxOf(options.outWidth,options.outHeight)/240).coerceAtLeast(1);options.inJustDecodeBounds=false
                android.graphics.BitmapFactory.decodeFile(store.file(file).path,options)?.let { bitmap ->
                    previews.addView(ImageView(this).apply{setImageBitmap(bitmap);scaleType=ImageView.ScaleType.CENTER_CROP;contentDescription=file.name;clipToOutline=true;background=panel(Color.rgb(24,24,26))},LinearLayout.LayoutParams(dp(72),dp(72)).apply{setMargins(0,0,dp(8),0)})
                }
            }
            box.addView(previews)
        }
        if(draft.files.isEmpty())box.addView(label("Shared message",12f))
        draft.files.forEach { file ->
            val row=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=android.view.Gravity.CENTER_VERTICAL}
            row.addView(label(file.name,12f),LinearLayout.LayoutParams(0,-2,1f))
            row.addView(button("Remove",!busy && pending==null){
                if(!busy && pending==null) {
                    try { draft=store.remove(draft,file.key);note="Removed ${file.name} from this draft." }
                    catch(e:Exception){note=e.message?:"Could not remove attachment"}
                    render()
                }
            }.apply{contentDescription="Remove ${file.name} from shared draft"},LinearLayout.LayoutParams(dp(100),-2))
            box.addView(row)
            val contextIndex=draft.contexts.indexOfFirst{JSONObject(it).optJSONObject("document")?.optJSONObject("value")?.optString("fileKey")==file.key}
            if(contextIndex>=0&&file.mimeType=="application/pdf")box.addView(button("Set current page for ${file.name}",!busy&&pending==null){
                val entry=EditText(this).apply{inputType=android.text.InputType.TYPE_CLASS_NUMBER;hint="Page number (from you)"}
                android.app.AlertDialog.Builder(this).setTitle("Current page · supplied by you").setMessage("Ally cannot read the other app's current page. Enter it only if you want to include it.").setView(entry)
                    .setPositiveButton("Add page context"){_,_->
                        if(!busy&&pending==null)runCatching{
                            val page=entry.text.toString().toIntOrNull()?:error("Enter a page number")
                            val currentIndex=draft.contexts.indexOfFirst{JSONObject(it).optJSONObject("document")?.optJSONObject("value")?.optString("fileKey")==file.key}
                            check(currentIndex>=0){"This document was removed"}
                            val updated=ContinuityContext.withUserPage(draft.contexts[currentIndex],page)
                            draft=draft.copy(contexts=draft.contexts.mapIndexed{i,value->if(i==currentIndex)updated else value});store.save(draft);note="Current page added as your supplied context."
                        }.onFailure{note=it.message?:"Could not set page context"}
                        render()
                    }.setNegativeButton("Cancel",null).show()
            })
        }
        box.addView(textInput(draft.text,"Message (optional)",!busy && pending==null){value->if(value.length<=12000){draft=draft.copy(text=value);store.save(draft)}})
        box.addView(button("Attach original document",!busy&&pending==null&&draft.files.size<6){originalPicker.launch(arrayOf("*/*"))})
        if(packageName.endsWith(".phone")&&MediaContinuation.review!=null)box.addView(button("Review video continuation on PC",!busy&&pending==null){
            val media=MediaContinuation.snapshot?.invoke(this,null,draft.text)?:JSONObject().put("reason","Share the original YouTube URL and enter its playback position.")
            MediaContinuation.review?.invoke(this,media)
        })
        if(draft.contexts.isNotEmpty()){
            box.addView(button(if(contextDetails)"Hide context details" else "Review context details · ${draft.contexts.size}",!busy){contextDetails=!contextDetails;render()})
            box.addView(label("Screenshots are screen context. Original documents are attached only when you share or choose their files. Missing metadata is marked unavailable.",12f))
            if(contextDetails)draft.contexts.forEachIndexed{index,value->
                box.addView(label(JSONObject(value).toString(2),11f).apply{setTextIsSelectable(true)})
                box.addView(button("Remove this context",!busy&&pending==null){draft=draft.copy(contexts=draft.contexts.filterIndexed{i,_->i!=index});store.save(draft);render()})
            }
        }
        box.addView(label("To: "+(selected?.optString("title")?:"Choose a chat"),16f))
        if(sendPhase!=null)box.addView(HandoffSendAnimationView(this,sendPhase=="accepted"),LinearLayout.LayoutParams(-1,dp(112)))
        else selected?.let {chat->box.addView(HandoffSwipeView(this,chat.optString("id"),chat.optString("title","Selected chat"),!busy&&pending==null&&(draft.text.isNotBlank()||draft.files.isNotEmpty())){send()},LinearLayout.LayoutParams(-1,dp(142)).apply{setMargins(0,dp(8),0,dp(8))})}
        box.addView(button(if(pending==null)"Send attachment" else "Retry same send",!busy && selected!=null && (draft.text.isNotBlank() || draft.files.isNotEmpty())){send()}.apply {
            gravity=android.view.Gravity.CENTER;setTextColor(Color.rgb(12,12,13));background=panel(if(isEnabled)Color.rgb(244,244,245)else Color.rgb(85,85,90),26f)
        })
        if(note.isNotBlank())box.addView(label(note,12f))
        if(pending==null){
            box.addView(label("Choose a conversation",14f))
            val providers=LinearLayout(this)
            listOf("codex","claude").forEach{value->providers.addView(button(value.replaceFirstChar{it.uppercase()},!busy){provider=value;rows=emptyList();load()},LinearLayout.LayoutParams(0,-2,1f))}
            box.addView(providers)
            box.addView(textInput(query,"Search loaded chats",!busy){query=it;showRows()})
            chatRows=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};box.addView(chatRows);showRows()
            box.addView(button("Discard shared draft",!busy){store.clear(draft);prefs.edit().remove("sharePickerHandoffReceipt").apply();finish()})
        }
    }
    private fun showRows(){
        val list=chatRows?:return;list.removeAllViews()
        rows.filter{it.optString("title").contains(query,true)||it.optString("cwd").contains(query,true)}.forEach{chat->
            list.addView(button((if(selected?.optString("id")==chat.optString("id")) "✓  " else "")+chat.optString("title","Untitled chat")+"\n"+chat.optString("provider").uppercase(),!busy){selected=JSONObject(chat.toString());note="Review the destination above, then tap Send.";render()})
        }
        if(rows.isEmpty())list.addView(label(if(busy||loadingChats)"Loading chats…" else "No chats loaded. Check your Ally connection.",12f))
        if(offset!=null)list.addView(button("Load more chats",!busy&&!loadingChats){load(true)})
    }
    private fun load(more:Boolean=false){
        // Directory refresh must not disable a known destination or recreate
        // the swipe surface underneath the user's finger.
        if(busy||loadingChats)return;loadingChats=true
        val requestedProvider=provider
        showRows()
        lifecycleScope.launch{
            try{
                val result=request("/v1/chats?provider="+requestedProvider+"&offset="+if(more)offset?:0 else 0)
                if(provider!=requestedProvider)return@launch
                val data=result.optJSONArray("chats")?:JSONArray()
                rows=((if(more)rows else emptyList())+(0 until data.length()).map{data.getJSONObject(it)}).distinctBy{it.optString("id")}
                offset=if(result.isNull("nextOffset"))null else result.optInt("nextOffset")
            }catch(e:Exception){if(e is CancellationException)throw e;note=e.message?:"Could not load chats"}
            finally{loadingChats=false;if(provider==requestedProvider)showRows()else load()}
        }
    }
    private fun send(){
        if(busy)return;val destination=selected?:return
        val reviewedText=try{ContinuityContext.message(draft.text,draft.contexts)}catch(e:IllegalArgumentException){note=e.message?:"Review context before sending";render();return}
        val plan=pending?:JSONObject().put("chat",JSONObject(destination.toString())).put("text",reviewedText).put("continuity",JSONArray(draft.contexts.map{JSONObject(it)})).put("requestId",UUID.randomUUID().toString()).put("handoff",handoffReceipt).also{
            check(prefs.edit().putString("sharePickerPending",it.toString()).commit()){"Could not preserve this share safely"}
        }
        busy=true;sendPhase="sending";note="Submitting to "+destination.optString("title")+"…";render()
        delivery(plan,"sending")
        lifecycleScope.launch{
            try{
                val files=draft.files.map{item->item.uploaded?:upload(item).also{asset->draft=draft.copy(files=draft.files.map{if(it.key==item.key)it.copy(uploaded=asset)else it});store.save(draft)}}
                val chat=plan.getJSONObject("chat");val id=chat.getString("id")
                val permissionKey=if(packageName.endsWith(".phone"))"phonePermission:"+id else "permission:"+id
                val slot=prefs.getString(if(packageName.endsWith(".phone"))"phoneSlot:"+id else "watchSlot:"+id,id)
                val permission=prefs.getString("chat:"+slot+":"+permissionKey,prefs.getString(permissionKey,"readonly"))!!
                val body=plan.optJSONObject("payload") ?: ShareDestination.message(chat,plan.getString("requestId"),plan.getString("text"),files.map{it.id},permission).also { payload ->
                    payload.put("queueAfterCurrent",request("/v1/chats/"+enc(id)).optBoolean("running"))
                    plan.put("payload",payload)
                    check(prefs.edit().putString("sharePickerPending",plan.toString()).commit()) { "Could not save send details" }
                }
                request("/v1/messages",body)
                delivery(plan,"accepted")
                prefs.edit().remove("sharePickerPending").remove("sharePickerHandoffReceipt").commit();store.clear(draft);draft=ShareDraft()
                sendPhase="accepted";render();delay(450)
                startActivity(packageManager.getLaunchIntentForPackage(packageName)!!.putExtra("openChat",id).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP));finish()
            }catch(e:Exception){if(e is CancellationException)throw e;delivery(plan,"failed");note=(e.message?:"Could not confirm send")+"\nDraft and destination saved. Retry uses the same request."}
            finally{busy=false;sendPhase=null;if(!isFinishing)render()}
        }
    }
    private fun delivery(plan:JSONObject,phase:String){val receipt=plan.optJSONObject("handoff")?:return;DeviceLink.sendControl(JSONObject().put("type","tap_delivery").put("handoffId",receipt.optString("handoffId")).put("nonce",receipt.optString("nonce")).put("messageId",plan.optString("requestId")).put("phase",phase))}
    private fun enc(value:String)=URLEncoder.encode(value,"UTF-8")
    private suspend fun upload(item:SharedFile):DeviceAttachment=withContext(Dispatchers.IO){
        val c=connection("/v1/attachments")
        try{
            c.requestMethod="POST";c.doOutput=true;c.readTimeout=120000;c.setFixedLengthStreamingMode(item.size)
            c.setRequestProperty("Content-Type",item.mimeType);c.setRequestProperty("X-Ally-Filename",enc(item.name))
            store.file(item).inputStream().use{input->c.outputStream.use{input.copyTo(it)}}
            AttachmentParser.one(result(c).getJSONObject("attachment"))?:error("Invalid attachment response")
        }finally{c.disconnect()}
    }
    private fun connection(route:String):HttpURLConnection{
        val url=URL(prefs.getString("endpoint","https://ally.prxptn.com")!!.trimEnd('/')+route)
        require(url.protocol=="https"){"Use the paired HTTPS Ally connection"}
        return(url.openConnection()as HttpURLConnection).apply{connectTimeout=8000;readTimeout=30000;instanceFollowRedirects=false;setRequestProperty("Authorization","Bearer "+prefs.getString("token",""))}
    }
    private fun result(c:HttpURLConnection):JSONObject{
        val status=c.responseCode;val json=JSONObject((if(status in 200..299)c.inputStream else c.errorStream).bufferedReader().use{it.readText()})
        check(status in 200..299){json.optString("error","Ally connection failed ("+status+")")};return json
    }
    private suspend fun request(route:String,body:JSONObject?=null):JSONObject=withContext(Dispatchers.IO){
        val c=connection(route);try{if(body!=null){c.requestMethod="POST";c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(body.toString().toByteArray())}};result(c)}finally{c.disconnect()}
    }
}

