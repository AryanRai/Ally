package dev.ally.phone

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.graphics.Bitmap
import android.os.Build
import android.os.PowerManager
import android.view.Display
import android.view.accessibility.AccessibilityWindowInfo
import dev.ally.device.ContextHandoffLauncher
import dev.ally.device.DeviceLink
import dev.ally.device.ContinuityContext
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import org.json.JSONObject

/** Local-only user-opted capture. This does not reuse an agent control grant or send any bytes. */
internal object PhysicalTapCapture {
    /** Package/window checks only; no text collection or screenshot. Ignore our inert progress overlay. */
    fun holdEligible(service: AllyControlService): Boolean {
        if (service.getSystemService(KeyguardManager::class.java).isDeviceLocked || !service.getSystemService(PowerManager::class.java).isInteractive) return false
        val window = service.windows.firstOrNull { it.isActive && it.type == AccessibilityWindowInfo.TYPE_APPLICATION } ?: return false
        val root = window.root ?: return false
        val pkg = root.packageName?.toString().orEmpty()
        return pkg.isNotBlank() && !pkg.startsWith("dev.ally.") && pkg != "com.android.systemui" && pkg != "com.android.settings" && !root.isPassword
    }
    private fun allowed(service: AllyControlService): Int {
        check(DeviceLink.prefs(service).getBoolean("tap.capture", false)) { "Allow local screen review in Physical tap settings first" }
        check(!service.getSystemService(KeyguardManager::class.java).isDeviceLocked && service.getSystemService(PowerManager::class.java).isInteractive) { "Unlock the phone first" }
        val visible = service.windows
        check(visible.none { it.root?.packageName?.toString()?.startsWith("dev.ally.") == true }) { "Close Ally overlays before handing off this screen" }
        val active = visible.firstOrNull { it.isActive && it.type == AccessibilityWindowInfo.TYPE_APPLICATION } ?: error("No app screen is available")
        val root = active.root ?: error("App screen is unavailable")
        val pkg = root.packageName?.toString().orEmpty()
        check(pkg.isNotBlank() && !pkg.startsWith("dev.ally.") && pkg != "com.android.systemui" && pkg != "com.android.settings" && !root.isPassword) { "Ally, system and locked screens cannot be handed off" }
        // Older Android can only capture the full display: refuse all overlays/other apps.
        if (Build.VERSION.SDK_INT < 34) check(visible.all { it.id == active.id }) { "Full-display capture is unavailable with other windows visible. Use manual assistant review." }
        return active.id
    }
    suspend fun open(service: AllyControlService, receipt:JSONObject?, stillAllowed: () -> Boolean, beforeReview: suspend () -> Unit, onReviewed: () -> Unit): Boolean {
        check(stillAllowed()) { "Hold cancelled" }
        if (ContextHandoffLauncher.openPending(service)) return false
        val window = allowed(service)
        val appPackage=service.windows.firstOrNull{it.id==window}?.root?.packageName?.toString()
        val bitmap = suspendCancellableCoroutine<Bitmap> { c ->
            val callback = object : AccessibilityService.TakeScreenshotCallback {
                override fun onSuccess(result: AccessibilityService.ScreenshotResult) {
                    val buffer = result.hardwareBuffer
                    val image = try { Bitmap.wrapHardwareBuffer(buffer, result.colorSpace)?.copy(Bitmap.Config.ARGB_8888, false) } finally { buffer.close() }
                    if (!c.isActive) { image?.recycle(); return }
                    if (image == null) c.resumeWithException(IllegalStateException("Screen image is unavailable")) else c.resume(image)
                }
                override fun onFailure(code: Int) { if (c.isActive) c.resumeWithException(IllegalStateException("Android refused screen capture ($code); secure screens cannot be shared")) }
            }
            if (Build.VERSION.SDK_INT >= 34) service.takeScreenshotOfWindow(window, service.mainExecutor, callback)
            else service.takeScreenshot(Display.DEFAULT_DISPLAY, service.mainExecutor, callback)
        }
        try {
            check(stillAllowed()) { "Moved away · hold cancelled" }
            check(allowed(service) == window) { "The screen changed; try again" }
            beforeReview()
            check(stillAllowed()) { "Moved away · hold cancelled" }
            check(allowed(service) == window) { "The screen changed; try again" }
            val bytes = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
            val context=ContinuityContext.envelope("accessibility_snapshot",appPackage=appPackage,screenshot=true).toString()
            try { return ContextHandoffLauncher.open(service, "", bytes, onReviewed,receipt,context) } finally { bytes.fill(0) }
        } finally { bitmap.recycle() }
    }
}
