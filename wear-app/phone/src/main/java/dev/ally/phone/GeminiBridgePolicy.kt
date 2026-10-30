package dev.ally.phone

import java.security.MessageDigest

/** Pure interpretation of an already approved, freshly inspected Gemini screen.
 * This class cannot read Accessibility, navigate, click, or acquire a grant. */
internal object GeminiBridgePolicy {
    const val GOOGLE_APP = "com.google.android.googlequicksearchbox"
    private const val ID = "$GOOGLE_APP:id/assistant_robin_"
    data class Message(val role: String, val text: String, val possiblyTruncated: Boolean)
    data class View(val recognized: Boolean, val messages: List<Message>, val draft: String?, val send: ControlNode?,
        val completeHistory: Boolean = false)

    fun inspect(roots: List<ControlNode>): View {
        val nodes = mutableListOf<ControlNode>()
        fun visit(node: ControlNode, depth: Int) {
            if (depth > 60 || nodes.size >= ControlTree.MAX_NODES) return
            nodes.add(node); node.children.forEach { visit(it, depth + 1) }
        }
        roots.forEach { visit(it, 0) }
        val google = nodes.filter { it.packageName == GOOGLE_APP && !it.password }
        // Package identity alone would also match Search, Saved and other Google UI.
        val identified = google.any { it.resourceId == ID + "chat_history_list" } ||
            (google.any { it.description == "Open sidebar" } && google.any { it.text.startsWith("Gemini ") })
        if (!identified) return View(false, emptyList(), null, null)
        val messages = google.mapNotNull { node ->
            val role = when (node.resourceId) {
                ID + "user_message_text" -> "user"
                ID + "text" -> "assistant"
                else -> return@mapNotNull null
            }
            node.text.takeIf { it.isNotBlank() }?.let { Message(role, it, it.length >= 500) }
        }
        val editors = google.filter { it.resourceId == ID + "input_collapsed_text_half_sheet" && it.editable }
        val editor = editors.singleOrNull()
        val send = google.filter { it.description == "Send" && it.right > it.left && it.bottom > it.top }.singleOrNull()
        return View(true, messages, editor?.text, send)
    }

    /** Titles and visible positions are not stable Gemini conversation identities. */
    fun maySend(view: View, prompt: String, inspectedRevision: String, currentRevision: String,
        grantActive: Boolean, unlocked: Boolean, sendEnabledObserved: Boolean): Boolean =
        grantActive && unlocked && sendEnabledObserved && inspectedRevision.isNotBlank() && inspectedRevision == currentRevision &&
            view.recognized && prompt.isNotBlank() && view.draft == prompt && view.send != null

    enum class Delivery { READY, ATTEMPTED, CONFIRMED, UNCERTAIN }
    data class Receipt(val requestId: String, val phoneId: String, val accountScope: String, val promptHash: String,
        val delivery: Delivery = Delivery.READY) {
        /** Persist the returned state before performing the one permitted Send. */
        fun claim(): Receipt {
            check(delivery == Delivery.READY) { "This request already has a send attempt. Inspect delivery; do not resend." }
            return copy(delivery = Delivery.ATTEMPTED)
        }
        fun confirm(observedPromptHash: String): Receipt {
            check(delivery == Delivery.ATTEMPTED || delivery == Delivery.UNCERTAIN)
            check(promptHash == observedPromptHash) { "The observed Gemini message differs from this request." }
            return copy(delivery = Delivery.CONFIRMED)
        }
        fun uncertain(): Receipt {
            check(delivery == Delivery.ATTEMPTED)
            return copy(delivery = Delivery.UNCERTAIN)
        }
    }
    fun receipt(requestId: String, phoneId: String, accountScope: String, prompt: String): Receipt {
        require(requestId.isNotBlank() && phoneId.isNotBlank() && accountScope.isNotBlank() && prompt.isNotBlank())
        return Receipt(requestId, phoneId, accountScope, digest(prompt))
    }
    fun digest(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it.toInt() and 255) }
}
