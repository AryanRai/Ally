package dev.ally.phone

import android.Manifest
import android.app.*
import android.bluetooth.BluetoothManager
import android.bluetooth.le.*
import android.content.*
import android.content.pm.PackageManager
import android.os.*
import dev.ally.device.DeviceLink
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import java.util.UUID

/** User-started persistent proximity toggle. No accelerometer, microphone or automatic send. */
class PhysicalTapService : Service() {
    companion object {
        const val STOP = "tap.stop"
        const val CALIBRATE_NEAR = "tap.calibrate.near"
        val status = MutableStateFlow("Hold-close handoff is off")
        val active = MutableStateFlow(false)
        val gestureStatus = MutableStateFlow("Waiting for a close hold")
        private var instance: PhysicalTapService? = null
        fun install() { DeviceLink.tapHandler = { _, message -> instance?.message(message) } }
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val rules = PhysicalTapRules()
    private val hold = ProximityHold()
    private var overlay: HoldHandoffOverlay? = null
    private var scanner: BluetoothLeScanner? = null
    private var listening = false
    private var enabled = false
    private var pending: Pair<String, Long>? = null
    private var pendingPc: String? = null
    private var reviewJob: Job? = null
    private var calibrationUntil = 0L
    private val calibrationRssi = mutableListOf<Int>()
    private var lastFeedback: String? = null
    private var latestRssi: Int? = null
    private var peerProtocol=0
    private var holdId:String?=null
    private var lastProgressAt=0L
    private val prefs get() = DeviceLink.prefs(this)
    private fun clock() = SystemClock.elapsedRealtime()
    private fun gesture(message: String) { gestureStatus.value = message; prefs.edit().putString("tap.lastGesture", message).apply() }
    private fun unlocked() = getSystemService(PowerManager::class.java).isInteractive && !getSystemService(KeyguardManager::class.java).isDeviceLocked
    private fun optedIn() = prefs.getBoolean("hold.enabled", false) && prefs.getBoolean("tap.capture", false)
    private fun sendEnabled() = DeviceLink.sendControl(JSONObject().put("type", "tap_enable").put("enabled", enabled))
    private fun renewProof() {
        if (!enabled || DeviceLink.status.value != "Connected") return
        if(peerProtocol>=2){DeviceLink.sendControl(JSONObject().put("type","tap_refresh"));return}
        DeviceLink.sendControl(JSONObject().put("type", "tap_enable").put("enabled", false))
        sendEnabled()
    }
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) { if (i.action == Intent.ACTION_SCREEN_OFF) pause() else if (unlocked()) resume() }
    }
    private val scan = object : ScanCallback() {
        override fun onScanFailed(code: Int) { pause(); status.value = "Bluetooth scan failed ($code). Use manual screen review." }
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            if (!enabled || !unlocked() || DeviceLink.status.value != "Connected") return
            val bytes = result.scanRecord?.getManufacturerSpecificData(0xffff) ?: return
            if (bytes.size != 20 || !bytes.copyOfRange(0, 4).contentEquals(byteArrayOf(65, 76, 89, 49))) return
            val token = bytes.copyOfRange(4, 20).joinToString("") { "%02x".format(it.toInt() and 255) }
            if (rules.target?.beacon != token) return
            val now = clock(); latestRssi = result.rssi
            rules.radio(token, result.rssi, now)
            if (calibrationUntil > now) { if (calibrationRssi.size < 80) calibrationRssi.add(result.rssi); return }
            // A weak latest reading cancels without waiting for the rolling median.
            val near = result.rssi >= prefs.getInt("tap.rssi", -55) && rules.near(now, prefs.getInt("tap.rssi", -55))
            hold.observe(near, now)
            if (!hold.requiresDeparture() && prefs.getBoolean("hold.awaitDeparture",false)) prefs.edit().putBoolean("hold.awaitDeparture",false).apply()
            if (!near) cancelAttempt("Moved away · hold cancelled", reset = false)
        }
    }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate(); instance = this
        if(prefs.getBoolean("hold.awaitDeparture",false))hold.blockUntilDeparture()
        val filter = IntentFilter().apply { addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_USER_PRESENT) }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED) else registerReceiver(receiver, filter)
        scope.launch { while (isActive) { tick(); delay(50) } }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) { prefs.edit().putBoolean("hold.enabled",false).apply();stopSelf(); return START_NOT_STICKY }
        if (active.value) { if (intent?.action == CALIBRATE_NEAR) calibrate(); return START_STICKY }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("ally-physical-tap", "Hold-close handoff", NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null) })
        val open = PendingIntent.getActivity(this, 51, Intent(this, PhysicalTapSettingsActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 52, Intent(this, PhysicalTapService::class.java).setAction(STOP), PendingIntent.FLAG_IMMUTABLE)
        startForeground(51, Notification.Builder(this, "ally-physical-tap").setSmallIcon(R.drawable.ic_ally)
            .setContentTitle("Ally hold-close is on").setContentText("On until you turn it off · hold near PC for 3 seconds")
            .setContentIntent(open).setOngoing(true).addAction(Notification.Action.Builder(null, "Stop", stop).build()).build())
        if (!optedIn()) { stopSelf(); return START_NOT_STICKY }
        active.value = true; gesture("Waiting for a close hold")
        resume(); return START_STICKY
    }
    private fun resume() {
        if (!active.value || !unlocked()) return
        if (DeviceLink.status.value != "Connected") { status.value = "Connect to your paired PC first"; return }
        if (checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) { status.value = "Nearby devices permission is required"; return }
        if (AllyControlService.instance == null) { status.value = "Enable Ally accessibility for the bottom card and local screen review"; return }
        try {
            val adapter = getSystemService(BluetoothManager::class.java).adapter
            if (adapter?.isEnabled != true) { status.value = "Turn on Bluetooth normally, or use manual screen review"; return }
            if (!listening) {
                scanner = adapter.bluetoothLeScanner ?: error("BLE scanner is unavailable")
                scanner!!.startScan(listOf(ScanFilter.Builder().setManufacturerData(0xffff, byteArrayOf(65, 76, 89, 49)).build()), ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scan)
                listening = true
            }
            enabled = true; sendEnabled(); status.value = "Looking for paired PC nearby"
        } catch (e: Exception) { pause(); status.value = "${e.message?.take(140)}. Use manual screen review." }
    }
    private fun cancelAttempt(reason: String, reset: Boolean = true) {
        if(peerProtocol>=2)holdId?.let{DeviceLink.sendControl(JSONObject().put("type","tap_hold").put("id",it).put("cancel",true))};holdId=null
        val requested = pending != null || reviewJob?.isActive == true
        val inProgress = pending != null || reviewJob?.isActive == true || hold.progress(clock()) > 0f
        pending = null; pendingPc = null; reviewJob?.cancel(); reviewJob = null
        overlay?.cancel()
        if (reset) hold.reset()
        if (inProgress) { status.value = reason; gesture(reason) }
        if (requested) renewProof()
    }
    private fun pause() {
        enabled = false; sendEnabled(); cancelAttempt("Hold cancelled · locked or disconnected"); rules.clear(); lastFeedback = null
        overlay?.remove(); overlay = null
        try { scanner?.stopScan(scan) } catch (_: SecurityException) { }
        scanner = null; listening = false
    }
    private fun eligible(service: AllyControlService): Boolean = PhysicalTapCapture.holdEligible(service)
    private fun tick() {
        if (!enabled || !active.value) return
        val now = clock()
        val service = AllyControlService.instance
        if (!unlocked() || !optedIn() || DeviceLink.status.value != "Connected" || service == null) { cancelAttempt("Hold cancelled · phone unavailable"); return }
        if (calibrationUntil > now || PhysicalTapSettingsActivity.visible || !eligible(service)) { cancelAttempt("Open another app to hold-close", reset = false); hold.cancelProgress(); return }
        val progress = hold.progress(now)
        if ((pending != null || reviewJob?.isActive == true) && !hold.stillClose(now)) { cancelAttempt("Moved away or signal lost · hold cancelled"); return }
        if (pending != null || reviewJob?.isActive == true) return
        if (progress <= 0f) { overlay?.cancel(); return }
        if(peerProtocol>=2 && now-lastProgressAt>=200){
            val target=rules.target
            if(target!=null){if(holdId==null)holdId=UUID.randomUUID().toString();DeviceLink.sendControl(JSONObject().put("type","tap_hold").put("id",holdId).put("progress",progress).put("target",target.pc).put("beacon",target.beacon).put("nonce",target.nonce));lastProgressAt=now}
        }
        try { if (overlay == null) overlay = HoldHandoffOverlay(service); overlay!!.show(progress) }
        catch (_: Exception) { cancelAttempt("Bottom card unavailable · use manual review"); return }
        if (!hold.take(now)) return
        prefs.edit().putBoolean("hold.awaitDeparture",true).apply()
        val target = rules.target
        if (target == null || now >= target.expires) { cancelAttempt("PC proof expired · try a new hold"); return }
        gesture("Hold complete · awaiting paired-PC confirmation")
        val id = holdId?:UUID.randomUUID().toString(); pending = id to now; pendingPc = target.pc
        // Legacy wire name only: this is an authenticated hold-complete request, never a sensor knock.
        if (!DeviceLink.sendControl(JSONObject().put("type", "tap_knock").put("target", target.pc).put("beacon", target.beacon).put("nonce", target.nonce).put("requestId", id)
            .put("options",JSONObject().put("control",prefs.getBoolean("hold.control",true)).put("viewer",prefs.getBoolean("hold.viewer",true))))) cancelAttempt("PC disconnected · hold cancelled")
        scope.launch { delay(3200); if (pending?.first == id) cancelAttempt("PC did not confirm · move away and try again") }
    }
    private fun message(m: JSONObject) {
        if (!active.value) return
        when (m.optString("type")) {
            "tap_connected" -> resume()
            "tap_disconnected" -> { pause(); status.value = "Disconnected · hold-close paused" }
            "tap_target" -> if (enabled) {
                peerProtocol=m.optInt("protocol",0)
                cancelAttempt("PC beacon changed · begin a new hold")
                rules.bind(PhysicalTapRules.Target(m.optString("target"), m.optString("beacon"), m.optString("nonce"), clock() + m.optLong("ttlMs").coerceIn(0, 25000)), clock())
            }
            "tap_unavailable", "tap_rejected" -> { cancelAttempt(m.optString("reason").take(220)); rules.clear(); status.value = m.optString("reason").take(220); gesture(status.value) }
            "tap_review" -> {
                val p = pending ?: return
                if (!enabled || !unlocked() || !hold.stillClose(clock()) || m.optString("target") != pendingPc || m.optString("requestId") != p.first || clock() - p.second !in 0..3000 || !m.optString("reviewNonce").matches(Regex("[a-f0-9]{64}"))) return
                pending = null
                reviewJob = scope.launch {
                    try {
                        val service = AllyControlService.instance ?: error("Accessibility is unavailable")
                        // Never capture our bottom card. Recheck continuity after it is removed.
                        overlay?.remove(); delay(120)
                        check(hold.stillClose(clock()) && optedIn() && enabled) { "Moved away · hold cancelled" }
                        val receipt=if(m.optInt("protocol")>=2)JSONObject().put("handoffId",p.first).put("nonce",m.optString("reviewNonce")).put("chat",m.optJSONObject("chat")) else null
                        PhysicalTapCapture.open(service, receipt=receipt,stillAllowed = { enabled && optedIn() && hold.stillClose(clock()) && DeviceLink.status.value == "Connected" }, beforeReview = {
                            overlay?.depart { enabled && optedIn() && hold.stillClose(clock()) && unlocked() }
                            delay(120)
                        }) {
                            if (!enabled || !unlocked() || DeviceLink.status.value != "Connected" || clock() - p.second !in 0..60000) return@open
                            lastFeedback = p.first
                            DeviceLink.sendControl(JSONObject().put("type", "tap_opened").put("requestId", p.first).put("reviewNonce", m.optString("reviewNonce")))
                            status.value = "Screen review ready · choose a chat, then Send"; gesture(status.value)
                        }
                    } catch (e: CancellationException) { throw e }
                    catch (e: Exception) { status.value = e.message?.take(220) ?: "Screen review unavailable"; gesture(status.value); renewProof(); android.widget.Toast.makeText(this@PhysicalTapService, status.value, android.widget.Toast.LENGTH_LONG).show() }
                }
            }
            "tap_feedback" -> if (enabled && unlocked() && m.optString("requestId") == lastFeedback) {
                lastFeedback = null
                holdId=null
                if (!DeviceLink.quiet(this) && prefs.getBoolean("phone.haptics", true)) getSystemService(Vibrator::class.java).vibrate(VibrationEffect.createWaveform(longArrayOf(0, 30, 65, 30), -1))
                // Renew a consumed socket nonce, but hold's departure latch still prevents retrigger.
                renewProof()
            }
            "tap_session_status" -> {status.value=m.optString("body").take(300);gesture(status.value)}
        }
    }
    private fun calibrate() {
        if (!enabled || clock() < calibrationUntil) return
        cancelAttempt("Calibrating proximity"); calibrationUntil = clock() + 4000; calibrationRssi.clear()
        status.value = "Hold the phone near your PC · calibrating for 4 seconds"
        scope.launch {
            delay(4000)
            if (!enabled || !unlocked()) { status.value = "Calibration cancelled"; return@launch }
            val value = PhysicalTapRules.proximityCalibration(calibrationRssi)
            if (value != null) prefs.edit().putInt("tap.rssi", value).apply()
            status.value = if (value != null) "Nearby signal calibrated ($value dBm)" else "Paired PC signal missing or unstable; calibration unchanged"
        }
    }
    override fun onDestroy() { pause(); active.value = false; instance = null; scope.cancel(); unregisterReceiver(receiver); status.value = "Hold-close handoff is off"; super.onDestroy() }
}
