package dev.ally.phone.codex

import android.content.Context
import android.app.KeyguardManager
import dev.ally.phone.AllyControlService
import dev.ally.phone.ControlBridge
import dev.ally.device.DeviceLink
import kotlinx.coroutines.*
import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID
import java.net.URL
import java.net.HttpURLConnection
import java.net.URLEncoder

internal class PhoneCodexTools(private val context:Context,private val chat:String,private val permission:()->String,private val active:()->Boolean,private val grantAccess:(String)->Unit={}):java.io.Closeable {
    private var grant:String?=null
    private var controlDenied=false
    private fun schema(properties:JSONObject,required:List<String>)=JSONObject().put("type","object").put("properties",properties).put("required",JSONArray(required)).put("additionalProperties",false)
    private fun string(description:String)=JSONObject().put("type","string").put("description",description)
    private fun tool(name:String,description:String,input:JSONObject)=JSONObject().put("name",name).put("description",description).put("inputSchema",input)
    fun list():JSONArray=JSONArray().put(tool("phone_control","Inspect or operate this phone with a native user-approved request-scoped grant. First call view. Every action needs the exact latest revision. Pay/approve, sensitive apps and Ally decisions are protected. Settings can be browsed freely; each change there (toggle, slider, dialog button, typing) asks the user first. No shell or arbitrary files.",
        schema(JSONObject().put("action",JSONObject().put("type","string").put("enum",JSONArray(listOf("view","screenshot","perform","end"))))
            .put("revision",string("Revision returned by latest view"))
            .put("operation",JSONObject().put("type","object").put("description","One operation: type=tap x y; swipe x y endX endY durationMs; text text; key key=home/back/recents; open_app packageName")),listOf("action"))))
        .put(tool("request_access","Ask the user to raise this phone chat's access to edit or full when the current access blocks the request. They answer in an Allow/Deny notification; only Allow changes access. Give a short reason. Never retry a denied request in the same turn.",
            schema(JSONObject().put("permission",JSONObject().put("type","string").put("enum",JSONArray(listOf("edit","full")))).put("reason",string("Why the access is needed, in one sentence")),listOf("permission","reason"))))
        .apply {if(DeviceLink.status.value=="Connected")put(tool("desktop_chats","Use the existing authenticated Ally PC connection to list/read desktop chats, see which chats are replying right now (running: desktop, phone-started and watch turns, Codex and Claude apps), or hand off work with user review. Unavailable when PC is offline. Never retry an uncertain handoff automatically.",schema(JSONObject().put("action",JSONObject().put("type","string").put("enum",JSONArray(listOf("list","running","read","forward")))).put("provider",JSONObject().put("type","string").put("enum",JSONArray(listOf("codex","claude")))).put("offset",JSONObject().put("type","integer").put("minimum",0).put("maximum",100000)).put("chatId",string("Exact id from list")).put("text",string("Message for a reviewed handoff")).put("requestId",string("Stable UUID for duplicate-safe forward")),listOf("action"))))}
    suspend fun call(name:String,args:JSONObject):JSONObject {
        check(active()){ "Phone request ended" }
        val result=when(name){"phone_control"->control(args);"desktop_chats"->desktop(args);"request_access"->access(args);else->error("Unsupported phone tool")}
        if(name=="phone_control" && args.optString("action")=="screenshot") return JSONObject().put("content",JSONArray().put(JSONObject().put("type","image").put("mimeType",result.getString("mimeType")).put("data",result.getString("data"))))
        return JSONObject().put("content",JSONArray().put(JSONObject().put("type","text").put("text",result.toString())))
    }
    private val levels=listOf("readonly","edit","full")
    /** Same consent path as phone approvals: a heads-up Allow/Deny notification, answered only by the user. */
    private suspend fun access(a:JSONObject):JSONObject {
        val level=a.optString("permission");require(level=="edit"||level=="full"){"Ask for edit or full access"}
        val reason=a.optString("reason").trim();require(reason.length in 1..600){"Give one short reason"}
        if(levels.indexOf(permission())>=levels.indexOf(level))return JSONObject().put("granted",true).put("permission",permission()).put("message","This chat already has that access")
        val allowed=try{PhoneLocalDecisions.review(context,"Ally wants $level access",reason)}catch(_:TimeoutCancellationException){false}
        if(!allowed)return JSONObject().put("granted",false).put("message","The user kept the current access. Continue within it or explain what is blocked.")
        grantAccess(level)
        return JSONObject().put("granted",true).put("permission",level).put("message","Access is now $level for this chat. Protected actions still need the user.")
    }
    private fun unlocked(){check(!context.getSystemService(KeyguardManager::class.java).isDeviceLocked){"Unlock the phone manually to continue"}}
    private suspend fun params():JSONObject {
        unlocked()
        if(grant==null){
            check(!controlDenied){"Phone control was denied for this request"}
            controlDenied=true
            if(!PhoneLocalDecisions.review(context,"Let this phone chat inspect and control the phone?","Until this request ends, at most 60 minutes. A visible halo, touch markers and Stop stay available. Send, payment and approval controls remain manual.")){controlDenied=true;error("Phone control denied")}
            check(active());unlocked()
            controlDenied=false
            val id=UUID.randomUUID().toString()
            ControlBridge.local(context,"control.grant",JSONObject().put("grantId",id).put("chatId",chat).put("title","Phone Codex").put("expiresAt",System.currentTimeMillis()+60*60_000))
            grant=id
        }
        return JSONObject().put("grantId",grant).put("chatId",chat)
    }
    private suspend fun view(p:JSONObject):JSONObject {
        // Right after the approval prompt closes, Android is still switching windows and briefly
        // shows only system bars; retry that case for a few seconds before calling it unreadable.
        repeat(UNREADABLE_RETRIES) { attempt ->
            unlocked();check(active())
            val v=ControlBridge.local(context,"control.view",p)
            val xml=try { PhoneToolPolicy.inspect(v.getString("xml")) } catch(e:IllegalArgumentException) {
                if(e.message==PhoneToolPolicy.UNREADABLE && attempt<UNREADABLE_RETRIES-1){ kotlinx.coroutines.delay(500); return@repeat }
                throw e
            }
            return v.put("xml",xml).put("revision",PhoneToolPolicy.revision(xml))
        }
        error(PhoneToolPolicy.UNREADABLE)
    }
    private companion object { const val UNREADABLE_RETRIES=6 }
    /** The model gets the compact screen; the raw tree stays internal for validation and the revision. */
    private fun forModel(v:JSONObject)=JSONObject(v.toString()).apply{put("screen",PhoneToolPolicy.compact(getString("xml")));remove("xml")}
    private suspend fun control(a:JSONObject):JSONObject {
        if(a.optString("action")=="end"){end();return JSONObject().put("ended",true)}
        val p=params()
        val read=runCatching{view(p)}
        val unreadable=read.exceptionOrNull()?.message==PhoneToolPolicy.UNREADABLE
        if(unreadable && a.optString("action")=="perform"){
            // Home, Back and opening an app don't depend on what is on screen.
            check(permission()!="readonly"){"This phone chat is read only. Change access in Ally first"}
            val op=a.getJSONObject("operation");PhoneToolPolicy.validateBlind(op)
            unlocked();check(active());ControlBridge.local(context,"control.perform",p.put("operation",op))
            return runCatching{forModel(view(p))}.getOrElse{JSONObject().put("performed",true).put("note",it.message)}
        }
        val v=read.getOrThrow()
        return when(a.getString("action")){
            "view"->forModel(v)
            "screenshot"->{ControlBridge.local(context,"control.screenshot",p)}
            "perform"->{check(permission()!="readonly"){"This phone chat is read only. Change access in Ally first"}
                val op=a.getJSONObject("operation")
                // Opening an app or a system key does not depend on the screen; taps, swipes and typing must match it.
                if(op.optString("type") !in setOf("open_app","key")) check(a.optString("revision")==v.getString("revision")){"Screen changed; inspect a fresh view before acting"}
                PhoneToolPolicy.validate(op,v.getString("xml"),v.getInt("width"),v.getInt("height"),PhoneLocalDecisions.pending.value!=null)
                // Changing a setting needs the user's yes each time, and the screen must still be the one they approved.
                PhoneToolPolicy.settingsChange(op,v.getString("xml"))?.let { change ->
                    val yes=try{PhoneLocalDecisions.review(context,"Change a phone setting?",change)}catch(_:TimeoutCancellationException){false}
                    check(yes){"The user declined this settings change; nothing was changed"}
                    check(view(p).getString("revision")==v.getString("revision")){"Screen changed while waiting for the user's answer; inspect again before acting"}
                }
                // Recheck immediately before dispatch; never replay an operation after timeout.
                unlocked();check(active());ControlBridge.local(context,"control.perform",p.put("operation",op));forModel(view(p))
            }
            else->error("Unsupported phone control action")
        }
    }
    private suspend fun desktop(a:JSONObject):JSONObject {
        check(DeviceLink.status.value=="Connected"){"PC is offline; desktop tools are unavailable"}
        val action=a.getString("action");val id=a.optString("chatId")
        if(action in setOf("read","forward"))require(id.matches(Regex("(codex|claude):[\\w-]{8,100}"))){"Choose an exact desktop chat"}
        val path=when(action){"list"->{val provider=a.optString("provider","codex");require(provider in setOf("codex","claude"));val offset=a.optInt("offset",0);require(offset in 0..100000);"/v1/chats?provider=$provider&offset=$offset"};"running"->"/v1/running";"read"->"/v1/chats/${URLEncoder.encode(id,"UTF-8")}";"forward"->"/v1/messages";else->error("Unsupported desktop operation")}
        val body=if(action=="forward"){
            check(permission()!="readonly"){"Read-only phone chat cannot hand off work"}
            val text=a.getString("text");require(text.length in 1..12000);val req=UUID.fromString(a.getString("requestId")).toString()
            check(PhoneLocalDecisions.review(context,"Send this work to desktop chat $id?",text)){"Handoff denied"};check(active())
            JSONObject().put("provider",id.substringBefore(':')).put("chatId",id).put("permission","readonly").put("requestId",req).put("text",text)
        }else null
        return withContext(Dispatchers.IO){
            val prefs=DeviceLink.prefs(context);val url=URL(prefs.getString("endpoint","https://ally.prxptn.com")!!.trimEnd('/')+path)
            require(url.protocol=="https");val c=url.openConnection() as HttpURLConnection
            try{c.connectTimeout=8000;c.readTimeout=20000;c.instanceFollowRedirects=false;c.setRequestProperty("Authorization","Bearer ${prefs.getString("token","")}")
                if(body!=null){c.requestMethod="POST";c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(body.toString().toByteArray())}}
                val status=c.responseCode;check(status in 200..299){"Desktop unavailable (HTTP $status). Inspect delivery before any retry"}
                val bytes=c.inputStream.use{input->val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);while(true){val n=input.read(buffer);if(n<0)break;check(out.size()+n<=1_000_000){"Desktop response too large"};out.write(buffer,0,n)};out.toByteArray()};JSONObject(bytes.toString(Charsets.UTF_8))
            }finally{c.disconnect()}
        }
    }
    private suspend fun end(){val id=grant?:return;grant=null;ControlBridge.local(context,"control.end",JSONObject().put("grantId",id).put("chatId",chat))}
    suspend fun requestEnded(){withContext(Dispatchers.Main){end()};controlDenied=false}
    override fun close(){runBlocking{withContext(Dispatchers.Main){end()}}}
}

