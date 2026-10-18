package dev.ally.device

import android.content.SharedPreferences

/** Only conversation keys are namespaced; connection and device settings stay shared. */
class ChatPreferences(private val base: SharedPreferences, chat: String,
    private val local: Set<String>, migrate: Boolean = false) : SharedPreferences by base {
    private val prefix = "chat:$chat:"
    private fun key(key: String) = if (key in local) prefix + key else key
    init {
        if (migrate && !base.contains(prefix + "migrated")) {
            val edit = base.edit()
            local.forEach { k ->
                val value = base.all[k]
                if (!base.contains(key(k)) && value is String) edit.putString(key(k), value)
                edit.remove(k)
            }
            edit.putBoolean(prefix + "migrated", true).commit()
        }
    }
    override fun getString(key: String, defValue: String?): String? = base.getString(key(key), defValue)
    override fun contains(key: String): Boolean = base.contains(key(key))
    override fun edit(): SharedPreferences.Editor = Editor(base.edit())
    private inner class Editor(private val edit: SharedPreferences.Editor) : SharedPreferences.Editor by edit {
        override fun putString(key: String, value: String?): SharedPreferences.Editor { edit.putString(key(key), value); return this }
        override fun remove(key: String): SharedPreferences.Editor { edit.remove(key(key)); return this }
    }
}
