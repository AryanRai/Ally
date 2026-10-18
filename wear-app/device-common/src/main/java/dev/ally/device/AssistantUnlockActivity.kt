package dev.ally.device

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.os.Bundle
import android.widget.TextView

/** A neutral unlock surface: no chat text or microphone access on the lock screen. */
class AssistantUnlockActivity : Activity() {
    private var launched = false
    override fun onResume() { super.onResume(); if (!getSystemService(KeyguardManager::class.java).isDeviceLocked) openAssistant() }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        setContentView(TextView(this).apply {
            text = "Unlock to open Ally"; gravity = android.view.Gravity.CENTER; textSize = 18f
            setTextColor(android.graphics.Color.WHITE); setBackgroundColor(android.graphics.Color.rgb(18, 20, 27))
        })
        val keyguard = getSystemService(KeyguardManager::class.java)
        if (!keyguard.isDeviceLocked) openAssistant()
        else keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
            override fun onDismissSucceeded() = openAssistant()
            override fun onDismissCancelled() = finish()
            override fun onDismissError() = finish()
        })
    }
    private fun openAssistant() {
        if (launched || isFinishing || getSystemService(KeyguardManager::class.java).isDeviceLocked) return
        launched = true
        if (!AllyAssistantService.showUnlocked(screenContext = false)) {
            packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)) }
        }
        finish()
    }
}
