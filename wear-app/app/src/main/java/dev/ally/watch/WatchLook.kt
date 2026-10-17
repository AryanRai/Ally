package dev.ally.watch

import android.content.SharedPreferences
import androidx.compose.ui.graphics.Color

enum class OrbStyle(val label: String) { ENERGY("Energy"), SIRI("Siri"), CLOUD("Cloud wave"), PIXEL("Pixel") }
enum class OrbPalette(val label: String, val colors: List<Color>) {
    SUNSET("Sunset", listOf(Sunset, Rose, Amber)),
    DEFAULT("Default", listOf(Color(0xFF4D80FF), Color(0xFFFF4D80), Color(0xFF80FF4D))),
    AURORA("Aurora", listOf(Color(0xFF00D4AA), Color(0xFF7B61FF), Color(0xFFFF6EC7))),
    OCEAN("Ocean", listOf(Color(0xFF0077B6), Color(0xFF00B4D8), Color(0xFF90E0EF))),
}
enum class GlowLevel(val label: String, val strength: Float) {
    OFF("Off", 0f), LOW("Low", .45f), MEDIUM("Medium", 1f), HIGH("High", 1.5f),
}

/** Watch-wide preferences, independent of chat, permissions and connection settings. */
data class WatchLook(
    val style: OrbStyle = OrbStyle.ENERGY,
    val palette: OrbPalette = OrbPalette.SUNSET,
    val glow: GlowLevel = GlowLevel.MEDIUM,
    val listeningEyes: Boolean = true,
    val reducedMotion: Boolean = false,
) {
    fun save(prefs: SharedPreferences) {
        prefs.edit().putString("look.style", style.name).putString("look.palette", palette.name)
            .putString("look.glow", glow.name).putBoolean("look.eyes", listeningEyes)
            .putBoolean("look.reducedMotion", reducedMotion).apply()
    }

    companion object {
        fun load(prefs: SharedPreferences) = WatchLook(
            style = OrbStyle.entries.find { it.name == prefs.getString("look.style", null) } ?: OrbStyle.ENERGY,
            palette = OrbPalette.entries.find { it.name == prefs.getString("look.palette", null) } ?: OrbPalette.SUNSET,
            glow = GlowLevel.entries.find { it.name == prefs.getString("look.glow", null) } ?: GlowLevel.MEDIUM,
            listeningEyes = prefs.getBoolean("look.eyes", true),
            reducedMotion = prefs.getBoolean("look.reducedMotion", false),
        )
    }
}
