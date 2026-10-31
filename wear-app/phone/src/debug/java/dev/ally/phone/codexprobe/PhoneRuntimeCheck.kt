package dev.ally.phone.codexprobe

import android.content.Context
import dev.ally.phone.codex.CodexRpc
import dev.ally.phone.codex.PhoneMcpServer
import dev.ally.phone.codex.PhoneCodexTools
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.io.File

/** Model-free debug check of the production runtime configuration and account transport. */
internal object PhoneRuntimeCheck {
    fun run(context:Context,display:(String)->Unit)=runBlocking {
        val result=JSONObject().put("modelTurns",0);var client:CodexRpc?=null;var mcp:PhoneMcpServer?=null
        try {
            val start=android.os.SystemClock.elapsedRealtime()
            result.put("stage","construct");client=CodexRpc(context){_,_->};result.put("stage","initialize");client.initialize()
            result.put("initializeMs",android.os.SystemClock.elapsedRealtime()-start)
            result.put("stage","account");result.put("account",client.request("account/read",JSONObject().put("refreshToken",false)))
            val config=client.request("config/read",JSONObject().put("includeLayers",false)).getJSONObject("config")
            result.put("shellDisabled",config.optJSONObject("features")?.optBoolean("shell_tool",true)==false)
                .put("fileReadDisabled",config.optJSONObject("features")?.optBoolean("view_image",true)==false)
            result.put("stage","models");result.put("models",client.request("model/list",JSONObject().put("limit",100)).optJSONArray("data")?.length()?:0)
            val listed=java.util.concurrent.atomic.AtomicInteger()
            val phoneTools=PhoneCodexTools(context,"codex:00000000-0000-0000-0000-000000000000",{"readonly"},{false})
            val offered=phoneTools.list();result.put("offeredTools",org.json.JSONArray((0 until offered.length()).map{offered.getJSONObject(it).getString("name")}))
            mcp=PhoneMcpServer({listed.incrementAndGet();offered},phoneTools::call)
            result.put("stage","mcp-thread-start")
            client.request("thread/start",JSONObject().put("ephemeral",true).put("cwd",client.workspace.path).put("sandbox","danger-full-access").put("approvalPolicy","on-request").put("config",JSONObject().put("mcp_servers",JSONObject().put("runtime_check",JSONObject().put("url",mcp.url).put("required",true)))))
            repeat(30){if(listed.get()==0)kotlinx.coroutines.delay(100)}
            result.put("mcpToolsListed",listed.get()>0)
            result.put("ok",true)
        }catch(e:Exception){result.put("ok",false).put("error","${e.javaClass.simpleName}: ${e.message}")}
        finally{client?.close();mcp?.close();result.put("closed",true);File(context.filesDir,"phone-codex-runtime-check.json").writeText(result.toString(2));display(result.toString(2));android.util.Log.i("AllyCodexRuntime",result.toString())}
    }
}
