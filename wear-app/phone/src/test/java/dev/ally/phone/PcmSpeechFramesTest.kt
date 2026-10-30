package dev.ally.phone

import dev.ally.device.AssistantSilence
import dev.ally.device.voice.PcmSpeechDetector
import dev.ally.device.voice.PcmSpeechFrames
import org.junit.Assert.*
import org.junit.Test

class PcmSpeechFramesTest {
    @Test fun arbitraryReadBoundariesPreserveEverySampleAndFrameTime() {
        val seen = mutableListOf<ByteArray>()
        val detector = object : PcmSpeechDetector {
            override val frameBytes = 1024
            override fun isSpeech(frame: ByteArray): Boolean { seen += frame.copyOf(); return seen.size == 2 }
            override fun close() {}
        }
        val frames = PcmSpeechFrames(detector)
        val audio = ByteArray(4100) { (it % 251).toByte() }
        assertTrue(frames.append(audio.copyOfRange(0, 200)).isEmpty())
        val output = frames.append(audio.copyOfRange(200, 2500)) + frames.append(audio.copyOfRange(2500, 4100))
        assertEquals(listOf(false, true, false, false), output.map { it.first })
        assertArrayEquals(audio.copyOf(4096), seen.reduce { a, b -> a + b })
        output.forEachIndexed { i, value -> assertEquals((i + 1) * .032f, value.second, .00001f) }
    }

    @Test fun loudNonSpeechCannotResetThePhonePause() {
        val policy = AssistantSilence.phone()
        for (i in 1..31) assertFalse(policy.sampleSpeech(true, i * .032f))
        assertTrue(policy.heard)
        // Classifier says music/non-speech even when the raw waveform is loud.
        for (i in 32..68) assertFalse(policy.sampleSpeech(false, i * .032f))
        assertTrue(policy.sampleSpeech(false, 69 * .032f))
    }

    @Test fun musicOnlyTimesOutAndNeverBecomesARequest() {
        val policy = AssistantSilence.phone()
        for (i in 1..249) assertFalse(policy.sampleSpeech(false, i * .032f))
        assertTrue(policy.sampleSpeech(false, 8f))
        assertFalse(policy.heard)
    }

    @Test fun speechResumingDuringPauseKeepsTheRequestOpen() {
        val policy = AssistantSilence.phone()
        for (i in 1..31) policy.sampleSpeech(true, i * .032f)
        for (i in 32..60) assertFalse(policy.sampleSpeech(false, i * .032f))
        for (i in 61..125) assertFalse(policy.sampleSpeech(true, i * .032f))
        assertFalse(policy.sampleSpeech(false, 5.1f))
        assertTrue(policy.sampleSpeech(false, 5.3f))
    }
}
