package dev.ally.phone

import android.app.Activity
import android.app.KeyguardManager
import android.os.Bundle

/**
 * Opened from the "Unlock to let Ally continue" notification. Asks Android for its own unlock
 * prompt (fingerprint, face or PIN); Ally never sees credentials. A waiting control request
 * resumes only after the user really unlocks.
 */
class ControlUnlockActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        val keyguard = getSystemService(KeyguardManager::class.java)
        if (!keyguard.isDeviceLocked) { ControlBridge.unlocked(); finish(); return }
        keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
            override fun onDismissSucceeded() { ControlBridge.unlocked(); finish() }
            override fun onDismissCancelled() { finish() }
            override fun onDismissError() { finish() }
        })
    }
}
