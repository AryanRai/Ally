package dev.ally.watch

data class ChatFolder(val path: String, val title: String, val parent: String, val chats: List<WatchChat>)
fun chatFolders(chats: List<WatchChat>, query: String = ""): List<ChatFolder> = chats
    .filter { query.isBlank() || it.title.contains(query, true) || it.cwd.contains(query, true) }
    .groupBy { it.cwd.replace('\\', '/').trimEnd('/').let { path -> if (Regex("^[A-Za-z]:").containsMatchIn(path)) path.lowercase() else path } }
    .map { (key, rows) ->
        val path = rows.first().cwd.replace('\\', '/').trimEnd('/')
        ChatFolder(key, path.substringAfterLast('/').ifBlank { "Other chats" }, path.substringBeforeLast('/', ""), rows.sortedByDescending { it.createdAt })
    }.sortedWith(compareByDescending<ChatFolder> { it.chats.maxOfOrNull { chat -> chat.createdAt } ?: 0 }.thenBy { it.title.lowercase() })
