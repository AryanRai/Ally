package dev.ally.phone

import dev.ally.device.voice.SpeechSession
import dev.ally.device.voice.VoiceCapture
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PhoneVoiceTest {
    private class Capture : VoiceCapture {
        lateinit var feed: (ByteArray) -> Unit
        var cancelled = false
        override fun start(scope: CoroutineScope, onLimit: () -> Unit, onError: (String) -> Unit, onLevel: (Float, Float) -> Unit, onAudio: (ByteArray) -> Unit) { feed = onAudio }
        override suspend fun stop() = byteArrayOf()
        override fun cancel() { cancelled = true }
    }
    private class Speech(val answer: String?) : SpeechSession {
        var bytes = 0; var cancelled = false
        override fun write(bytes: ByteArray) { check(bytes.size <= 16000); this.bytes += bytes.size }
        override suspend fun finish() = answer
        override fun cancel() { cancelled = true }
    }
    @Test fun joinsEverySectionOnceInOrderAndCapsTransportFrames() = runTest {
        val capture = Capture(); val streams = mutableListOf<Speech>()
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val voice = PhoneVoice(scope,"https://example.test","test",{ error("Fallback was not needed") },{},capture,
            { _,_,_ -> Speech("section ${streams.size + 1}").also { streams.add(it) } })
        voice.start({}, { error(it) }, { _,_ -> }); runCurrent()
        repeat(470) { capture.feed(ByteArray(3200)); runCurrent() }
        assertEquals("section 1 section 2",voice.finish())
        assertEquals(470 * 3200,streams.sumOf { it.bytes })
        voice.cancel(); scope.cancel()
    }
    @Test fun fallsBackToWavWithoutSendingPartialTranscriptOnFailure() = runTest {
        val capture = Capture()
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val voice = PhoneVoice(scope,"https://example.test","test",{ wav ->
            assertEquals("RIFF",String(wav.copyOfRange(0,4))); error("Offline")
        },{},capture,{ _,_,_ -> Speech(null) })
        voice.start({}, { error(it) }, { _,_ -> }); runCurrent()
        repeat(3) { capture.feed(ByteArray(3200)); runCurrent() }
        try { voice.finish(); fail("Incomplete voice must not become a sendable message") } catch (e: IllegalStateException) { assertEquals("Offline",e.message) }
        voice.cancel(); scope.cancel()
    }
    @Test fun cancellationClosesCaptureAndSpeechAndIgnoresLatePreviews() = runTest {
        val capture = Capture(); val speech = Speech("unused"); var callback: ((String)->Unit)? = null; val previews = mutableListOf<String>()
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val voice = PhoneVoice(scope,"https://example.test","test",{ "" },previews::add,capture,{ _,_,cb -> callback=cb; speech })
        voice.start({}, { error(it) }, { _,_ -> }); runCurrent()
        voice.cancel(); callback!!("late words"); runCurrent()
        assertTrue(capture.cancelled); assertTrue(speech.cancelled); assertTrue(previews.isEmpty())
        scope.cancel()
    }
}
