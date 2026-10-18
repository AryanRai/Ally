package dev.ally.device

import org.json.JSONObject

/** Retries use the same receipt on either device. The server validates it and supplies the continuation prompt. */
object ResumeChatRequest {
    fun build(provider: String, chatId: String, permission: String, token: String): JSONObject {
        require(provider in setOf("codex", "claude") && chatId.isNotBlank()) { "Select the original chat" }
        require(permission in setOf("readonly", "edit", "full")) { "Invalid permission" }
        require(Regex("[a-zA-Z0-9-]{1,70}").matches(token)) { "Refresh this stopped response" }
        return JSONObject().put("provider", provider).put("chatId", chatId).put("permission", permission)
            .put("requestId", "resume-$token").put("resumeToken", token).put("text", "Continue")
    }
}
