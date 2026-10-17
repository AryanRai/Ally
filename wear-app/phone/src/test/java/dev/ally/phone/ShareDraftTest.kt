package dev.ally.phone

import dev.ally.device.AttachmentParser
import dev.ally.device.MAX_ATTACHMENT_BYTES
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.io.ByteArrayInputStream

class ShareDraftTest {
    @Test fun copiedFilesAndEditedTextSurviveRecreationUntilExplicitDiscard() {
        val root = Files.createTempDirectory("ally-share").toFile()
        try {
            val store = ShareDraftStore(root)
            val draft = store.append(ShareDraft(), "Shared words", listOf(Triple("image.png", "image/png") { ByteArrayInputStream(byteArrayOf(1,2,3)) }))
            assertEquals(draft, ShareDraftStore(root).read())
            assertArrayEquals(byteArrayOf(1,2,3), store.file(draft.files.single()).readBytes())
            val changed = draft.copy(text = "Reviewed words"); store.save(changed)
            assertEquals("Reviewed words", ShareDraftStore(root).read().text)
            store.clear(changed); assertEquals(ShareDraft(), store.read())
            assertFalse(store.file(draft.files.single()).exists())
        } finally { root.deleteRecursively() }
    }
    @Test fun oversizedOrFailedImportsLeaveTheOriginalDraftIntact() {
        val root = Files.createTempDirectory("ally-share").toFile()
        try {
            val store = ShareDraftStore(root); val original = store.append(ShareDraft(), "Keep this", emptyList())
            val sources = listOf(Triple("small.txt", "text/plain") { ByteArrayInputStream(byteArrayOf(1)) }, Triple("big.bin", "application/octet-stream") { ByteArrayInputStream(ByteArray(MAX_ATTACHMENT_BYTES + 1)) })
            assertThrows(IllegalArgumentException::class.java) { store.append(original, "New text", sources) }
            assertEquals(original, store.read()); assertEquals(listOf("draft.json"), root.listFiles()!!.map { it.name })
            assertThrows(IllegalArgumentException::class.java) { store.append(original, "x".repeat(12001), emptyList()) }
        } finally { root.deleteRecursively() }
    }
    @Test fun parserRejectsForeignUrlsAndInvalidIdsBeforeAnyAuthenticatedFetch() {
        val id = "a".repeat(64)
        val json = JSONObject().put("id", id).put("name", "image.png").put("size", 100).put("mimeType", "image/png").put("url", "/v1/attachments/$id")
        assertNotNull(AttachmentParser.one(json))
        assertNull(AttachmentParser.one(json.put("url", "https://example.com/image.png")))
        assertNull(AttachmentParser.one(json.put("url", "/v1/attachments/$id").put("size", MAX_ATTACHMENT_BYTES + 1)))
        assertNull(AttachmentParser.one(json.put("size", 100).put("id", "../../private")))
    }
}
