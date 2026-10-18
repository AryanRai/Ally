package dev.ally.device

import android.app.Application
import kotlinx.coroutines.flow.Flow

data class AssistantSnapshot(val title: String, val status: String, val text: String = "", val recording: Boolean = false,
    val working: Boolean = false, val level: Float = 0f, val mode: String = "queue", val needsAttention: Boolean = false, val readReceipt: ChatReadReceipt? = null, val choices: List<AssistantChoice> = emptyList(), val chatId: String? = null)

interface AssistantHost {
    val provider: String
    fun permissionFor(chatId: String): String
    fun acceptTurn(chatId: String, turnId: String)
    fun openChat(chatId: String)
    fun prepareVoice() {}
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
