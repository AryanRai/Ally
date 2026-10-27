package dev.ally.device

import org.json.JSONObject

/** Recommendations never grant permission; the user chooses a location before Send. */
object AssistantExecutionDestination {
    const val PC = "__execution_pc"
    const val PHONE = "__execution_phone"
    const val CHANGE = "__execution_change"
    const val PHONE_REASON = "No on-device agent backend is installed"
    data class Offer(val pcAvailable: Boolean, val pcReason: String, val phoneReason: String = PHONE_REASON)

    // Older bridges only implement desktop execution. A response from that route can
    // offer PC, but neither it nor pairing proves provider authentication.
    fun parse(route: JSONObject): Offer {
        val data = route.optJSONObject("execution") ?: return Offer(true, "Your agent runs through Ally on your PC")
        if (data.optInt("version") != 1) return Offer(false, "Execution options are unsupported; update Ally")
        val options = data.optJSONArray("options")
        val pc = options?.let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it) }.singleOrNull { it.optString("location") == "pc" } }
        return Offer(pc?.opt("available") == true, pc?.optString("reason")?.take(300).orEmpty().ifBlank { "PC execution is unavailable" })
        // Phone remains disabled even if an unverified server advertises it.
    }
    fun rows(offer: Offer) = listOf(
        AssistantChoice(PC, if (offer.pcAvailable) "Run on PC" else "PC unavailable"),
        AssistantChoice(PHONE, "Run on phone · unavailable"))
    fun select(id: String, offer: Offer): String? = if (id == PC && offer.pcAvailable) "pc" else null
    fun requirePc(location: String?) { require(location == "pc") { "Choose Run on PC before sending" } }
}
