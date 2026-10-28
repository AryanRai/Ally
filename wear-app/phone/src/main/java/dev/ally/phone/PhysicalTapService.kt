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
        const val CALIBRATE_FAR = "tap.calibrate.far"
        val status = MutableStateFlow("Hold-close handoff is off")
        val active = MutableStateFlow(false)
        val gestureStatus = MutableStateFlow("Waiting for a close hold")
        val diagnostic=MutableStateFlow("Waiting for a radio sample")
        private var instance: PhysicalTapService? = null
        fun install() { DeviceLink.tapHandler = { _, message -> instance?.message(message) } }
    }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val rules = PhysicalTapRules()
    private val hold = ProximityHold()
    private val approach = CalibratedApproach()
    private val audioApproach=AudioApproachGate()
    private var farSamples: List<Int>? = null
    private var calibrationLabel = ""
    private var lastCalibrationSample = 0L
    private val reviewConsent=ReviewSwipeConsent()
    private val audioTrigger=AcousticTrigger()
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
    private var lastDiagnosticAt=0L
    private var lastResumeAttempt=0L
    private val prefs get() = DeviceLink.prefs(this)
    private fun clock() = SystemClock.elapsedRealtime()
    private fun diagnose(stage:String){
        val now=clock();diagnostic.value=stage
        if(now-lastDiagnosticAt<1000)return
        lastDiagnosticAt=now
        prefs.edit().putString("hold.diagnostic",JSONObject().put("stage",stage).put("at",System.currentTimeMillis()).put("rssi",latestRssi).put("median",rules.medianRssi(now)).put("holdProgress",hold.progress(now)).put("audioActive",AcousticProbeService.active.value).put("audioNear",AcousticProbeService.near(this)).put("audioCalibrated",prefs.getBoolean("acoustic.calibrated",false)).put("waitingAudioDeparture",audioApproach.waitingForDeparture()).put("audioStatus",AcousticProbeService.status.value.take(240)).toString()).apply()
    }
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
            if (calibrationUntil > now) {
                if(result.rssi in -100..-15 && now-lastCalibrationSample>=200){
                    lastCalibrationSample=now
                    if(calibrationRssi.size<80)calibrationRssi.add(result.rssi)
                    status.value="$calibrationLabel · ${minOf(calibrationRssi.size,15)}/15 readings · ${result.rssi} dBm · keep still"
                }
                return
            }
            // A weak latest reading cancels without waiting for the rolling median.
            val calibrated=prefs.getBoolean("hold.calibrated2",false)
            val threshold=prefs.getInt("tap.rssi",-55)
            val median=rules.medianRssi(now)
            val near = calibrated && result.rssi >= threshold && rules.near(now, threshold)
            val far = calibrated && result.rssi <= prefs.getInt("hold.farRssi",-70) && median?.let{it<=prefs.getInt("hold.farRssi",-70)}==true
            val audio=prefs.getBoolean("acoustic.enabled",false)
            val qualified = if(audio)false else approach.observe(near, far, now)
            // A silent qualification/backoff is not evidence of actual departure.
            // Audio mode uses the fresh rolling median in tick, avoiding cancellation by one RF dip.
            if(!audio)hold.observe(if (hold.requiresDeparture()) !far else qualified, now)
            if (!hold.requiresDeparture() && prefs.getBoolean("hold.awaitDeparture",false)&&(!audio||AcousticProbeService.far(this@PhysicalTapService))) prefs.edit().putBoolean("hold.awaitDeparture",false).apply()
            if (!audio&&!near) cancelAttempt("Moved away · hold cancelled", reset = false)
        }
    }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate(); instance = this
        if(prefs.getBoolean("hold.awaitDeparture",false)){hold.blockUntilDeparture();audioApproach.block()}
        val filter = IntentFilter().apply { addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_USER_PRESENT) }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED) else registerReceiver(receiver, filter)
        scope.launch { while (isActive) { tick(); delay(50) } }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) { prefs.edit().putBoolean("hold.enabled",false).apply();stopSelf(); return START_NOT_STICKY }
        if (active.value) { if (intent?.action == CALIBRATE_NEAR || intent?.action == CALIBRATE_FAR) calibrate(intent.action == CALIBRATE_FAR); return START_STICKY }
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
        if(reviewConsent.active){hold.blockUntilDeparture();audioApproach.block();prefs.edit().putBoolean("hold.awaitDeparture",true).apply()}
        reviewConsent.clear()
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
        enabled = false; sendEnabled(); cancelAttempt("Hold cancelled · locked or disconnected"); rules.clear(); approach.reset(); lastFeedback = null
        overlay?.remove(); overlay = null
        try { scanner?.stopScan(scan) } catch (_: SecurityException) { }
        scanner = null; listening = false
    }
    private fun eligible(service: AllyControlService): Boolean = PhysicalTapCapture.holdEligible(service)
    private fun tick() {
        if (!active.value) return
        val now = clock()
        if(!enabled){
            diagnose("Waiting to resume: "+status.value)
            if(now-lastResumeAttempt>=1500&&optedIn()&&unlocked()&&DeviceLink.status.value=="Connected"&&AllyControlService.instance!=null){lastResumeAttempt=now;resume()}
            return
        }
        if(prefs.getBoolean("acoustic.enabled",false)&&!prefs.getBoolean("acoustic.calibrated",false)){
            status.value=AcousticProbeService.readiness(this);diagnose(status.value);overlay?.cancel();hold.cancelProgress();return
        }
        val service = AllyControlService.instance
        if (!unlocked() || !optedIn() || DeviceLink.status.value != "Connected" || service == null) { diagnose("Paused: locked, disconnected or accessibility unavailable");cancelAttempt("Hold cancelled · phone unavailable"); return }
        if (calibrationUntil > now || PhysicalTapSettingsActivity.visible || !eligible(service)) { diagnose("Paused: calibration/settings/Ally/system screen; open YouTube");cancelAttempt("Open another app to hold-close", reset = false); hold.cancelProgress(); return }
        if(!prefs.getBoolean("hold.calibrated2",false)){cancelAttempt("Calibrate far and near in Hold-close settings",reset=false);return}
        val audio=prefs.getBoolean("acoustic.enabled",false)
        val coarseRadio=rules.near(now,prefs.getInt("tap.rssi",-55)-10)
        if(audio){
            hold.observe(audioApproach.observe(coarseRadio,AcousticProbeService.far(this),pending!=null||reviewJob?.isActive==true),now)
            if(!hold.requiresDeparture()&&AcousticProbeService.far(this))prefs.edit().putBoolean("hold.awaitDeparture",false).apply()
        }
        val progress = hold.progress(now)
        if ((pending != null || reviewJob?.isActive == true) && !hold.stillClose(now)) { cancelAttempt("Moved away or signal lost · hold cancelled"); return }
        if (pending != null || reviewJob?.isActive == true) return
        if(audio&&!AcousticProbeService.active.value){diagnose("Audio is enabled but paused by Android: open Audio proximity and Resume");overlay?.cancel();return}
        if(audio&&audioTrigger.shouldProbe(if(coarseRadio)rules.medianRssi(now) else null,now,AcousticProbeService.instance?.checking==true,AcousticProbeService.near(this),reviewConsent.active)){
            AcousticProbeService.instance?.probe()
        }
        if (progress <= 0f) { diagnose(if(audio&&audioApproach.waitingForDeparture())"Waiting for a verified FAR chirp before another offer" else if(audio&&coarseRadio)"Checking acoustic proximity: "+AcousticProbeService.status.value else "Waiting for fresh paired-PC radio / approach");overlay?.cancel(); return }
        if(peerProtocol>=2 && now-lastProgressAt>=200){
            val target=rules.target
            if(target!=null){if(holdId==null)holdId=UUID.randomUUID().toString();DeviceLink.sendControl(JSONObject().put("type","tap_hold").put("id",holdId).put("progress",progress).put("target",target.pc).put("beacon",target.beacon).put("nonce",target.nonce));lastProgressAt=now}
        }
        // Keep radio qualification/hold silent; only the finite ready suggestion is visible.
        if(progress<1f){diagnose("Silent hold ${(progress*100).toInt()}%"+(if(audio)"; "+AcousticProbeService.status.value else ""));overlay?.cancel();return}
        if(prefs.getBoolean("acoustic.enabled",false)&&!AcousticProbeService.near(this)){
            if(reviewConsent.active){cancelAttempt("Acoustic confirmation expired - move away before trying again");hold.blockUntilDeparture();return}
            if(!prefs.getBoolean("acoustic.calibrated",false)||!AcousticProbeService.active.value){cancelAttempt("Start and calibrate acoustic confirmation, or turn its requirement off");hold.blockUntilDeparture();return}
            diagnose("Waiting for fresh NEAR chirp: "+AcousticProbeService.status.value)
            return
        }
        reviewConsent.offer(now)
        diagnose("Ready: swipe the phone card up to open local review")
        if(reviewConsent.expired(now)){cancelAttempt("Review offer expired - move away before trying again");return}
        try { if (overlay == null) overlay = HoldHandoffOverlay(service); overlay!!.show(progress,if(progress>=1f && !reviewConsent.authorized(now)) {{
            reviewConsent.confirm(clock(),enabled&&optedIn()&&unlocked()&&DeviceLink.status.value=="Connected"&&hold.progress(clock())>=1f&&(!prefs.getBoolean("acoustic.enabled",false)||AcousticProbeService.near(this)))
        }} else null) }
        catch (_: Exception) { cancelAttempt("Bottom card unavailable · use manual review"); return }
        if(!reviewConsent.authorized(now))return
        if (!hold.take(now)) return
        if(audio)audioApproach.block()
        reviewConsent.clear()
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
    private fun calibrate(far: Boolean) {
        if (!enabled || clock() < calibrationUntil) return
        if(!far && farSamples==null)farSamples=prefs.getString("hold.farSamples",null)?.split(',')?.mapNotNull{it.toIntOrNull()}?.takeIf{it.size>=15}
        if(!far && farSamples==null){status.value="No far measurement saved. Tap Calibrate far first and wait for 15/15 readings.";return}
        cancelAttempt("Calibrating proximity"); approach.reset(); calibrationUntil = clock() + 20000; calibrationRssi.clear();lastCalibrationSample=0
        if(far){farSamples=null;prefs.edit().remove("hold.farSamples").apply()}
        calibrationLabel=if(far)"Measuring FAR" else "Measuring NEAR"
        status.value = "$calibrationLabel · 0/15 readings · keep still (up to 20 seconds)"
        scope.launch {
            val started=clock()
            while(clock()<calibrationUntil && (clock()-started<4000 || calibrationRssi.size<15)){
                delay(200)
                if(!enabled||!unlocked()){calibrationUntil=0;status.value="Calibration cancelled · phone locked or disconnected. Retry this step.";return@launch}
            }
            calibrationUntil=0
            if(far){
                farSamples=calibrationRssi.toList().takeIf{it.size>=15}
                if(farSamples!=null)prefs.edit().putString("hold.farSamples",farSamples!!.joinToString(",")).apply()
                status.value=if(farSamples!=null)"Far saved (${farSamples!!.sorted()[farSamples!!.size/2]} dBm). Bring phone beside PC, then tap Calibrate near." else "Only ${calibrationRssi.size}/15 far readings. Paired beacon missing/too sparse; stay in Bluetooth range and retry far."
            }else{
                val profile=farSamples?.let{ProximityCalibration.adaptive(calibrationRssi,it)}
                prefs.edit().putString("hold.nearSamples",calibrationRssi.joinToString(",")).apply()
                if(profile!=null)prefs.edit().putInt("tap.rssi",profile.near).putInt("hold.farRssi",profile.far).putBoolean("hold.calibrated2",true).putBoolean("hold.adaptiveSwipe",true).apply()
                val nearMedian=calibrationRssi.sorted().let{it.getOrNull(it.size/2)}
                val farMedian=farSamples?.sorted()?.let{it.getOrNull(it.size/2)}
                status.value=when{
                    profile!=null->"Adaptive approach saved. Move away, approach and hold, then swipe the card to open local review."
                    calibrationRssi.size<15->"Only ${calibrationRssi.size}/15 near readings. Far saved; retry near beside laptop."
                    else->"Rise is smaller than signal variation: near $nearMedian dBm, far $farMedian dBm. Retry with phone held still; far saved. Manual review remains available."
                }
            }
            approach.reset();hold.blockUntilDeparture()
        }
    }
    override fun onDestroy() { pause(); active.value = false; instance = null; scope.cancel(); unregisterReceiver(receiver); status.value = "Hold-close handoff is off"; super.onDestroy() }
}
