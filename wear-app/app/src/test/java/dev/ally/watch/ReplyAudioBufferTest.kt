package dev.ally.watch

import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class ReplyAudioBufferTest {
    @Test fun fastSynthesisKeepsHundredsOfSmallFramesAndTheFinalFrame() = runBlocking {
        val buffer = ReplyAudioBuffer()
        val frames = (0..499).map { byteArrayOf((it / 256).toByte(), it.toByte()) }
        frames.forEach { assertTrue(buffer.offer(it)) }
        buffer.completed(); buffer.disconnected()
        frames.forEach { assertArrayEquals(it, buffer.next()) }
        assertNull(buffer.next())
    }
    @Test fun prematureDisconnectIsNotSuccessfulCompletion() = runBlocking {
        val buffer = ReplyAudioBuffer(); buffer.offer(byteArrayOf(1, 2)); buffer.disconnected()
        assertArrayEquals(byteArrayOf(1, 2), buffer.next())
        assertTrue(runCatching { buffer.next() }.isFailure)
    }
    @Test fun memoryIsBoundedAndPlaybackFreesSpace() = runBlocking {
        val buffer = ReplyAudioBuffer(4)
        assertTrue(buffer.offer(byteArrayOf(1, 2, 3, 4)))
        buffer.next(); assertTrue(buffer.offer(byteArrayOf(5, 6, 7, 8)))
        assertFalse(buffer.offer(byteArrayOf(9)))
        assertArrayEquals(byteArrayOf(5, 6, 7, 8), buffer.next())
        assertTrue(runCatching { buffer.next() }.isFailure)
    }
}
