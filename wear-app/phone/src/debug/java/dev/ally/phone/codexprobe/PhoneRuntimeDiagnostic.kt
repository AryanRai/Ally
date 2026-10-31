package dev.ally.phone.codexprobe
import android.content.Context
import dev.ally.phone.codex.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.json.JSONArray
import java.io.File

/** Read only official thread/read and effective config; never logs tokens or private reasoning. */
internal object PhoneRuntimeDiagnostic {
    fun run(context:Context,display:(String)->Unit)=runBlocking {
        val out=JSONObject();var client:CodexRpc?=null;var mcp:PhoneMcpServer?=null
        try {
            check(!PhoneCodex.status.value.busy)
            val prior=JSONObject(File(context.filesDir,"phone-codex-advanced-acceptance.json").readText())
            val chat=PhoneCodex.request("/v1/chats/${prior.getString("chatId")}",null)!!
            val thread=chat.getString("threadId");out.put("threadId",thread)
            client=CodexRpc(context){method,_->display(method)};client.initialize()
            val config=client.request("config/read",JSONObject().put("includeLayers",false)).getJSONObject("config")
            out.put("features",config.optJSONObject("features")).put("modelCatalog",config.optString("model_catalog_json"))
            val read=client.request("thread/read",JSONObject().put("threadId",thread).put("includeTurns",true));val th=read.getJSONObject("thread")
            out.put("model",th.optString("model")).put("threadFields",JSONArray(th.keys().asSequence().toList()))
            val turns=th.optJSONArray("turns")?:JSONArray();val items=JSONArray()
            for(i in 0 until turns.length()){val rows=turns.getJSONObject(i).optJSONArray("items")?:JSONArray();for(j in 0 until rows.length()){
                val item=rows.getJSONObject(j);val type=item.optString("type");if(type!="reasoning")items.put(JSONObject().put("type",type).put("tool",item.optString("tool")).put("status",item.optString("status")).put("error",item.optJSONObject("error")?.optString("message")?.take(1000)).put("resultIsError",item.optJSONObject("result")?.optBoolean("isError")))
            }};out.put("items",items)
            val tools=PhoneCodexTools(context,"codex:00000000-0000-0000-0000-000000000000",{"readonly"},{false})
            mcp=PhoneMcpServer(tools::list,tools::call)
            val loaded=client.request("thread/start",JSONObject().put("ephemeral",true).put("cwd",client.workspace.path).put("sandbox","danger-full-access").put("approvalPolicy","on-request").put("config",JSONObject().put("mcp_servers",JSONObject().put("ally_phone",JSONObject().put("url",mcp.url).put("required",true)))))
            out.put("loadedModel",loaded.optString("model"))
            val statuses=client.request("mcpServerStatus/list",JSONObject().put("threadId",loaded.getJSONObject("thread").getString("id")).put("limit",100))
            val statusRows=statuses.optJSONArray("data")?:JSONArray();val summary=JSONArray()
            for(i in 0 until statusRows.length()){val s=statusRows.getJSONObject(i);summary.put(JSONObject().put("name",s.optString("name")).put("runtimeStatus",s.opt("runtimeStatus")).put("toolsError",s.opt("toolsError")).put("tools",JSONArray(s.optJSONObject("tools")?.keys()?.asSequence()?.toList()?:emptyList<String>())))}
            out.put("mcpStatus",summary).put("ok",true)
        }catch(e:Exception){out.put("error","${e.javaClass.simpleName}: ${e.message}")}
        finally{client?.close();mcp?.close();File(context.filesDir,"phone-codex-diagnostic.json").writeText(out.toString(2));display(out.toString(2))}
    }
}
