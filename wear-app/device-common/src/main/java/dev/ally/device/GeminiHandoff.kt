package dev.ally.device

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager

/** A visible draft handoff, never an assistant backend or automatic submission. */
internal object GeminiHandoff {
    private const val PACKAGE = "com.google.android.apps.bard"
    fun intent(text: String) = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        setPackage(PACKAGE)
        putExtra(Intent.EXTRA_TEXT, text)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    fun available(context: Context) = !context.packageManager.hasSystemFeature(PackageManager.FEATURE_WATCH) &&
        intent("").resolveActivity(context.packageManager) != null
}
