package dev.ally.phone

import android.content.Context
import android.os.VibrationEffect
import android.os.Vibrator
import android.media.AudioAttributes
import android.provider.Settings
import dev.ally.device.DeviceLink

/** UI feedback respects Ally mute, the local switch and Android touch feedback. */
object PhoneHaptics {
    fun pulse(context: Context, strong: Boolean = false) {
        val prefs = DeviceLink.prefs(context)
        if (prefs.getBoolean("muted", false) || !prefs.getBoolean("phone.haptics", true) ||
            Settings.System.getInt(context.contentResolver, Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) == 0) return
        val vibrator = context.getSystemService(Vibrator::class.java) ?: return
        if (!vibrator.hasVibrator()) return
        vibrator.vibrate(VibrationEffect.createPredefined(if (strong) VibrationEffect.EFFECT_DOUBLE_CLICK else VibrationEffect.EFFECT_CLICK),
            AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).build())
    }
}
