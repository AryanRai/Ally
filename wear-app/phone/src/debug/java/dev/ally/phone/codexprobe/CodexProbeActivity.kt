package dev.ally.phone.codexprobe

import android.app.Activity
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicBoolean

/** Explicit adb/debug entry only; absent from release. Runs as the ordinary Ally app UID. */
class CodexProbeActivity : Activity() {
    private val worker = Executors.newSingleThreadExecutor()
    private var task: Future<*>? = null
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val status = TextView(this).apply {
            text = if(intent.getBooleanExtra("phoneAcceptance",false)||intent.getBooleanExtra("phoneAdvancedAcceptance",false)) "Ally · Phone Codex acceptance\nSmall test prompts. No phone actions.\n\n" else "Ally · Android Codex probe\nNo prompts. No sign-in completion.\n\n"
            textSize = 15f; setPadding(32, 48, 32, 32)
            setTextColor(0xffdfe8eb.toInt()); setBackgroundColor(0xff101416.toInt())
        }
        setContentView(ScrollView(this).apply { addView(status) })
        if(intent.getBooleanExtra("phoneSignIn",false)) {
            dev.ally.phone.codex.PhoneCodex.signIn(applicationContext)
            startActivity(android.content.Intent(this,dev.ally.phone.codex.CodexPhoneActivity::class.java));finish();return
        }
        if (!running.compareAndSet(false, true)) { status.append("A probe is already running."); return }
        task = worker.submit {
            try { if(intent.getBooleanExtra("phoneDiagnostic",false))PhoneRuntimeDiagnostic.run(applicationContext){message->runOnUiThread{status.append(message+"\n")}}
                else if(intent.getBooleanExtra("phoneAdvancedAcceptance",false))PhoneRuntimeAcceptance.advanced(applicationContext,intent.getBooleanExtra("phoneBridgeOnly",false)){message->runOnUiThread{status.append(message+"\n")}}
                else if(intent.getBooleanExtra("phoneAcceptance",false))PhoneRuntimeAcceptance.run(applicationContext){message->runOnUiThread{status.append(message+"\n")}}
                else if(intent.getBooleanExtra("phoneRuntime",false))PhoneRuntimeCheck.run(applicationContext){message->runOnUiThread{status.append(message+"\n")}}
                else CodexAppProbe(applicationContext) { message -> runOnUiThread { status.append(message + "\n") } }.run() }
            finally { running.set(false) }
        }
    }
    override fun onDestroy() {
        task?.cancel(true); worker.shutdownNow()
        super.onDestroy()
    }
    companion object { private val running = AtomicBoolean(false) }
}
