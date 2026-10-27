package dev.ally.device

import org.junit.Assert.assertEquals
import org.junit.Test

class AssistantImeLayoutTest {
    @Test fun keyboardShrinksReplyBeforeDestinationList() {
        assertEquals(listOf(0, 100), AssistantImeLayout.fit(listOf(118, 156), 100))
    }
    @Test fun keyboardDismissalRestoresPreferredHeights() {
        val preferred = listOf(118, 156)
        AssistantImeLayout.fit(preferred, 100)
        assertEquals(preferred, AssistantImeLayout.fit(preferred, 800))
    }
    @Test fun NoScrollSpaceNeverProducesNegativeHeights() {
        assertEquals(listOf(0, 0), AssistantImeLayout.fit(listOf(118, 156), -20))
        assertEquals(emptyList<Int>(), AssistantImeLayout.fit(emptyList(), 0))
    }
    @Test fun exactFitKeepsEachRegionAndPartialOverflowUsesOnlyNeededSpace() {
        assertEquals(listOf(118, 156), AssistantImeLayout.fit(listOf(118, 156), 274))
        assertEquals(listOf(44, 156), AssistantImeLayout.fit(listOf(118, 156), 200))
    }
}
