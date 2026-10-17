package dev.ally.phone

import org.junit.Assert.assertEquals
import org.junit.Test

class PhoneHistoryTest {
    @Test fun refreshKeepsEarlierPagesAndReplacesStreamingTailWithoutDuplicates() {
        val previous = (0..40).map { PhoneMessage("history-$it", "assistant", "Old $it") }
        val latest = (12..41).map { PhoneMessage("history-$it", "assistant", "Updated $it") }
        val result = mergePhoneHistory(previous, latest)
        assertEquals(42, result.size)
        assertEquals("Old 0", result.first().text)
        assertEquals("Updated 40", result[40].text)
        assertEquals(result.size, result.map { it.id }.distinct().size)
    }
}
