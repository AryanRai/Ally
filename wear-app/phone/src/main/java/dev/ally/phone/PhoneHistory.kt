package dev.ally.phone

/** Refresh the tail without discarding earlier pages the reader opened. */
internal fun mergePhoneHistory(previous: List<PhoneMessage>, latest: List<PhoneMessage>): List<PhoneMessage> {
    val first = latest.firstOrNull()?.id?.removePrefix("history-")?.toIntOrNull() ?: return latest
    return previous.filter { m -> m.id.startsWith("history-") && m.id.removePrefix("history-").toIntOrNull()?.let { it < first } == true } + latest
}
