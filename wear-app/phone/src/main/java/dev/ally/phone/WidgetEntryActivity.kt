package dev.ally.phone

import android.app.Activity
import android.app.KeyguardManager
import android.os.Bundle
import android.widget.Toast
import dev.ally.device.AllyAssistantService

/** Widget/Quick Settings entry must not surface the full app behind the assistant. */
class WidgetEntryActivity:Activity() {
    override fun onCreate(state:Bundle?){
        super.onCreate(state)
        if(state==null && !getSystemService(KeyguardManager::class.java).isDeviceLocked){
            val opened=when(intent.action){
                ACTION_MONITOR->AllyAssistantService.showMonitor()
                ACTION_VOICE->AllyAssistantService.showUnlocked()
                else->false
            }
            if(!opened)Toast.makeText(this,"Select Ally as your default assistant first",Toast.LENGTH_LONG).show()
        }
        finish()
    }
    companion object {
        const val ACTION_MONITOR="dev.ally.phone.widget.MONITOR"
        const val ACTION_VOICE="dev.ally.phone.widget.VOICE"
    }
}
