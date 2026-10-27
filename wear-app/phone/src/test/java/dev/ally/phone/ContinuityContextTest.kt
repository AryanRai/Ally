package dev.ally.phone

import dev.ally.device.ContinuityContext
import dev.ally.device.DocumentContext
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.io.ByteArrayInputStream

class ContinuityContextTest {
    @Test fun screenCaptureDoesNotInventDocumentUrlPageOrMedia() {
        val c=ContinuityContext.envelope("accessibility_snapshot",appPackage="com.example.reader",screenshot=true)
        assertEquals("com.example.reader",c.getJSONObject("activeApp").getString("value"))
        listOf("document","originalUrl","sourceUri","currentPage","mediaTitle","positionMs","transcript").forEach{assertEquals("unavailable",c.getJSONObject(it).getString("status"))}
        assertTrue(c.getJSONObject("screenImage").getBoolean("value"))
    }
    @Test fun sharedWebUrlIsExplicitAndLocalUriDoesNotPretendToBePortable() {
        val c=ContinuityContext.envelope("android_share",sharedText="https://example.com/watch?v=abc&t=26",sourceUri="content://documents/123")
        assertEquals("available",c.getJSONObject("originalUrl").getString("status"))
        assertEquals("originating_phone_only",c.getJSONObject("sourceUri").getString("scope"))
        listOf("https://user:secret@example.com/doc","Some words https://example.com/doc","file:///private/doc.pdf").forEach{bad->assertEquals("unavailable",ContinuityContext.envelope("android_share",sharedText=bad).getJSONObject("originalUrl").getString("status"))}
    }
    @Test fun originalCopyIntegrityAndContextSurviveDraftRecreationAndRemoval() {
        val root=Files.createTempDirectory("ally-continuity-test").toFile()
        try{
            val store=ShareDraftStore(root)
            var draft=store.append(ShareDraft(),"Review",listOf(Triple("notes.txt","text/plain"){ByteArrayInputStream("hello".toByteArray())}))
            val file=draft.files.single();val doc=DocumentContext.describe(file,store.file(file))
            assertEquals("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",doc.getString("sha256"))
            assertEquals("original_file",doc.getString("attachmentKind"));assertEquals("unavailable",doc.getJSONObject("pageCount").getString("status"))
            val c=ContinuityContext.envelope("android_picker",sourceUri="content://docs/123",document=doc).toString()
            draft=store.addContexts(draft,listOf(c));assertEquals(draft,ShareDraftStore(root).read())
            val message=ContinuityContext.message(draft.text,draft.contexts);assertTrue(message.contains("original_file"));assertTrue(message.startsWith("Review"))
            store.hold("Pending");val restored=store.settle(true)!!.second;assertEquals(draft.contexts,restored.contexts)
            assertTrue(store.remove(restored,file.key).contexts.isEmpty())
        }finally{root.deleteRecursively()}
    }
    @Test fun metadataCannotOverflowSubmissionOrSilentlyDisappear() {
        val c=ContinuityContext.envelope("android_share").toString()
        assertThrows(IllegalArgumentException::class.java){ContinuityContext.message("x".repeat(12000),listOf(c))}
        assertEquals("Existing text",ContinuityContext.message("Existing text",emptyList()))
        assertThrows(IllegalArgumentException::class.java){ContinuityContext.envelope("guessed_ocr")}
    }
    @Test fun intentPageIsRecordedWhenPresentAndNeverInvented() {
        val withPage=ContinuityContext.envelope("android_share",intentPage=26).getJSONObject("currentPage")
        assertEquals("available",withPage.getString("status"));assertEquals(26,withPage.getInt("value"));assertEquals("android_share_intent_extra",withPage.getString("source"))
        assertEquals("unavailable",ContinuityContext.envelope("android_share",intentPage=0).getJSONObject("currentPage").getString("status"))
        assertEquals("unavailable",ContinuityContext.envelope("android_share",intentPage=-1).getJSONObject("currentPage").getString("status"))
        assertEquals("unavailable",ContinuityContext.envelope("android_share").getJSONObject("currentPage").getString("status"))
    }
    @Test fun currentPageMustBeExplicitAndWithinObservedDocumentBounds() {
        val doc=JSONObject().put("fileKey","test").put("pageCount",JSONObject().put("status","available").put("value",44))
        val context=ContinuityContext.envelope("android_picker",document=doc).toString()
        val page=JSONObject(ContinuityContext.withUserPage(context,26)).getJSONObject("currentPage")
        assertEquals(26,page.getInt("value"));assertEquals("explicit_user_entry",page.getString("source"))
        assertThrows(IllegalArgumentException::class.java){ContinuityContext.withUserPage(context,45)}
        assertThrows(IllegalArgumentException::class.java){ContinuityContext.withUserPage(context,0)}
    }
}
