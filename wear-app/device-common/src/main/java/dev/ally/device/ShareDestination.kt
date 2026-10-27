package dev.ally.device
import org.json.JSONArray
import org.json.JSONObject
object ShareDestination {
    fun pcSelection(snapshot:JSONObject):JSONObject? {
        val selected=snapshot.optJSONObject("selected")?:return null
        val id=selected.optString("chatId");val provider=selected.optString("provider")
        if(provider !in listOf("codex","claude")||!id.matches(Regex("[\\w:-]{1,240}")))return null
        return JSONObject().put("id",id).put("provider",provider).put("title",selected.optString("title","PC conversation").take(200))
    }
    fun message(chat:JSONObject,requestId:String,text:String,attachments:List<String>,permission:String):JSONObject {
        val provider=chat.getString("provider");val id=chat.getString("id")
        require(provider in listOf("codex","claude") && id.isNotBlank())
        require(requestId.isNotBlank() && text.length<=12000 && attachments.size<=6 && (text.isNotBlank() || attachments.isNotEmpty()))
        require(permission in listOf("readonly","edit","full"))
        return JSONObject().put("provider",provider).put("chatId",id).put("requestId",requestId).put("executionLocation","pc").put("text",text).put("permission",permission).put("attachments",JSONArray(attachments))
    }
}

