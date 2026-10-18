package dev.ally.phone

import android.app.Application
import android.content.Intent
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.ally.device.ChatWorkspace
import dev.ally.device.DeviceLink
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.UUID

class PhoneModel(app: Application) : AndroidViewModel(app) {
    private val prefs = DeviceLink.prefs(app)
    private val initial = prefs.getString("phonePendingChat", null) ?: prefs.getString("phoneChat", "")!!
    private val workspace = ChatWorkspace(viewModelScope, initial,
        { id -> PhoneConversation(app, id, viewModelScope, id == initial && !prefs.getBoolean("phoneMultichatMigrated", false), prefs.getString("phoneSlot:$id", id)!!) }, { it.state })
    val state = workspace.state
    private var refreshingRunning = false
    private var lastRunning: Pair<List<PhoneChat>, String>? = null
    private var lastAttention = emptyList<PhoneChat>()
    init {
        prefs.edit().putBoolean("phoneMultichatMigrated", true).apply()
        workspace.restore(prefs.getStringSet("phoneOpenChats", emptySet())!!.filter { id ->
            val slot = prefs.getString("phoneSlot:$id", id)
            listOf("phoneTurn", "phonePendingText", "phoneInputText").any { prefs.contains("chat:$slot:$it") }
        })
    }
    private val current get() = workspace.current
    fun select(id: String) {
        if (state.value.recording || state.value.transcribing || state.value.importingShare) return
        if (state.value.selected == null && workspace.selected.isBlank()) {
            prefs.edit().putString("phoneSlot:$id", workspace.selected).commit()
            current.select(id); workspace.alias(id)
        } else workspace.open(id)
        prefs.edit().putStringSet("phoneOpenChats", prefs.getStringSet("phoneOpenChats", emptySet())!! + id).apply()
        prefs.edit().putString("phoneChat", id).apply()
        val target = current
        lastRunning?.let { (rows, status) -> target.runningSnapshot(rows, status,lastAttention) }
        viewModelScope.launch { target.refreshSelected() }
        viewModelScope.launch { refreshRunning() }
    }
    fun newChat() {
        if (state.value.recording || state.value.transcribing) return
        val source = current
        viewModelScope.launch {
            try {
                val request = prefs.getString("phoneCreateRequest", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("phoneCreateRequest", it).commit() }
                val r = source.request("/v1/chats", JSONObject().put("provider", source.state.value.provider).put("requestId", request))
                prefs.edit().remove("phoneCreateRequest").apply()
                select(r.getJSONObject("chat").getString("id"))
            } catch (e: Exception) { if (e is kotlinx.coroutines.CancellationException) throw e; source.voiceError(e.message ?: "Could not create chat") }
        }
    }
    fun send(text: String) = current.send(text)
    fun acceptAssistantTurn(chatId: String, turnId: String) {
        select(chatId)
        check(workspace.selected == chatId) { "Open the accepted conversation to see your response" }
        current.acceptAssistantTurn(turnId)
    }
    fun inputMode(value: String) = current.inputMode(value)
    fun queueChange(change: JSONObject) = current.queueChange(change)
    fun catalog(provider: String = state.value.provider, more: Boolean = false) = current.catalog(provider, more)
    suspend fun refreshSelected() = current.refreshSelected()
    suspend fun refreshUnread() = current.refreshUnread()
    suspend fun viewed(receipt: dev.ally.device.ChatReadReceipt) = current.viewed(receipt)
    suspend fun refreshRunning() {
        if (refreshingRunning) return
        refreshingRunning = true
        try {
            val source = current
            lastRunning?.let { (rows, status) -> source.runningSnapshot(rows, status) }
            source.refreshRunning()
            val snapshot = source.state.value
            lastRunning = snapshot.running to snapshot.runningStatus
            lastAttention=snapshot.attentionChats
            workspace.controllers.forEach { it.runningSnapshot(snapshot.running, snapshot.runningStatus,lastAttention) }
        } finally { refreshingRunning = false }
    }
    fun older() = current.older()
    fun permission(value: String) = current.permission(value)
    fun receiveShare(intent: Intent) = current.receiveShare(intent)
    fun importUris(uris: List<Uri>, text: String = "") = current.importUris(uris, text)
    fun shareText(text: String) = current.shareText(text)
    fun removeShared(key: String) = current.removeShared(key)
    fun discardShare() = current.discardShare()
    fun startRecording() = current.startRecording()
    fun finishRecording() = current.finishRecording()
    fun finishAssistantRecording() = current.finishRecording(review = false)
    fun cancelRecording() = current.cancelRecording()
    fun voiceDraftRead() = current.voiceDraftRead()
    fun voiceError(message: String) = current.voiceError(message)
    fun retry() = current.retry()
    fun dismissInput() = current.dismissInput()
    fun stop() = current.stop()
    fun resume() = current.resume()
    fun answer(action: String, values: Map<String, String>) = current.answer(action, values)
    override fun onCleared() { workspace.controllers.forEach { it.close() }; super.onCleared() }
}
