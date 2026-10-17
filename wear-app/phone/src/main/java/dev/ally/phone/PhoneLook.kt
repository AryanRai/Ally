package dev.ally.phone

import android.content.SharedPreferences
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

internal enum class OrbStyle(val label: String) { ENERGY("Energy"), SIRI("Siri"), CLOUD("Cloud wave"), PIXEL("Pixel") }
internal enum class OrbPalette(val label: String, val colors: List<Color>) {
    SUNSET("Sunset", listOf(Color(0xffff6b35), Color(0xfff72585), Color(0xffffb347))),
    DEFAULT("Default", listOf(Color(0xff4d80ff), Color(0xffff4d80), Color(0xff80ff4d))),
    AURORA("Aurora", listOf(Color(0xff00d4aa), Color(0xff7b61ff), Color(0xffff6ec7))),
    OCEAN("Ocean", listOf(Color(0xff0077b6), Color(0xff00b4d8), Color(0xff90e0ef))),
}
internal enum class GlowLevel(val label: String, val strength: Float) { OFF("Off", 0f), LOW("Low", .45f), MEDIUM("Medium", 1f), HIGH("High", 1.5f) }

/** Local appearance only; never changes pairing, permissions or other devices. */
internal data class PhoneLook(
    val style: OrbStyle = OrbStyle.ENERGY,
    val palette: OrbPalette = OrbPalette.OCEAN,
    val glow: GlowLevel = GlowLevel.MEDIUM,
    val listeningEyes: Boolean = true,
    val reducedMotion: Boolean = false,
    val backdrop: Boolean = true,
) {
    fun save(prefs: SharedPreferences) {
        prefs.edit().putString("phone.look.style", style.name).putString("phone.look.palette", palette.name)
            .putString("phone.look.glow", glow.name).putBoolean("phone.look.eyes", listeningEyes)
            .putBoolean("phone.look.reducedMotion", reducedMotion).putBoolean("phone.look.backdrop", backdrop).apply()
    }
    companion object {
        fun load(prefs: SharedPreferences) = PhoneLook(
            style = OrbStyle.entries.find { it.name == prefs.getString("phone.look.style", null) } ?: OrbStyle.ENERGY,
            palette = OrbPalette.entries.find { it.name == prefs.getString("phone.look.palette", null) } ?: OrbPalette.OCEAN,
            glow = GlowLevel.entries.find { it.name == prefs.getString("phone.look.glow", null) } ?: GlowLevel.MEDIUM,
            listeningEyes = prefs.getBoolean("phone.look.eyes", true),
            reducedMotion = prefs.getBoolean("phone.look.reducedMotion", false),
            backdrop = prefs.getBoolean("phone.look.backdrop", true),
        )
    }
}

internal val LocalPhoneLook = staticCompositionLocalOf { PhoneLook() }
