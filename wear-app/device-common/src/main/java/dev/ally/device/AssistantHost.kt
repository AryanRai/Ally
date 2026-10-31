package dev.ally.device

import android.app.Application
import kotlinx.coroutines.flow.Flow

data class AssistantSnapshot(val title: String, val status: String, val text: String = "", val recording: Boolean = false,
    val working: Boolean = false, val level: Float = 0f, val mode: String = "queue", val needsAttention: Boolean = false, val readReceipt: ChatReadReceipt? = null, val choices: List<AssistantChoice> = emptyList(), val chatId: String? = null, val selected: String? = null, val speaking: Boolean = false)

data class AssistantHaloAppearance(val style: String, val colors: List<Int>, val listeningEyes: Boolean)

interface AssistantHost {
    val provider: String
    fun permissionFor(chatId: String): String
    fun acceptTurn(chatId: String, turnId: String)
    fun openChat(chatId: String)
    fun prepareVoice() {}
    fun phoneCodexAvailable(): Boolean = false
    fun openPhoneCodex(text: String) {}
    suspend fun routePhoneCodex(text: String, requestId: String): Boolean = false
    /** Last known phone sign-in; a phone turn still checks the account before it runs. */
    fun phoneCodexSignedIn(): Boolean = false
    /** Phone Codex chats, newest first, as provider "phone". */
    fun phoneCodexChats(): List<AssistantChoice> = emptyList()
    /** Sends [text] to an existing phone chat, or to a new one when [chatId] is null. Returns the chat id. */
    suspend fun sendPhoneCodex(chatId: String?, text: String, requestId: String): String? = null
    fun speechDetector(): dev.ally.device.voice.PcmSpeechDetector? = null
    fun haloAppearance(): AssistantHaloAppearance? = null
    fun presentationVisible(visible: Boolean) {}
    val snapshots: Flow<AssistantSnapshot>
    fun refresh()
    fun start()
    fun release()
    fun cancel()
    fun send(text: String)
    suspend fun viewed(receipt: ChatReadReceipt) {}
    fun mode(value: String)
}
abstract class AssistantApplication : Application() { abstract val assistantHost: AssistantHost }
object AssistantVisibility { var visible: Boolean = false; var recording: Boolean = false }

/** Only an observed press owns a release. Cancellation never submits audio. */
class AssistantHold(private val start: () -> Unit, private val release: () -> Unit, private val cancel: () -> Unit) {
    var held: Boolean = false; private set
    fun down() { if (!held) { held = true; start() } }
    fun up() { if (held) { held = false; release() } }
    fun abort() { if (held) { held = false; cancel() } }
}
