package dev.ally.watch

import org.junit.Assert.*
import org.junit.Test

class SpeechLifetimeTest {
    @Test fun startedReplyKeepsItsLeaseUntilCompletionOrExplicitStop() {
        var held = 0
        val lifetime = SpeechLifetime({ held++ }, { held-- })
        val read = lifetime.begin()
        assertEquals(1, held)
        // Display lifecycle owns no audio lease: low-power UI may stop/resume freely.
        lifetime.finish(read)
        assertEquals(0, held)
        lifetime.stop(); assertEquals(0, held)
    }
    @Test fun cancelledOldReadCannotReleaseTheNextRead() {
        var acquired = 0; var released = 0
        val lifetime = SpeechLifetime({ acquired++ }, { released++ })
        val old = lifetime.begin(); val current = lifetime.begin()
        assertEquals(2, acquired); assertEquals(1, released)
        lifetime.finish(old); assertEquals(1, released)
        lifetime.stop(); lifetime.finish(current)
        assertEquals(2, released)
    }
    @Test fun failedStartupDoesNotLeaveAPlaybackLease() {
        var released = 0
        val lifetime = SpeechLifetime({ error("Foreground playback unavailable") }, { released++ })
        runCatching { lifetime.begin() }
        lifetime.stop(); assertEquals(0, released)
    }
}
