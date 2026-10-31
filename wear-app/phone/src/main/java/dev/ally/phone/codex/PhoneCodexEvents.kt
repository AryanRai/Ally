package dev.ally.phone.codex

import org.json.JSONArray
import org.json.JSONObject

/** Public app-server items only. Reasoning and raw tool arguments/results never become captions. */
internal object PhoneCodexEvents {
    private fun rows(turn:JSONObject,key:String)=turn.optJSONArray(key)?:JSONArray().also{turn.put(key,it)}
    private fun message(turn:JSONObject,items:JSONObject,id:String)=items.optJSONObject(id)?:JSONObject().put("text","").put("phase","").also{items.put(id,it);rows(turn,"publicItemOrder").put(id)}
    fun accept(turn:JSONObject,method:String,p:JSONObject):Boolean {
        if(method !in setOf("item/started","item/agentMessage/delta","item/completed"))return false
        val items=turn.optJSONObject("publicItems")?:JSONObject().also{turn.put("publicItems",it)}
        val item=p.optJSONObject("item")
        if(method=="item/agentMessage/delta") {
            val id=p.optString("itemId");if(id.isBlank())return true
            val row=message(turn,items,id)
            row.put("text",row.optString("text")+p.optString("delta"));render(turn,items);return true
        }
        if(item==null)return true
        val id=item.optString("id");if(id.isBlank())return true
        when(item.optString("type")) {
            "agentMessage"->{
                val row=message(turn,items,id)
                row.put("phase",item.optString("phase"))
                if(method=="item/completed"){
                    row.put("text",item.optString("text"));row.put("complete",true)
                    if(row.optString("phase")=="commentary" && !row.optBoolean("published")){
                        row.put("published",true)
                        rows(turn,"progress").put(JSONObject().put("id",id).put("kind","commentary").put("complete",true).put("text",row.optString("text")))
                        rows(turn,"timeline").put(JSONObject().put("id",id).put("type","update").put("text",row.optString("text")))
                    }
                }
                render(turn,items)
            }
            "mcpToolCall"->{
                val steps=rows(turn,"steps")
                val step=(0 until steps.length()).map{steps.getJSONObject(it)}.firstOrNull{it.optString("id")==id}
                    ?:JSONObject().put("id",id).put("name",item.optString("tool","Phone tool")).put("startedAt",System.currentTimeMillis()).also{steps.put(it);rows(turn,"timeline").put(JSONObject().put("id",id).put("type","tool").put("stepId",id))}
                step.put("status",if(method=="item/started")"running" else if(item.optString("status")=="failed")"error" else "done")
                if(method=="item/completed")step.put("endedAt",System.currentTimeMillis())
                turn.put("activity",if(method=="item/started")step.optString("name") else "Working…")
            }
        }
        return true
    }
    private fun render(turn:JSONObject,items:JSONObject){
        val order=rows(turn,"publicItemOrder")
        turn.put("liveText",(0 until order.length()).map{items.getJSONObject(order.getString(it))}.filter{it.optString("phase")!="commentary"}.map{it.optString("text")}.filter(String::isNotBlank).joinToString("\n\n"))
    }
}
