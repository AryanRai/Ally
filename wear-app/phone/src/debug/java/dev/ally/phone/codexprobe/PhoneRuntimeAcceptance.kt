package dev.ally.phone.codexprobe

import android.content.Context
import dev.ally.phone.codex.PhoneCodex
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import dev.ally.device.DeviceLink
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Explicit DUMP-protected debug entry. Uses the same coordinator as the real chat UI. */
internal object PhoneRuntimeAcceptance {
    fun advanced(context:Context,bridgeOnly:Boolean=false,display:(String)->Unit)=runBlocking {
        val out=File(context.filesDir,"phone-codex-advanced-acceptance.json")
        val result=JSONObject().put("startedAt",System.currentTimeMillis()).put("modelPrompts",0)
        fun note(stage:String){result.put("stage",stage);out.writeText(result.toString(2));display(stage)}
        suspend fun request(path:String,body:JSONObject?=null)=checkNotNull(PhoneCodex.request(path,body))
        suspend fun done(id:String):JSONObject=withTimeout(120_000){while(true){val t=request("/v1/turns/$id");if(t.optString("status") in setOf("done","error"))return@withTimeout t;delay(100)};error("Unreachable")}
        suspend fun idle(){withTimeout(15_000){while(PhoneCodex.status.value.busy)delay(100)};delay(300)}
        try {
            check(!PhoneCodex.status.value.busy){"A phone request is already active"}
            note("waiting-for-paired-desktop")
            DeviceLink.resume(context)
            withTimeout(45_000){DeviceLink.status.first{it=="Connected"}}
            val chat=PhoneCodex.create(context);result.put("chatId",chat)
            if(!bridgeOnly){note("steer")
            val first=request("/v1/messages",JSONObject().put("chatId",chat).put("requestId",UUID.randomUUID().toString()).put("text","Count from 1 to 1000, one number per line. Do not use tools."));val id=first.getString("id");result.put("modelPrompts",1)
            withTimeout(60_000){while(true){val t=request("/v1/turns/$id");check(t.optString("status")=="running"){"Turn ended before steering: ${t.optString("error")}"};if(t.optString("liveText").isNotBlank())break;delay(30)}}
            val body=JSONObject().put("requestId",UUID.randomUUID().toString()).put("mode","steer").put("text","Stop counting now. Reply with ALLY_PHONE_STEER_OK and finish. Do not use tools.")
            val steer=request("/v1/chats/$chat/input",body);check(steer.optString("mode")=="steered");result.put("steerAccepted",true)
            check(request("/v1/chats/$chat/input",body).optString("mode")=="steered");result.put("steerDuplicateReceipt",true)
            val ended=done(id);result.put("steerStatus",ended.optString("status")).put("steerReply",ended.optJSONObject("reply")?.optString("text"));check(ended.optString("status")=="done"){ended.optString("error")};check(ended.getJSONObject("reply").getString("text").contains("ALLY_PHONE_STEER_OK"));idle()
            }
            note("read-only-desktop-tool")
            val bridge=request("/v1/messages",JSONObject().put("chatId",chat).put("requestId",UUID.randomUUID().toString()).put("text","Use desktop_chats exactly once with action=list, provider=codex, offset=0. Report only whether it succeeded and the number of chats returned. Do not forward, read individual chats, use phone_control, or use any other tool."));result.put("modelPrompts",if(bridgeOnly)1 else 2)
            val bridgeTurn=done(bridge.getString("id"));result.put("bridgeTurn",bridgeTurn);check(bridgeTurn.optString("status")=="done"){bridgeTurn.optString("error")}
            val steps=bridgeTurn.optJSONArray("steps")?:org.json.JSONArray();check((0 until steps.length()).any{steps.getJSONObject(it).optString("name")=="desktop_chats" && steps.getJSONObject(it).optString("status")=="done"}){"No successful desktop_chats tool call observed"};idle()
            result.put("ok",true);note("complete")
        }catch(e:Exception){result.put("ok",false).put("error","${e.javaClass.simpleName}: ${e.message}");note("failed")}
        finally{if(PhoneCodex.status.value.busy)PhoneCodex.stopAll();out.writeText(result.toString(2));display(result.toString(2))}
    }
    fun run(context:Context,display:(String)->Unit)=runBlocking {
        val result=JSONObject().put("startedAt",System.currentTimeMillis()).put("modelPrompts",0)
        val out=File(context.filesDir,"phone-codex-acceptance.json")
        fun note(stage:String){result.put("stage",stage);out.writeText(result.toString(2));display(stage)}
        suspend fun read(path:String)=checkNotNull(PhoneCodex.request(path,null))
        suspend fun idle(){withTimeout(15_000){while(PhoneCodex.status.value.busy)delay(100)};delay(300)}
        try {
            PhoneCodex.install(context)
            check(!PhoneCodex.status.value.busy){"A phone request is already active"}
            val chat=PhoneCodex.create(context);result.put("chatId",chat)
            val body=JSONObject().put("chatId",chat).put("requestId",UUID.randomUUID().toString()).put("text","Reply with exactly ALLY_PHONE_REPLY_OK. Do not use any tools.")
            note("reply-and-queue")
            val receipt=checkNotNull(PhoneCodex.request("/v1/messages",body));val turn=receipt.getString("id")
            result.put("firstTurn",turn).put("modelPrompts",1)
            val duplicate=PhoneCodex.request("/v1/messages",body)
            check(duplicate?.getString("id")==turn){"Duplicate submit created a different receipt"};result.put("duplicateReceipt",true)
            val queued=checkNotNull(PhoneCodex.request("/v1/chats/$chat/input",JSONObject().put("mode","queue").put("requestId",UUID.randomUUID().toString()).put("text","Reply with exactly ALLY_PHONE_QUEUE_OK. Do not use any tools.")))
            check(queued.optString("mode")=="queued");result.put("queueAccepted",true).put("modelPrompts",2)
            var streamed=false
            val first=withTimeout(150_000){while(true){val t=read("/v1/turns/$turn");streamed=streamed||t.optString("liveText").isNotBlank();if(t.optString("status") in setOf("done","error"))return@withTimeout t;delay(100)};error("Unreachable")}
            result.put("first",first).put("streamObserved",streamed);check(first.optString("status")=="done"){first.optString("error")}
            check(first.getJSONObject("reply").optString("text").trim()=="ALLY_PHONE_REPLY_OK"){"Unexpected first reply"}
            note("waiting-for-queued-reply")
            val history=withTimeout(150_000){while(true){val h=read("/v1/chats/$chat");val messages=h.getJSONArray("messages");if((0 until messages.length()).any{messages.getJSONObject(it).optString("text").trim()=="ALLY_PHONE_QUEUE_OK"})return@withTimeout h;if(!PhoneCodex.status.value.busy)error("Queue ended without expected reply");delay(100)};error("Unreachable")}
            result.put("queueReply",true).put("historyMessageCount",history.getJSONArray("messages").length());idle()
            note("stop-active-request")
            val stop=checkNotNull(PhoneCodex.request("/v1/messages",JSONObject().put("chatId",chat).put("requestId",UUID.randomUUID().toString()).put("text","Count from 1 to 1000, one number per line. Do not use tools.")))
            val stopId=stop.getString("id");result.put("stopTurn",stopId).put("modelPrompts",3)
            withTimeout(30_000){while(!PhoneCodex.status.value.busy)delay(50)}
            delay(1500);PhoneCodex.request("/v1/chats/$chat/stop",JSONObject())
            val stopped=withTimeout(15_000){while(true){val t=read("/v1/turns/$stopId");if(t.optString("status")=="error")return@withTimeout t;delay(100)};error("Unreachable")}
            result.put("stopResult",stopped.optString("error"));check(stopped.optString("error")=="Stopped"){"Unexpected Stop result"};idle()
            result.put("ok",true);note("complete")
        }catch(e:Exception){result.put("ok",false).put("error","${e.javaClass.simpleName}: ${e.message}");note("failed")}
        finally{if(PhoneCodex.status.value.busy)PhoneCodex.stopAll();out.writeText(result.toString(2));display(result.toString(2))}
    }
}
