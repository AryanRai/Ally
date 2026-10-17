package dev.ally.watch

import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.*
import org.junit.Test

class PcmRecordingTest {
    @Test fun capsAtExactlySixtySecondsAndWritesConsistentWavHeader() {
        val capture = PcmRecording()
        val chunk = ByteArray(8192)
        repeat(240) { capture.append(chunk, chunk.size) }
        assertTrue(capture.full)
        assertEquals(60f, capture.seconds, 0f)
        val wav = capture.wav()
        assertEquals(PcmRecording.MAX_BYTES + 44, wav.size)
        val header = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(wav.size - 8, header.getInt(4))
        assertEquals(16000, header.getInt(24))
        assertEquals(PcmRecording.MAX_BYTES, header.getInt(40))
    }
    @Test fun levelUsesRealSignedSamplesAndSilenceIsZero() {
        val capture = PcmRecording()
        assertEquals(0f, capture.append(ByteArray(6400), 6400), 0f)
        val loud = ByteArray(6400) { if (it % 2 == 0) 0 else 128.toByte() }
        assertEquals(1f, capture.append(loud, loud.size), 0f)
    }
    @Test(expected = IllegalArgumentException::class)
    fun rejectsAccidentalShortTaps() { PcmRecording().wav() }
}
