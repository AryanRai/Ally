package dev.ally.watch

import org.json.JSONObject

enum class Phase { OFFLINE, IDLE, RECORDING, UPLOADING, THINKING, READY, ERROR }
typealias WatchCard = dev.ally.device.ReplyCard
typealias WatchAction = dev.ally.device.ReplyAction
typealias WatchReply = dev.ally.device.ReplyContent

data class WatchChat(val id: String, val provider: String, val title: String, val cwd: String, val updatedAt: Long = 0)
data class ChatMessage(val id: String, val role: String, val reply: WatchReply, val steps: List<WatchStep>, val usage: String)

object ChatParser {
    fun matchesSelection(json: JSONObject, selectedId: String?) = selectedId != null && json.optJSONObject("chat")?.optString("id") == selectedId
    fun chat(json: JSONObject) = WatchChat(json.getString("id"), json.getString("provider"), json.optString("title", "Chat"), json.optString("cwd"), json.optLong("updatedAt"))
    fun chats(json: JSONObject): List<WatchChat> {
        val rows = json.optJSONArray("chats") ?: return emptyList()
        return (0 until rows.length()).map { chat(rows.getJSONObject(it)) }
    }
    fun messages(json: JSONObject): List<ChatMessage> {
        val rows = json.optJSONArray("messages") ?: return emptyList()
        return (0 until rows.length()).map { index ->
            val row = rows.getJSONObject(index)
            ChatMessage(row.getString("id"), row.getString("role"), CardParser.parse(row), ActivityParser.steps(row), ActivityParser.usage(row))
        }
    }
}
data class WatchStep(val id: String, val name: String, val status: String, val detail: String, val kind: String = "", val context: String = "") {
    val label: String get() {
        val browser = kind == "browser" || (kind.isEmpty() && Regex("^(mcp__)?cua_repl(?:__|\\.| · )(js|js_reset)$").matches(name))
        if (browser) return when (status) {
            "running" -> "Using browser"
            "error" -> "Browser action failed"
            "interrupted" -> "Browser action interrupted"
            else -> "Used browser"
        } + if (context.isBlank()) "" else " · $context"
        val tool = name.substringAfterLast("__").replace('_', ' ')
        return when (status) {
            "running" -> "Running $tool"
            "error" -> "Failed · $tool"
            "interrupted" -> "Interrupted · $tool"
            else -> "Ran $tool"
        }
    }
}
data class WatchState(
    val inputRecording: Boolean = false,
    val inputSending: Boolean = false,
    val inputStatus: String = "",
    val inputDraft: String = "",
    val liveSpeech: Boolean = false,
    val liveTranscript: String = "",
    val speaking: Boolean = false,
    val speechError: String = "",
    val autoRead: Boolean = false,
    val replyAlerts: Boolean = true,
    val look: WatchLook = WatchLook(),
    val permission: String = "readonly",
    val approval: WatchApproval? = null,
    val answeringApproval: Boolean = false,
    val approvalError: String = "",
    val chatId: String? = null,
    val chatTitle: String = "New watch chat",
    val messages: List<ChatMessage> = emptyList(),
    val chats: List<WatchChat> = emptyList(),
    val running: List<WatchChat> = emptyList(),
    val runningStatus: String = "Checking live status…",
    val chatProvider: String = "codex",
    val chatsOffset: Int? = null,
    val historyBefore: Int? = null,
    val loadingChats: Boolean = false,
    val loadingHistory: Boolean = false,
    val chatError: String = "",
    val phase: Phase = Phase.OFFLINE,
    val provider: String = "codex",
    val context: String = "Watch · Codex",
    val detail: String = "Connecting to Ally…",
    val transcript: String = "",
    val liveText: String = "",
    val reply: WatchReply = WatchReply("", emptyList()),
    val steps: List<WatchStep> = emptyList(),
    val usage: String = "",
    val turnId: String? = null,
    val muted: Boolean = false,
    val voiceReady: Boolean = false,
    val voiceState: String = "offline",
    val recordingSeconds: Float = 0f,
    val microphoneLevel: Float = 0f,
    val readySequence: Int = 0,
)

object ActivityParser {
    fun steps(json: JSONObject): List<WatchStep> {
        val array = json.optJSONArray("steps") ?: return emptyList()
        return (maxOf(0, array.length() - 24) until array.length()).mapNotNull { i ->
            val step = array.optJSONObject(i) ?: return@mapNotNull null
            val status = step.optString("status")
            if (status !in setOf("running", "done", "error", "interrupted")) return@mapNotNull null
            WatchStep(step.optString("id").take(160), step.optString("name").take(100), status, step.optString("detail").take(3202), step.optString("kind"), step.optString("context").take(120))
        }
    }
    fun usage(json: JSONObject): String {
        val usage = json.optJSONObject("usage") ?: return ""
        val parts = mutableListOf<String>()
        for ((key, label) in listOf("inputTokens" to "in", "outputTokens" to "out")) {
            if (usage.has(key) && !usage.isNull(key)) usage.optLong(key, -1).takeIf { it >= 0 }?.let { parts += "$it $label" }
        }
        if (usage.has("durationMs")) usage.optLong("durationMs", -1).takeIf { it >= 0 }?.let { parts += "${it / 1000}s" }
        if (usage.has("costUsd")) usage.optDouble("costUsd", -1.0).takeIf { it.isFinite() && it >= 0 }?.let { parts += "$" + String.format(java.util.Locale.US, "%.3f", it) }
        return parts.joinToString(" · ")
    }
}

object CardParser {
    fun parse(json: JSONObject): WatchReply = dev.ally.device.ReplyContentParser.parse(json)
}
