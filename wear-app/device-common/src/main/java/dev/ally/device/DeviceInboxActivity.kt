package dev.ally.device

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.widget.*
import android.view.View
import android.text.InputType
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collectLatest

/** Small shared device settings/inbox surface, including real approval buttons. */
class DeviceInboxActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var rows: LinearLayout
    private lateinit var connection: TextView
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        window.statusBarColor = Color.rgb(16, 16, 18); window.navigationBarColor = Color.rgb(16, 16, 18)
        val p = DeviceLink.prefs(this)
        val scroll = ScrollView(this).apply { setBackgroundColor(Color.rgb(16, 16, 18)) }
        val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 48, 32, 48) }
        scroll.addView(column); setContentView(scroll)
        column.addView(label("ALLY", 26f, true))
        column.addView(label("Device connection", 15f))
        connection = label(DeviceLink.status.value, 12f); column.addView(connection)
        val address = EditText(this).apply { setText(p.getString("endpoint", "https://ally.prxptn.com")); hint = "HTTPS bridge address"; setTextColor(Color.WHITE); setSingleLine(); textSize = 13f; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI }
        val token = EditText(this).apply { setText(p.getString("token", "")); hint = "Pairing token"; setTextColor(Color.WHITE); setSingleLine(); textSize = 13f; inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD }
        column.addView(address); column.addView(token)
        column.addView(button("Save & keep connected") {
            p.edit().putString("endpoint", address.text.toString().trim()).putString("token", token.text.toString().trim()).apply()
            DeviceLink.stop(this)
            if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 10)
            else DeviceLink.start(this)
        })
        column.addView(button("Disconnect") { DeviceLink.stop(this) })
        column.addView(label("Keeps a visible connection notification. Android may stop it; reopen Ally to reconnect. No microphone is used.", 11f))
        column.addView(Switch(this).apply { text = "Quiet hours · 10 pm–8 am"; setTextColor(Color.LTGRAY); textSize = 12f; isChecked = p.getBoolean("deviceQuietHours", false); setOnCheckedChangeListener { _, checked -> p.edit().putBoolean("deviceQuietHours", checked).apply() } })
        column.addView(label("Cards & requests", 18f, true))
        rows = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }; column.addView(rows)
        column.addView(button("Back") { finish() })
        DeviceLink.load(this)
        scope.launch { DeviceLink.status.collectLatest { connection.text = it } }
        scope.launch { DeviceLink.inbox.collectLatest { items ->
            rows.removeAllViews()
            if (items.isEmpty()) rows.addView(label("Nothing waiting. New cards appear here.", 12f))
            items.forEach { item ->
                val card = LinearLayout(this@DeviceInboxActivity).apply { orientation = LinearLayout.VERTICAL; setPadding(18, 14, 18, 14); background = GradientDrawable().apply { setColor(Color.rgb(28, 28, 32)); cornerRadius = 20f; setStroke(1, Color.rgb(55, 55, 62)) } }
                card.addView(label(item.optString("title"), 15f, true)); card.addView(label(item.optString("body"), 13f))
                if (item.optBoolean("command")) {
                    card.addView(label(item.optString("action").replace('_', ' '), 12f))
                    if (item.has("url")) card.addView(label(item.optString("url"), 12f))
                    if (item.has("seconds")) card.addView(label("${item.optInt("seconds")} seconds · opens your timer app", 12f))
                    card.addView(button("Allow once") { DeviceLink.decide(this@DeviceInboxActivity, item, true) })
                    card.addView(button("Decline") { DeviceLink.decide(this@DeviceInboxActivity, item, false) })
                }
                card.addView(button("Dismiss") { if (item.optBoolean("command")) DeviceLink.receipt(this@DeviceInboxActivity, item.optString("id"), "rejected"); DeviceLink.dismiss(this@DeviceInboxActivity, item.optString("id")) })
                rows.addView(card, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = 16 })
            }
            if (items.any { it.optBoolean("command") || it.optString("id") == intent.getStringExtra("id") }) {
                scroll.post { scroll.smoothScrollTo(0, (rows.top - 16).coerceAtLeast(0)) }
            }
        } }
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, results)
        if (requestCode == 10 && results.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED) DeviceLink.start(this)
    }
    override fun onResume() { super.onResume(); DeviceLink.resume(this) }
    private fun label(text: String, size: Float, bold: Boolean = false) = TextView(this).apply { this.text = text; textSize = size; setTextColor(if (bold) Color.WHITE else Color.LTGRAY); setPadding(0, 10, 0, 10); if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL) }
    private fun button(text: String, action: () -> Unit): View = Button(this).apply { this.text = text; isAllCaps = false; textSize = 12f; setTextColor(Color.WHITE); backgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(50, 47, 62)); setOnClickListener { action() } }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }
}
