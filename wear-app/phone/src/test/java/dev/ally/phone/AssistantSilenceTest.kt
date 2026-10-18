package dev.ally.phone

import dev.ally.device.AssistantSilence
import org.junit.Assert.*
import org.junit.Test

class AssistantSilenceTest {
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
