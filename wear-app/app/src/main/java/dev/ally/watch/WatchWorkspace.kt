package dev.ally.watch

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.ally.device.ChatWorkspace
import kotlinx.coroutines.launch

class WatchViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("ally-watch", 0)
    private val initial = prefs.getString("chatId", "")!!
    private val workspace = ChatWorkspace(viewModelScope, initial,
        { id -> WatchConversation(app, id, viewModelScope, id == initial && !prefs.getBoolean("multichatMigrated", false), prefs.getString("watchSlot:$id", id)!!) }, { it.state })
    val state = workspace.state
    init {
        prefs.edit().putBoolean("multichatMigrated", true).apply()
        workspace.restore(prefs.getStringSet("watchOpenChats", emptySet())!!.filter { id ->
            val slot = prefs.getString("watchSlot:$id", id)
            listOf("turn", "inputText", "pendingText").any { prefs.contains("chat:$slot:$it") }
        })
        viewModelScope.launch { state.collect { s ->
            if (s.chatId != null && workspace.selected != s.chatId && (workspace.selected.isBlank() || workspace.selected.startsWith("draft:"))) {
                prefs.edit().putString("watchSlot:${s.chatId}", prefs.getString("watchSlot:${workspace.selected}", workspace.selected)).commit()
                workspace.alias(s.chatId)
            }
            if (s.chatId != null) prefs.edit().putString("chatId", s.chatId).putString("provider", s.provider)
                .putString("watchSlot:${s.chatId}", prefs.getString("watchSlot:${workspace.selected}", workspace.selected))
                .putStringSet("watchOpenChats", prefs.getStringSet("watchOpenChats", emptySet())!! + s.chatId).apply()
        } }
    }
    private val current get() = workspace.current
    var endpoint: String
        get() = current.endpoint
        set(value) { current.endpoint = value }
    var token: String
        get() = current.token
        set(value) { current.token = value }
    var foreground = false
        set(value) { field = value; current.foreground = value }
    val busy get() = current.busy
    val canSwitchChat get() = state.value.phase != Phase.RECORDING && !state.value.inputRecording
    fun selectChat(id: String) {
        if (!canSwitchChat || state.value.chatId == id) return
        current.stopSpeaking(); current.foreground = false
        workspace.open(id)
        current.foreground = foreground
    }
    fun openNotification(chat: String) { if (chat == state.value.chatId) refresh() else selectChat(chat) }
    fun newChat(provider: String = state.value.provider) {
        if (!canSwitchChat) return
        // An independent controller owns creation, including retries of its request ID.
        selectChat("draft:" + java.util.UUID.randomUUID())
        current.newChat(provider)
    }
    fun provider(value: String) = newChat(value)
    fun send(text: String) = current.send(text)
    fun acceptAssistantTurn(chatId: String, turnId: String) {
        selectChat(chatId)
        check(workspace.selected == chatId) { "Open the accepted conversation to see your response" }
        current.acceptAssistantTurn(turnId)
    }
    fun inputMode(value: String) = current.inputMode(value)
    fun queueChange(change: org.json.JSONObject) = current.queueChange(change)
    fun refresh() = current.refresh()
    suspend fun refreshSelected() = current.refreshSelected()
    suspend fun refreshUnread() = current.refreshUnread()
    suspend fun viewed(receipt: dev.ally.device.ChatReadReceipt) = current.viewed(receipt)
    suspend fun refreshRunning() = current.refreshRunning()
    suspend fun refreshQuickChats() = current.refreshQuickChats()
    fun listChats(provider: String = state.value.provider, more: Boolean = false) = current.listChats(provider, more)
    fun olderMessages() = current.olderMessages()
    fun answerApproval(action: String, values: Map<String, String>) = current.answerApproval(action, values)
    fun appearance(look: WatchLook) = current.appearance(look)
    fun autoRead(value: Boolean) = current.autoRead(value)
    fun replyAlerts(value: Boolean) = current.replyAlerts(value)
    fun shouldRequestAlerts() = current.shouldRequestAlerts()
    fun readReply(text: String) = current.readReply(text)
    fun stopSpeaking() = current.stopSpeaking()
    fun configure(url: String, secret: String) = current.configure(url, secret)
    fun permission(value: String) = current.permission(value)
    fun mute() = current.mute()
    fun startRecording() = current.startRecording()
    fun finishRecording() = current.finishRecording()
    fun cancelRecording() = current.cancelRecording()
    fun stop() = current.stop()
    fun resume() = current.resume()
    fun retry() = current.retry()
    fun retryInput() = current.retryInput()
    fun dismissInput() = current.dismissInput()
    override fun onCleared() { workspace.controllers.forEach { it.close() }; super.onCleared() }
}
