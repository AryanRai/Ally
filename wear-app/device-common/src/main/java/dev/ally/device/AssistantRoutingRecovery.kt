package dev.ally.device

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject

/** Matching is optional. A failed lookup must leave a usable explicit picker. */
internal object AssistantRoutingRecovery {
    data class Result(val route: JSONObject, val pages: List<Triple<String, List<JSONObject>, Int?>>, val fallback: Boolean)
    suspend fun lookup(route: suspend () -> JSONObject, recent: suspend () -> List<Triple<String, List<JSONObject>, Int?>>): Result = supervisorScope {
        val pages = async { withTimeoutOrNull(2500) { attempt { recent() } } ?: emptyList() }
        val match = async { withTimeoutOrNull(10000) { attempt { route() } } }
        val decision = match.await()
        Result(decision ?: JSONObject().put("kind", "choose").put("chats", JSONArray()).put("limited", true), pages.await(), decision == null)
    }
    private suspend fun <T> attempt(block: suspend () -> T): T? = try { block() }
        catch (e: CancellationException) { throw e } catch (_: Exception) { null }

    fun message(error: Exception, uncertainSend: Boolean): String {
        val timedOut = error is java.io.InterruptedIOException || error is java.net.SocketTimeoutException ||
            error.message.orEmpty().contains("timeout", true) || error.message.orEmpty().contains("timed out", true)
        return if (timedOut) {
            if (uncertainSend) "Desktop confirmation timed out. Your request is kept; Retry checks the same send."
            else "Desktop took too long. Your words are kept; retry or choose a chat."
        } else error.message?.takeIf { it.isNotBlank() } ?: "Desktop connection unavailable · your words are kept"
    }
}
