package dev.ally.watch
import org.junit.Assert.*
import org.junit.Test
class ChatFoldersTest {
    private fun chat(id: String, path: String, time: Long = 0) = WatchChat(id, "codex", id, path, time)
    @Test fun groupsWindowsPathsWithoutMergingUnrelatedFolders() {
        val folders = chatFolders(listOf(chat("one", "C:/Work/Ally", 1), chat("two", "c:/work/ally/", 3), chat("three", "D:/Work/Ally", 2)))
        assertEquals(2, folders.size); assertEquals(listOf("two", "one"), folders[0].chats.map { it.id }); assertEquals("D:/Work", folders[1].parent)
    }
    @Test fun preservesUnixCaseAndKeepsUnfiledChatsFindable() {
        val folders = chatFolders(listOf(chat("one", "/Work/Ally"), chat("two", "/work/Ally"), chat("loose", "")))
        assertEquals(3, folders.size); assertTrue(folders.any { it.title == "Other chats" })
    }
    @Test fun searchesTitlesAndPathsAndOrdersByMostRecent() {
        val rows = listOf(chat("Report", "C:/Uni", 2), chat("Browser", "C:/Ally", 5))
        assertEquals("Ally", chatFolders(rows)[0].title)
        assertEquals("Report", chatFolders(rows, "report")[0].chats[0].title)
        assertEquals("Report", chatFolders(rows, "UNI")[0].chats[0].title)
        assertTrue(chatFolders(rows, "missing").isEmpty())
    }
}
