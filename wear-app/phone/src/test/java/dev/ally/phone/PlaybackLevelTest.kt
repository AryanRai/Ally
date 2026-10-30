package dev.ally.phone

import dev.ally.device.voice.PlaybackLevel
import org.junit.Assert.*
import org.junit.Test

class PlaybackLevelTest {
    @Test fun silenceAndEmptyAudioAreQuiet() {
        assertEquals(0f, PlaybackLevel.pcm16(ByteArray(960)), 0f)
        assertEquals(0f, PlaybackLevel.pcm16(byteArrayOf(1)), 0f)
    }
    @Test fun signedLittleEndianAudioIsSymmetricAndBounded() {
        assertEquals(.5f, PlaybackLevel.pcm16(byteArrayOf(0, 16)), .001f)
        assertEquals(.5f, PlaybackLevel.pcm16(byteArrayOf(0, -16)), .001f)
        assertEquals(1f, PlaybackLevel.pcm16(byteArrayOf(0, -128)), 0f)
        assertEquals(0f, PlaybackLevel.pcm16(byteArrayOf(0, 16, 0, 0), 2, 4), 0f)
    }
}
