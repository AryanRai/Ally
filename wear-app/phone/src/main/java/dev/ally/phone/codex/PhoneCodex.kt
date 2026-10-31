package dev.ally.phone.codex

import android.content.Context
import android.util.AtomicFile
import dev.ally.device.DeviceLink
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.net.URLDecoder
import java.util.UUID

data class PhoneCodexStatus(val signedIn:Boolean=false,val busy:Boolean=false,val message:String="Sign in separately on this phone",val userCode:String="",val verificationUrl:String="")

/** Owns only phone-created threads. Codex owns generation/tool calling; Ally adapts its events. */
object PhoneCodex {
    val status=MutableStateFlow(PhoneCodexStatus())
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
    private var context:Context?=null
    private val lock=Any()
    private var data=JSONObject().put("chats",JSONObject()).put("turns",JSONObject()).put("receipts",JSONObject())
    private var job:Job?=null
    @Volatile private var rpc:CodexRpc?=null
    @Volatile private var currentChat:String?=null
    @Volatile private var currentTurn:String?=null
    @Volatile private var serverTurn:String?=null
    @Volatile private var completion:CompletableDeferred<JSONObject>?=null
    private var initialized=false
    private val app get()=checkNotNull(context)
    fun install(c:Context)=synchronized(lock) {
        if(initialized)return@synchronized
        context=c.applicationContext;initialized=true
        runCatching{data=JSONObject(File(app.filesDir,"phone-codex-chats.json").readText())}
        val turns=data.getJSONObject("turns")
        turns.keys().forEach {id-> val t=turns.getJSONObject(id);if(t.optString("status")=="running")t.put("status","error").put("error","Phone process ended. Inspect this chat before retrying; nothing was resent.")}
        save()
        scope.launch {status.collect{if(it.signedIn)DeviceLink.prefs(app).edit().putBoolean(SIGNED_IN,true).apply()}}
    }
    /** The phone account outlives the process; each request still checks it before running. */
    private const val SIGNED_IN="phone.codex.signedIn"
    fun knownSignedIn(c:Context)=status.value.signedIn || DeviceLink.prefs(c).getBoolean(SIGNED_IN,false)
    private fun forgetSignIn()=DeviceLink.prefs(app).edit().putBoolean(SIGNED_IN,false).apply()
    /** Newest first, for the power-hold picker. */
    fun recentChats():List<JSONObject> =synchronized(lock){val all=data.getJSONObject("chats");all.keys().asSequence().map{all.getJSONObject(it)}.sortedByDescending{c->c.getJSONArray("messages").let{m->if(m.length()==0)0L else m.getJSONObject(m.length()-1).optLong("timestamp")}.coerceAtLeast(c.getJSONObject("chat").optLong("createdAt"))}.map{JSONObject(it.getJSONObject("chat").toString())}.toList()}
    fun available(c:Context)=File(c.applicationInfo.nativeLibraryDir,"libcodex.so").canExecute()
    fun owns(id:String)=synchronized(lock){data.getJSONObject("chats").has(id)}
    fun chats():JSONArray=synchronized(lock){JSONArray(data.getJSONObject("chats").keys().asSequence().map{data.getJSONObject("chats").getJSONObject(it).getJSONObject("chat")}.toList())}
    fun create(c:Context):String {
        install(c);val id="codex:${UUID.randomUUID()}"
        synchronized(lock){data.getJSONObject("chats").put(id,JSONObject().put("chat",JSONObject().put("id",id).put("provider","codex").put("title","Phone · New chat").put("cwd","On this phone").put("createdAt",System.currentTimeMillis())).put("messages",JSONArray()).put("permission","readonly").put("queue",JSONArray()).put("queueRevision",0));save()}
        return id
    }
    fun routedChat(c:Context,request:String):String=synchronized(lock){
        val routes=data.optJSONObject("routes")?:JSONObject().also{data.put("routes",it)}
        routes.optString(request).takeIf{it.isNotBlank()}?.let{return@synchronized it}
        create(c).also{routes.put(request,it);save()}
    }
    private fun chat(id:String)=data.getJSONObject("chats").getJSONObject(id)
    private fun turn(id:String)=data.getJSONObject("turns").getJSONObject(id)
    private fun save(){
        val file=AtomicFile(File(app.filesDir,"phone-codex-chats.json"));var output:java.io.FileOutputStream?=null
        try{output=file.startWrite();output.write(data.toString().toByteArray());file.finishWrite(output)}catch(e:Exception){output?.let(file::failWrite);throw e}
    }
    private fun queue(id:String)=JSONObject().put("chatId",id).put("revision",chat(id).optLong("queueRevision")).put("items",chat(id).getJSONArray("queue"))
    private fun input(text:String)=JSONArray().put(JSONObject().put("type","text").put("text",text))
    private fun receipt(key:String,body:JSONObject,produce:()->JSONObject):JSONObject {
        val receipts=data.getJSONObject("receipts");val signature=PhoneToolPolicy.revision(body.toString())
        receipts.optJSONObject(key)?.let{check(it.getString("signature")==signature){"Request id already used for different input"};return JSONObject(it.getJSONObject("result").toString())}
        val result=produce();receipts.put(key,JSONObject().put("signature",signature).put("result",result));save();return result
    }
    /** Intercepts only known phone thread ids/receipt ids; all desktop routes retain their existing transport. */
    suspend fun request(path:String,body:JSONObject?):JSONObject? {
        if(!initialized)return null
        val parts=path.substringBefore('?').split('/').filter(String::isNotEmpty).map{URLDecoder.decode(it,"UTF-8")}
        val selected=body?.optString("chatId")?.takeIf(::owns) ?: parts.getOrNull(2)?.takeIf(::owns)
        if(parts.getOrNull(1)=="turns" && parts.getOrNull(2)?.let{ synchronized(lock){data.getJSONObject("turns").has(it)} }==true){
            val id=parts[2]
            if(parts.size==3 && body==null)return synchronized(lock){JSONObject(turn(id).toString()).put("queue",queue(turn(id).getString("chatId")))}
            if(parts.getOrNull(3)=="input")return addInput(turn(id).getString("chatId"),body?:error("Input required"))
        }
        if(selected==null)return null
        val id=selected
        if(parts.getOrNull(1)=="messages")return submit(id,body?:error("Input required"))
        if(parts.getOrNull(1)=="chats"){
            return when(parts.getOrNull(3)){
                null->synchronized(lock){JSONObject(chat(id).toString()).apply {val t=currentTurn?.takeIf{currentChat==id};put("running",t!=null);put("activeTurnId",t?:JSONObject.NULL)}}
                "access"->synchronized(lock){val p=body!!.getString("permission");require(p in setOf("readonly","edit","full"));chat(id).put("permission",p);save();JSONObject().put("permission",p).put("message","Phone access updated; protected actions remain manual")}
                "stop"->{stopAll();JSONObject().put("stopped",true)}
                "input"->addInput(id,body?:error("Input required"))
                else->error("Unsupported phone chat route")
            }
        }
        if(parts.getOrNull(1)=="queue")return synchronized(lock){
            if(body!=null){val q=chat(id).getJSONArray("queue");check(body.getLong("revision")==chat(id).optLong("queueRevision")){"Queue changed; refresh first"};val item=body.optString("id");when(body.getString("action")){
                "remove"->{val index=(0 until q.length()).firstOrNull{q.getJSONObject(it).getString("id")==item}?:error("Queue item missing");q.remove(index)}
                "edit"->{val row=(0 until q.length()).map{q.getJSONObject(it)}.firstOrNull{it.getString("id")==item}?:error("Queue item missing");val text=body.getString("text");require(text.length in 1..12000);row.put("text",text)}
                else->error("This phone queue action is unavailable")};chat(id).put("queueRevision",chat(id).optLong("queueRevision")+1);save()}
            JSONObject().put("queue",queue(id))
        }
        error("Unsupported local phone route")
    }
    private fun checkInput(body:JSONObject):String {require(body.optJSONArray("attachments")?.length().let{it==null||it==0}){"Phone file inputs are not enabled yet; your draft is kept"};return body.getString("text").also{require(it.length in 1..12000)}}
    private suspend fun submit(id:String,b:JSONObject):JSONObject {
        val text=checkInput(b);val request=UUID.fromString(b.getString("requestId")).toString()
        return synchronized(lock){receipt("send:$request",b){
            check(currentTurn==null && job?.isActive!=true){"Another phone request is active. Stop it or queue in that chat"}
            val t=UUID.randomUUID().toString();val row=JSONObject().put("id",t).put("chatId",id).put("status","running").put("liveText","").put("activity","Starting Codex on this phone…").put("startedAt",System.currentTimeMillis()).put("delivery","accepted").put("progress",JSONArray())
            data.getJSONObject("turns").put(t,row);chat(id).getJSONArray("messages").put(JSONObject().put("id","$t-user").put("role","user").put("text",text).put("timestamp",System.currentTimeMillis()))
            chat(id).getJSONObject("chat").put("title","Phone · ${text.take(65)}")
            try {CodexPhoneService.start(app)} catch(e:Exception) {finish(t,"Phone runtime could not start: ${e.message}");throw e}
            currentChat=id;currentTurn=t
            job=scope.launch {runChat(id,t,text)}
            JSONObject().put("id",t)
        }}
    }
    private suspend fun addInput(id:String,b:JSONObject):JSONObject {
        val text=checkInput(b);val key=UUID.fromString(b.getString("requestId")).toString();val mode=b.getString("mode")
        require(mode in setOf("queue","steer"))
        if(mode=="steer"){
            val r=rpc?:error("No active phone turn");val t=serverTurn?:error("Phone turn is still starting; use Queue")
            synchronized(lock){data.getJSONObject("receipts").optJSONObject("input:$key")?.let{check(it.optString("signature")==PhoneToolPolicy.revision(b.toString())){"Request id already used for different input"};check(it.getJSONObject("result").optString("mode")!="uncertain"){"Steer delivery is uncertain. Inspect this chat; it will not be resent"};return it.getJSONObject("result")};check(currentChat==id);data.getJSONObject("receipts").put("input:$key",JSONObject().put("signature",PhoneToolPolicy.revision(b.toString())).put("result",JSONObject().put("mode","uncertain")));save()}
            r.request("turn/steer",JSONObject().put("threadId",synchronized(lock){chat(id).getString("threadId")}).put("expectedTurnId",t).put("input",input(text)))
            return synchronized(lock){val result=JSONObject().put("mode","steered");data.getJSONObject("receipts").getJSONObject("input:$key").put("result",result);chat(id).getJSONArray("messages").put(JSONObject().put("id",key).put("role","user").put("text",text).put("timestamp",System.currentTimeMillis()));save();result}
        }
        return synchronized(lock){receipt("input:$key",b){check(currentChat==id && currentTurn!=null){"No active phone request to queue after"};chat(id).getJSONArray("queue").put(JSONObject().put("id",key).put("text",text).put("state","queued").put("attachments",JSONArray()));chat(id).put("queueRevision",chat(id).optLong("queueRevision")+1);JSONObject().put("mode","queued").put("queue",queue(id))}}
    }
    private suspend fun runChat(id:String,first:String,firstText:String){
        var tools:PhoneCodexTools?=null;var mcp:PhoneMcpServer?=null;var client:CodexRpc?=null
        try {
            status.value=status.value.copy(busy=true,message="Codex is running on this phone")
            tools=PhoneCodexTools(app,id,{synchronized(lock){chat(id).optString("permission","readonly")}},{currentChat==id && job?.isActive==true},
                {p->synchronized(lock){chat(id).put("permission",p);save()};DeviceLink.prefs(app).edit().putString("phonePermission:$id",p).apply()})
            val activeTools=tools;mcp=PhoneMcpServer({val offered=activeTools.list();synchronized(lock){currentTurn?.let{turn(it).put("offeredTools",JSONArray((0 until offered.length()).map{i->offered.getJSONObject(i).getString("name")}))}};offered},activeTools::call)
            client=CodexRpc(app,::event);rpc=client;client.initialize()
            if(client.request("account/read",JSONObject().put("refreshToken",false)).isNull("account")){forgetSignIn();status.value=status.value.copy(signedIn=false);error("Sign in to Codex on this phone in Settings first")}
            status.value=status.value.copy(signedIn=true)
            // Ally's own tools are pre-approved, as on the PC: the per-request phone-control review, the halo
            // and the policy's protected controls are the consent, not a Codex prompt on every message.
            val approve=JSONObject().put("approval_mode","approve")
            val config=JSONObject().put("mcp_servers",JSONObject().put("ally_phone",JSONObject().put("url",mcp.url).put("required",true).put("tool_timeout_sec",360)
                .put("tools",JSONObject().put("phone_control",approve).put("desktop_chats",JSONObject(approve.toString())).put("request_access",JSONObject(approve.toString())))))
            val thread=synchronized(lock){chat(id).optString("threadId")}
            val params=JSONObject().put("cwd",client.workspace.path).put("approvalPolicy","on-request").put("sandbox","danger-full-access").put("config",config)
                .put("developerInstructions","You are Ally on the user's phone. Shell and private filesystem access are disabled. Use only ally_phone tools for phone work. Never approve or answer your own requests. Sensitive/send/pay/approval controls remain manual. Use desktop_chats only when offered and connected, with explicit review for handoffs. Do not automatically resend uncertain actions or switch providers. User-visible public progress belongs in commentary; provide complete final answers.")
            val loaded=if(thread.isBlank())client.request("thread/start",params) else client.request("thread/resume",params.put("threadId",thread))
            val threadId=loaded.getJSONObject("thread").getString("id");synchronized(lock){chat(id).put("threadId",threadId);save()}
            var t=first;var text=firstText
            while(true){
                currentTurn=t;completion=CompletableDeferred();val done=completion!!
                val start=client.request("turn/start",JSONObject().put("threadId",threadId).put("input",input(text)))
                serverTurn=start.getJSONObject("turn").getString("id")
                val end=withTimeout(55*60_000){done.await()};check(end.optString("status")=="completed"){end.optJSONObject("error")?.optString("message")?:"Phone turn ${end.optString("status")}"}
                synchronized(lock){finish(t,null)}
                tools.requestEnded()
                val next=synchronized(lock){val q=chat(id).getJSONArray("queue");if(q.length()==0)null else q.getJSONObject(0).also{q.remove(0);chat(id).put("queueRevision",chat(id).optLong("queueRevision")+1)}}?:break
                t=UUID.randomUUID().toString();text=next.getString("text")
                synchronized(lock){data.getJSONObject("turns").put(t,JSONObject().put("id",t).put("chatId",id).put("status","running").put("startedAt",System.currentTimeMillis()).put("progress",JSONArray()).put("liveText","").put("delivery","accepted"));chat(id).getJSONArray("messages").put(JSONObject().put("id","$t-user").put("role","user").put("text",text).put("timestamp",System.currentTimeMillis()));save()}
            }
        }catch(e:Exception){synchronized(lock){currentTurn?.let{finish(it,if(e is CancellationException)"Stopped" else e.message?:"Phone Codex failed")}}}
        finally {withContext(NonCancellable+Dispatchers.IO){tools?.close();mcp?.close();client?.close();rpc=null;serverTurn=null;completion=null;currentChat=null;currentTurn=null;job=null;status.value=status.value.copy(busy=false,message="Phone Codex is idle");CodexPhoneService.idle(app)}}
    }
    private fun finish(id:String,error:String?){val t=turn(id);if(t.optString("status")!="running")return
        t.put("status",if(error==null)"done" else "error").put("error",error?:"").put("durationMs",System.currentTimeMillis()-t.optLong("startedAt"))
        val text=t.optString("liveText");t.put("reply",JSONObject().put("text",text))
        chat(t.getString("chatId")).getJSONArray("messages").put(JSONObject().put("id","$id-assistant").put("role","assistant").put("text",text.ifBlank{error?:""}).put("timestamp",System.currentTimeMillis()).put("steps",t.optJSONArray("steps")?:JSONArray()).put("timeline",t.optJSONArray("timeline")?:JSONArray()).put("durationMs",t.optLong("durationMs")));save()
    }
    private fun event(method:String,p:JSONObject)=synchronized(lock){
        val t=currentTurn?.let{data.getJSONObject("turns").optJSONObject(it)}
        if(t!=null && PhoneCodexEvents.accept(t,method,p))return@synchronized
        when(method){
            "ally/serverRequestRejected"->{if(t!=null){val rejected=t.optJSONArray("rejectedRequests")?:JSONArray().also{t.put("rejectedRequests",it)};rejected.put(p.optString("method"))}}
            "turn/started"->serverTurn=p.optJSONObject("turn")?.optString("id")
            "turn/completed"->completion?.complete(p.optJSONObject("turn")?:JSONObject().put("status","failed"))
            "ally/processExited"->completion?.completeExceptionally(IllegalStateException("Phone Codex process ended"))
        }
    }
    fun signIn(c:Context){install(c);synchronized(lock){check(job?.isActive!=true){"Stop the active phone request before signing in"};CodexPhoneService.start(app)
        job=scope.launch {var client:CodexRpc?=null;var login:String?=null
            try {status.value=PhoneCodexStatus(busy=true,message="Starting phone Codex…");client=CodexRpc(app,::event);rpc=client;client.initialize()
                val account=client.request("account/read",JSONObject().put("refreshToken",false));if(!account.isNull("account")){status.value=PhoneCodexStatus(signedIn=true,message="Signed in on this phone");return@launch}
                val result=client.request("account/login/start",JSONObject().put("type","chatgptDeviceCode"));login=result.getString("loginId")
                status.value=PhoneCodexStatus(busy=true,message="Complete sign-in in your browser. No PC login is copied.",userCode=result.getString("userCode"),verificationUrl=result.getString("verificationUrl"))
                withTimeout(300_000){while(isActive){delay(2000);if(!client.request("account/read",JSONObject().put("refreshToken",false)).isNull("account")){status.value=PhoneCodexStatus(signedIn=true,message="Signed in on this phone");break}}}
            }catch(e:Exception){status.value=PhoneCodexStatus(message=if(e is CancellationException)"Phone sign-in stopped" else e.message?:"Phone sign-in failed")}
            finally{withContext(NonCancellable){if(login!=null)runCatching{client?.request("account/login/cancel",JSONObject().put("loginId",login))};client?.close();rpc=null;job=null;CodexPhoneService.idle(app)}}
        }
    }}
    fun signOut(c:Context){install(c);synchronized(lock){check(job?.isActive!=true){"Stop the active phone request before signing out"};CodexPhoneService.start(app)
        job=scope.launch {var client:CodexRpc?=null
            try{status.value=status.value.copy(busy=true,message="Signing out on this phone…");client=CodexRpc(app,::event);rpc=client;client.initialize();client.request("account/logout");forgetSignIn();status.value=PhoneCodexStatus(message="Signed out on this phone. PC accounts are unchanged")}
            catch(e:Exception){status.value=status.value.copy(busy=false,message=e.message?:"Phone sign-out failed")}
            finally{withContext(NonCancellable){client?.close();rpc=null;job=null;CodexPhoneService.idle(app)}}
        }
    }}
    fun stopAll(){PhoneLocalDecisions.cancel();job?.cancel();rpc?.let {r->scope.launch {runCatching{r.close()}}}}
}


