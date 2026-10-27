package dev.ally.device

/** Keep later navigation lists usable by shrinking earlier reply/history first. */
internal object AssistantImeLayout {
    fun fit(preferred: List<Int>, available: Int): List<Int> {
        var overflow = (preferred.sum() - available.coerceAtLeast(0)).coerceAtLeast(0)
        return preferred.map { height ->
            val reduction = minOf(height, overflow)
            overflow -= reduction
            height - reduction
        }
    }
}
