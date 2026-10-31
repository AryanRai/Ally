package dev.ally.phone.codexprobe

import android.content.Context
import android.os.SystemClock
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/** No generic agent loop or arbitrary RPC entry. Never starts a thread, turn, tool, or shell. */
internal class CodexAppProbe(private val context: Context, private val display: (String) -> Unit) {
    private val report = JSONObject()
    private val runs = JSONArray()
    private val binary get() = File(context.applicationInfo.nativeLibraryDir, "libcodex.so")
    private fun note(message: String) { Log.i("AllyCodexProbe", message); display(message) }
    private fun read(file: File): String = runCatching { file.readText().trim() }.getOrElse { "unavailable: ${it.message}" }

    fun run() {
        val root = File(context.filesDir, "codex-probe-${UUID.randomUUID()}")
        var proxy: LoopbackConnectProxy? = null
        try {
            report.put("appPid", android.os.Process.myPid()).put("appUid", android.os.Process.myUid())
                .put("appSelinux", read(File("/proc/self/attr/current"))).put("binary", binary.path)
                .put("sandbox", "danger-full-access (Android app sandbox remains enforced)")
                .put("runs", runs).put("modelTurns", 0)
            check(binary.isFile && binary.canExecute()) { "Missing executable libcodex.so; build debug with -PcodexProbe=true" }
            val hash = java.security.MessageDigest.getInstance("SHA-256")
            binary.inputStream().use { input ->
                val buffer = ByteArray(65536)
                while (true) { val n = input.read(buffer); if (n < 0) break; hash.update(buffer, 0, n) }
            }
            val digest = hash.digest().joinToString("") { "%02x".format(it) }
            check(digest == "f2e6c980c937e734644bed1b4a9a018d3e63a0ccbe71aafc85c86a8c6e4b462a") { "Packaged Codex hash mismatch: $digest" }
            report.put("binarySha256", digest)
            check(root.mkdir()) { "Cannot create isolated probe home" }
            note("App ${report.getString("appSelinux")}; verified Codex 0.166.0")
            // Only transport differs. Each pass gets a fresh, private, empty Codex home.
            runServer(File(root, "direct"), null, "direct")
            val proxyEvents = JSONArray()
            proxy = LoopbackConnectProxy(event = { message -> synchronized(proxyEvents) { proxyEvents.put(message) }; note(message) })
            report.put("proxyEvents", proxyEvents).put("proxyPort", proxy.port)
            runServer(File(root, "proxied"), proxy.url, "proxied")
            // Export only existing public Android trust anchors for the Linux TLS client.
            // No trust-store changes, user credentials, or TLS-verification override.
            val store=java.security.KeyStore.getInstance("AndroidCAStore").apply{load(null)}
            val certs=java.util.Collections.list(store.aliases()).mapNotNull{store.getCertificate(it)}
            val caFile=File(root,"android-ca.pem")
            caFile.bufferedWriter().use{out->certs.forEach{cert->
                out.appendLine("-----BEGIN CERTIFICATE-----")
                out.appendLine(java.util.Base64.getMimeEncoder(64, byteArrayOf(10)).encodeToString(cert.encoded))
                out.appendLine("-----END CERTIFICATE-----")
            }}
            report.put("androidTrustAnchors",certs.size)
            runServer(File(root,"proxied-android-trust"),proxy.url,"proxied-android-trust",caFile)
        } catch (error: Exception) {
            report.put("error", "${error.javaClass.simpleName}: ${error.message}")
            note("Probe error: ${report.getString("error")}")
        } finally {
            proxy?.close()
            report.put("proxyClosed", proxy?.isClosed ?: true)
            // Only this invocation's freshly-created private directory is removed.
            report.put("privateProbeRemoved", !root.exists() || root.deleteRecursively())
            File(context.filesDir, "codex-probe-result.json").writeText(report.toString(2))
            note("PROBE_COMPLETE: proxyClosed=${report.optBoolean("proxyClosed")}; privateProbeRemoved=${report.optBoolean("privateProbeRemoved")}")
        }
    }

    private fun runServer(home: File, proxy: String?, label: String, caFile:File?=null) {
        check(home.mkdirs())
        val temp = File(home, "tmp").apply { mkdir() }
        val result = JSONObject().put("transport", label)
        runs.put(result)
        val lines = ArrayBlockingQueue<String>(128)
        val stderr = StringBuilder()
        var process: Process? = null
        var stdoutReader: Thread? = null
        var stderrReader: Thread? = null
        try {
            val started = SystemClock.elapsedRealtime()
            val builder = ProcessBuilder(binary.path, "app-server", "--listen", "stdio://", "-c", "sandbox_mode=\"danger-full-access\"")
                .directory(home)
            builder.environment().apply {
                clear() // No inherited app/PC credentials, agent configs, or proxies.
                put("PATH", "/system/bin:/system/xbin"); put("HOME", home.path)
                put("CODEX_HOME", home.path); put("TMPDIR", temp.path); put("LANG", "C.UTF-8")
                if(caFile!=null)put("SSL_CERT_FILE",caFile.path)
                if (proxy != null) { put("HTTPS_PROXY", proxy); put("HTTP_PROXY", proxy); put("https_proxy", proxy); put("http_proxy", proxy); put("NO_PROXY", "127.0.0.1,localhost") }
            }
            // Android lacks Java 9 Process.pid(); inspect only our spawning thread's children.
            fun childIds()=File("/proc/self/task").listFiles().orEmpty().flatMap { task ->
                read(File(task,"children")).split(Regex("\\s+")).mapNotNull{it.toIntOrNull()}
            }.toSet()
            val priorChildren=childIds()
            process = builder.start()
            val child = process
            val description=child.toString()
            val pid = Regex("pid[=: ]+(\\d+)").find(description)?.groupValues?.get(1)?.toIntOrNull()
                ?: (childIds()-priorChildren).singleOrNull()
            result.put("processDescription",description)
            if(pid!=null)result.put("pid",pid)
            result.put("selinux",if(pid!=null)read(File("/proc/$pid/attr/current")) else "PID unavailable")
            
            note("$label launched PID $pid; ${result.getString("selinux")}")
            stdoutReader = thread(name = "CodexProbeStdout", isDaemon = true) {
                runCatching { child.inputStream.bufferedReader().useLines { stream -> stream.forEach { check(it.length < 1048576); lines.put(it) } } }
            }
            stderrReader = thread(name = "CodexProbeStderr", isDaemon = true) {
                runCatching { child.errorStream.bufferedReader().useLines { stream -> stream.forEach { synchronized(stderr) { if (stderr.length < 12000) stderr.appendLine(it.take(2000)) } } } }
            }
            val writer = child.outputStream.bufferedWriter()
            var sequence = 0
            val calls = JSONArray(); result.put("calls", calls)
            fun request(method: String, params: JSONObject, timeoutMs: Long = 20000): JSONObject {
                check(method in setOf("initialize", "account/read", "config/read", "account/login/start", "account/login/cancel"))
                val id = ++sequence
                val since = SystemClock.elapsedRealtime()
                writer.write(JSONObject().put("id", id).put("method", method).put("params", params).toString() + "\n"); writer.flush()
                val until = since + timeoutMs
                while (SystemClock.elapsedRealtime() < until) {
                    val line = lines.poll(minOf(250, until - SystemClock.elapsedRealtime()).coerceAtLeast(1), TimeUnit.MILLISECONDS)
                    if (line == null) { check(child.isAlive) { "Codex exited ${child.exitValue()}" }; continue }
                    val message = JSONObject(line)
                    if (message.optInt("id", -1) == id && (message.has("result") || message.has("error"))) {
                        val receipt = JSONObject().put("method", method).put("elapsedMs", SystemClock.elapsedRealtime() - since).put("response", message)
                        calls.put(receipt)
                        return message
                    }
                    // Notifications may arrive between responses; never execute server requests.
                    check(!message.has("id")) { "Unexpected server request: ${message.optString("method")}" }
                }
                error("$method timed out after $timeoutMs ms")
            }
            val init = request("initialize", JSONObject().put("clientInfo", JSONObject().put("name", "ally_android_app_probe").put("title", "Ally debug Android probe").put("version", "1.0.0")))
            check(!init.has("error")) { init.getJSONObject("error").toString() }
            result.put("initializeMs", SystemClock.elapsedRealtime() - started)
            writer.write("{\"method\":\"initialized\"}\n"); writer.flush()
            val account = request("account/read", JSONObject().put("refreshToken", false))
            note("$label initialize=${result.getLong("initializeMs")} ms; account/read=$account")
            check(account.getJSONObject("result").isNull("account")) { "Unexpected pre-existing account in isolated probe home" }
            val config = request("config/read", JSONObject().put("includeLayers", false))
            val sandbox = config.getJSONObject("result").getJSONObject("config").optString("sandbox_mode")
            result.put("effectiveSandbox", sandbox)
            check(sandbox == "danger-full-access") { "Requested sandbox setting not effective: $sandbox" }
            val memory = (if(pid!=null)read(File("/proc/$pid/status")) else "PID unavailable: $description").lineSequence().filter { it.startsWith("VmRSS:") || it.startsWith("VmHWM:") || it.startsWith("Seccomp:") || it.startsWith("NoNewPrivs:") || it.startsWith("Uid:") }.joinToString("\n")
            result.put("processStatus", memory); note("$label memory: $memory")
            val login = request("account/login/start", JSONObject().put("type", "chatgptDeviceCode"), 30000)
            val loginResult = login.optJSONObject("result")
            if (loginResult != null) {
                result.put("deviceCodeIssued", loginResult.has("userCode"))
                // Show only the user-facing code/URL. Cancel immediately; never complete sign-in.
                note("$label device code issued: ${loginResult.optString("userCode")} (${loginResult.optString("verificationUrl")}); cancelling unused login")
                val cancel = request("account/login/cancel", JSONObject().put("loginId", loginResult.getString("loginId")))
                result.put("loginCancelled", !cancel.has("error"))
            } else {
                result.put("deviceCodeIssued", false); note("$label login-start: ${login.optJSONObject("error")}")
            }
            val after = request("account/read", JSONObject().put("refreshToken", false))
            result.put("accountAfter", after.getJSONObject("result"))
            check(after.getJSONObject("result").isNull("account")) { "Unexpected sign-in completion" }
            writer.close()
        } catch (error: Exception) {
            result.put("error", "${error.javaClass.simpleName}: ${error.message}")
            note("$label error: ${result.getString("error")}")
            if (error is InterruptedException) throw error
        } finally {
            process?.let { child ->
                runCatching { child.outputStream.close() }
                // Clear cancellation only while ensuring that our child is stopped.
                val interrupted = Thread.interrupted()
                try {
                    if (!child.waitFor(3, TimeUnit.SECONDS)) { child.destroy(); if (!child.waitFor(2, TimeUnit.SECONDS)) { child.destroyForcibly(); child.waitFor(2, TimeUnit.SECONDS) } }
                    result.put("processStopped", !child.isAlive)
                    if (!child.isAlive) result.put("exitCode", child.exitValue())
                    runCatching { child.inputStream.close() }; runCatching { child.errorStream.close() }
                    stdoutReader?.join(1000); stderrReader?.join(1000)
                    synchronized(stderr) { result.put("stderr", stderr.toString()) }
                    note("$label stopped=${!child.isAlive}; exit=${result.opt("exitCode")}")
                } finally { if (interrupted) Thread.currentThread().interrupt() }
            }
        }
    }
}
