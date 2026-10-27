package dev.ally.phone

import dev.ally.device.ContextHandoff
import org.junit.Assert.*
import org.junit.Test

class ContextHandoffTest {
    @Test fun importedSnapshotBecomesPrivateReviewDraftWithoutChangingOriginalBytes() {
        val root=java.nio.file.Files.createTempDirectory("ally-handoff-test").toFile()
        try {
            val vault=ContextHandoff({0L});val original=byteArrayOf(1,2,3)
            val snapshot=vault.take(vault.offer("Fixture context",original))!!
            val store=dev.ally.device.ShareDraftStore(root)
            val draft=store.append(dev.ally.device.ShareDraft(),snapshot.text,
                listOf(Triple("Phone-screen.png","image/png",{ java.io.ByteArrayInputStream(snapshot.image!!) as java.io.InputStream })))
            snapshot.clear()
            assertEquals("Fixture context",store.read().text)
            assertEquals("image/png",draft.files.single().mimeType)
            assertArrayEquals(original,store.file(draft.files.single()).readBytes())
            store.clear(draft);assertTrue(store.read().files.isEmpty())
        } finally { root.deleteRecursively() }
    }
    @Test fun tokenIsOneShotAndSnapshotIsFrozen() {
        val vault=ContextHandoff({ 100L }); val bytes=byteArrayOf(1,2)
        val token=vault.offer("Synthetic screen",bytes);bytes[0]=9
        assertNull(vault.take("other"))
        val snapshot=vault.take(token)!!
        assertArrayEquals(byteArrayOf(1,2),snapshot.image)
        assertEquals("Synthetic screen",snapshot.text);assertNull(vault.take(token))
        snapshot.clear();assertArrayEquals(byteArrayOf(0,0),snapshot.image)
    }
    @Test fun expiredOrReplacedTokensNeverReturnContext() {
        var time=0L;val vault=ContextHandoff({time},10)
        val old=vault.offer("Old",byteArrayOf(4))
        val fresh=vault.offer("Fresh",null)
        assertNull(vault.take(old));time=10
        assertNull(vault.take(fresh))
    }
    @Test fun oldExpiryCannotRemoveNewSnapshotAndCancellationIsFinal() {
        val vault=ContextHandoff({0L});val old=vault.offer("Old",null)
        val fresh=vault.offer("New",null);vault.expire(old)
        assertEquals("New",vault.take(fresh)!!.text)
        val cancelled=vault.offer("Cancelled",null);vault.clear();assertNull(vault.take(cancelled))
    }
    @Test fun refusesEmptyOrOversizedContextWithoutReplacingValidPending() {
        val vault=ContextHandoff({0L});val token=vault.offer("Keep",null)
        assertThrows(IllegalArgumentException::class.java){vault.offer("",null)}
        assertThrows(IllegalArgumentException::class.java){vault.offer("x".repeat(12001),null)}
        assertThrows(IllegalArgumentException::class.java){vault.offer("",byteArrayOf())}
        assertEquals("Keep",vault.take(token)!!.text)
    }
}

