package dev.ally.device

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

/** Publish engines independently: a slow Codex list must not hide a ready Claude list. */
internal object AssistantRecentChats {
    data class Page(val provider: String, val chats: List<JSONObject>, val next: Int?, val failed: Boolean = false)
    suspend fun load(from: Map<String, Int?>, request: suspend (String, Int) -> Page,
                     publish: (Page) -> Unit = {}): List<Page> = supervisorScope {
        from.filterValues { it != null }.map { (provider, offset) -> async {
            val page = try {
                withTimeoutOrNull(18_000) { request(provider, offset!!) }
                    ?: Page(provider, emptyList(), offset, true)
            } catch (e: CancellationException) { throw e }
              catch (_: Exception) { Page(provider, emptyList(), offset, true) }
            publish(page)
            page
        } }.awaitAll()
    }
}
