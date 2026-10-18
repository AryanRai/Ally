package dev.ally.device

import android.app.Activity
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class SurfaceSnapshot(val state: AssistantActivityState, val checkedAt: Long) {
    fun checkedLabel(): String = if(checkedAt==0L) "Tap refresh to check" else "Checked ${SimpleDateFormat("HH:mm",Locale.getDefault()).format(Date(checkedAt))}"
    val lead get() = state.chats.firstOrNull { it.status=="needs_input" } ?: state.chats.firstOrNull { it.active } ?: state.chats.firstOrNull()
    companion object {
        fun parse(raw: String?, checkedAt: Long, failed: Boolean, now: Long = System.currentTimeMillis()): SurfaceSnapshot {
            val state=runCatching { AssistantActivityParser.parse(JSONObject(raw ?: "{}")) }.getOrDefault(AssistantActivityState())
            return SurfaceSnapshot(state.copy(stale=failed || (checkedAt>0 && now-checkedAt>120000)),checkedAt)
        }
    }
}

/** Bounded read-only refresh. Widgets/tiles never create a turn or start a microphone. */
object SurfaceStatus {
    fun load(c: Context): SurfaceSnapshot {
        val p=DeviceLink.prefs(c)
        return SurfaceSnapshot.parse(p.getString("surfaceActivity",null),p.getLong("surfaceChecked",0),p.getBoolean("surfaceFailed",false))
    }
    fun save(c: Context, json: JSONObject) {
        AssistantActivityParser.parse(json)
        DeviceLink.prefs(c).edit().putString("surfaceActivity",json.toString()).putLong("surfaceChecked",System.currentTimeMillis()).putBoolean("surfaceFailed",false).apply()
        c.sendBroadcast(Intent(c.packageName+".SURFACE_CHANGED").setPackage(c.packageName))
    }
    fun failed(c: Context) { DeviceLink.prefs(c).edit().putBoolean("surfaceFailed",true).apply(); c.sendBroadcast(Intent(c.packageName+".SURFACE_CHANGED").setPackage(c.packageName)) }
    suspend fun refresh(c: Context): SurfaceSnapshot {
        try { save(c,fetch(c)) } catch(e: CancellationException) { throw e } catch(_: Exception) { failed(c) }
        return load(c)
    }
    suspend fun fetch(c: Context): JSONObject = withContext(Dispatchers.IO) {
        val p=DeviceLink.prefs(c)
        val url=URL(p.getString("endpoint","https://ally.prxptn.com")!!.trimEnd('/')+"/v1/assistant/activity")
        require(url.protocol=="https" || (url.protocol=="http" && url.host in setOf("127.0.0.1","localhost")))
        val connection=url.openConnection() as HttpURLConnection
        try {
            connection.connectTimeout=3000; connection.readTimeout=4000; connection.instanceFollowRedirects=false
            connection.setRequestProperty("Authorization","Bearer ${p.getString("token","")}")
            check(connection.responseCode in 200..299)
            JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        } finally { connection.disconnect() }
    }
}

object SurfaceActions {
    fun validChat(id: String) = id.matches(Regex("(?:(?:codex|claude):)?[A-Za-z0-9_-]{1,120}"))
    fun intent(c: Context, action: String, chatId: String? = null): Intent = (c.packageManager.getLaunchIntentForPackage(c.packageName) ?: Intent()).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        putExtra("allySurface",action)
        if(chatId!=null && validChat(chatId)) putExtra("allySurfaceChat",chatId)
        data=android.net.Uri.parse("ally://surface/$action/${chatId.orEmpty()}")
    }
    fun handle(activity: Activity, intent: Intent, select: (String)->Unit) {
        val action=intent.getStringExtra("allySurface") ?: return
        val chat=intent.getStringExtra("allySurfaceChat")
        intent.removeExtra("allySurface"); intent.removeExtra("allySurfaceChat")
        when(action) {
            "voice" -> activity.window.decorView.post { if(!AllyAssistantService.showUnlocked()) android.widget.Toast.makeText(activity,"Select Ally as your assistant first",android.widget.Toast.LENGTH_SHORT).show() }
            "agents" -> activity.window.decorView.post { if(!AllyAssistantService.showMonitor()) android.widget.Toast.makeText(activity,"Select Ally as your assistant first",android.widget.Toast.LENGTH_SHORT).show() }
            "inbox" -> activity.startActivity(DeviceLink.inboxIntent(activity))
            "chat" -> if(chat!=null && validChat(chat)) select(chat)
        }
    }
}
