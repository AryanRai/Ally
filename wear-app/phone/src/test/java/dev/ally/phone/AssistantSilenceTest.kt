package dev.ally.phone

import dev.ally.device.AssistantSilence
import dev.ally.device.voice.PcmRecording
import kotlin.math.sin
import org.junit.Assert.*
import org.junit.Test

class AssistantSilenceTest {
    @Test fun phoneKeepsTheWholeRequestAcrossThinkingPauses() {
        val phone = AssistantSilence.phone()
        val old = AssistantSilence()
        for (i in 1..10) { assertFalse(phone.sample(.15f, i / 10f)); old.sample(.15f, i / 10f) }
        assertTrue(old.sample(0f, 2.6f)) // Reproduces the old premature endpoint.
        for (i in 11..40) assertFalse(phone.sample(0f, i / 10f))
        assertFalse(phone.sample(.15f, 4.1f)) // The user continues the same sentence.
        for (i in 42..80) assertFalse(phone.sample(0f, i / 10f))
        assertTrue(phone.sample(0f, 8.2f))
    }

    @Test fun phoneDetectsQuietPcmAndKeepsQuieterSentenceEndings() {
        val phone = AssistantSilence.phone()
        val old = AssistantSilence()
        val pcm = PcmRecording()
        fun frame(amplitude: Double): Float {
            val bytes = ByteArray(3200)
            repeat(1600) { i ->
                val sample = (sin(i * 2 * Math.PI * 220 / 16000) * amplitude * 32767).toInt()
                bytes[i * 2] = sample.toByte(); bytes[i * 2 + 1] = (sample shr 8).toByte()
            }
            return pcm.append(bytes, bytes.size)
        }
        repeat(10) { i -> val level = frame(.01); phone.sample(level, (i + 1) / 10f); old.sample(level, (i + 1) / 10f) }
        assertTrue(phone.heard); assertFalse(old.heard)
        for (i in 11..60) assertFalse(phone.sample(frame(.006), i / 10f))
        for (i in 61..99) assertFalse(phone.sample(0f, i / 10f))
        assertTrue(phone.sample(0f, 10.1f))
    }

    @Test fun phoneAllowsTimeToStartButSilentActivationStillEndsWithoutSpeech() {
        val phone = AssistantSilence.phone()
        for (i in 1..79) assertFalse(phone.sample(0f, i / 10f))
        assertTrue(phone.sample(0f, 8f)); assertFalse(phone.heard)
        val delayed = AssistantSilence.phone()
        for (i in 1..65) assertFalse(delayed.sample(0f, i / 10f))
        for (i in 66..70) assertFalse(delayed.sample(.04f, i / 10f))
        assertTrue(delayed.heard)
    }

    @Test fun separatedPhoneClicksDoNotAccumulateIntoSpeech() {
        val phone = AssistantSilence.phone()
        for (i in 1..79) assertFalse(phone.sample(if (i % 5 == 0) .2f else 0f, i / 10f))
        assertFalse(phone.heard)
        assertTrue(phone.sample(0f, 8f))
    }

    @Test fun phoneDoesNotEndpointContinuousSpeechAtTheFormerPauseOrStartupTimeout() {
        val phone = AssistantSilence.phone()
        for (i in 1..600) assertFalse(phone.sample(.05f, i / 10f))
        assertTrue(phone.heard) // The recorder's unchanged 60s bound owns the limit.
    }

    @Test fun silentActivationStopsWithoutSpeech() {
        val policy = AssistantSilence()
        for(i in 1..49) assertFalse(policy.sample(0f, i/10f))
        assertTrue(policy.sample(0f, 5f)); assertFalse(policy.heard)
    }
    @Test fun shortNoiseDoesNotBecomeSpeech() {
        val policy = AssistantSilence()
        policy.sample(.2f,.1f)
        for(i in 2..49) policy.sample(0f,i/10f)
        assertTrue(policy.sample(0f,5f)); assertFalse(policy.heard)
    }
    @Test fun speechWaitsForPauseAndContinuedSpeechResetsIt() {
        val policy = AssistantSilence()
        for(i in 1..10) assertFalse(policy.sample(.15f,i/10f))
        assertTrue(policy.heard)
        for(i in 11..20) assertFalse(policy.sample(0f,i/10f))
        assertFalse(policy.sample(.15f,2.1f))
        for(i in 22..35) assertFalse(policy.sample(0f,i/10f))
        assertTrue(policy.sample(0f,3.7f))
    }
}
