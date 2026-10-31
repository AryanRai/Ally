package dev.ally.phone.codex

import android.content.Context
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.Closeable
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/** One stdio app-server. No prompt in argv, inherited credentials, arbitrary RPC or tool executor. */
internal class CodexRpc(private val context: Context, private val notification: (String, JSONObject) -> Unit) : Closeable {
    private val pending = ConcurrentHashMap<Long, CompletableDeferred<JSONObject>>()
    private val ids = AtomicLong()
    private val proxy by lazy { CodexConnectProxy() }
    private val home = File(context.filesDir, "phone-codex").apply { mkdirs() }
    val workspace = File(home, "workspace").apply { mkdirs() }
    private val temp = File(home, "tmp").apply { mkdirs() }
    private val process: Process
    private val writer: java.io.BufferedWriter
    private var closed = false
    private val closing = java.util.concurrent.atomic.AtomicBoolean(false)
    private val startupError=StringBuilder()
    private val reviews=CoroutineScope(SupervisorJob()+Dispatchers.IO)
    init {
        val ca = File(home, "android-ca.pem")
        val store = java.security.KeyStore.getInstance("AndroidCAStore").apply { load(null) }
        ca.bufferedWriter().use { out -> java.util.Collections.list(store.aliases()).forEach { alias ->
            store.getCertificate(alias)?.let { cert ->
                out.appendLine("-----BEGIN CERTIFICATE-----")
                out.appendLine(java.util.Base64.getMimeEncoder(64, byteArrayOf(10)).encodeToString(cert.encoded))
                out.appendLine("-----END CERTIFICATE-----")
            }
        } }
        val catalog = File(home, "models.json")
        context.assets.open("phone-codex-models.json").use { input -> catalog.outputStream().use { input.copyTo(it) } }
        val models=JSONObject(catalog.readText().removePrefix("\uFEFF")).getJSONArray("models")
        for(i in 0 until models.length()) { val m=models.getJSONObject(i); check(m.isNull("apply_patch_tool_type") && m.getString("shell_type")=="disabled" && m.getString("tool_mode")=="direct" && m.getBoolean("node_repl_disabled") && m.getJSONArray("experimental_supported_tools").length()==0) { "Unsafe phone model catalog" } }
        val binary = File(context.applicationInfo.nativeLibraryDir, "libcodex.so")
        check(binary.isFile && binary.canExecute()) { "Install the phone Codex build first" }
        // No other config roots, hooks, plugins or tools can introduce command/file execution.
        File(home, "config.toml").writeText("""
            sandbox_mode = "danger-full-access"
            approval_policy = "on-request"
            forced_login_method = "chatgpt"
            cli_auth_credentials_store = "file"
            model_catalog_json = ${JSONObject.quote(catalog.path).replace("\\/", "/")}
            web_search = "disabled"
            [features]
            shell_tool = false
            shell_snapshot = false
            view_image = false
            apps = false
            plugins = false
            remote_plugin = false
            multi_agent = false
            hooks = false
            codex_hooks = false
            plugin_hooks = false
            code_mode = false
            code_mode_tool_search = false
            skill_mcp_dependency_install = false
            [hooks]
        """.trimIndent())
        val builder = ProcessBuilder(binary.path, "app-server", "--listen", "stdio://").directory(workspace)
        builder.environment().apply {
            clear(); put("HOME",home.path); put("CODEX_HOME",home.path); put("TMPDIR",temp.path)
            put("PATH","/system/bin:/system/xbin"); put("LANG","C.UTF-8"); put("SSL_CERT_FILE",ca.path)
            put("HTTPS_PROXY",proxy.url); put("HTTP_PROXY",proxy.url); put("https_proxy",proxy.url); put("http_proxy",proxy.url)
            put("NO_PROXY","127.0.0.1,localhost"); put("no_proxy","127.0.0.1,localhost")
        }
        try { process = builder.start() } catch (e: Exception) { proxy.close(); throw e }
        writer = process.outputStream.bufferedWriter()
        kotlin.concurrent.thread(name="PhoneCodexRpc",isDaemon=true) {
            try { process.inputStream.bufferedReader().use { input ->
                while (true) {
                    val line = input.readLine() ?: break
                    check(line.length <= 4_000_000) { "Oversize app-server message" }
                    val msg = JSONObject(line)
                    if (msg.has("method")) {
                        // Built-in shell/permission requests are NEVER accepted on Android.
                        if (msg.has("id")) {
                            if(msg.getString("method")=="mcpServer/elicitation/request") reviews.launch {
                                val answer=try {PhoneLocalDecisions.elicit(context,msg.optJSONObject("params")?:JSONObject())}catch(_:Exception){JSONObject().put("action","cancel").put("content",JSONObject.NULL)}
                                respond(msg.get("id"),JSONObject().put("result",answer))
                            } else {
                                notification("ally/serverRequestRejected",JSONObject().put("method",msg.getString("method")))
                                respond(msg.get("id"), JSONObject().put("error",JSONObject().put("code",-32601).put("message","Unsupported on phone; use Ally phone tools")))
                            }
                        }
                        else notification(msg.getString("method"),msg.optJSONObject("params") ?: JSONObject())
                    } else {
                        pending.remove(msg.optLong("id"))?.let { waiter ->
                            if(msg.has("error")) waiter.completeExceptionally(IllegalStateException(msg.getJSONObject("error").optString("message","Codex request failed")))
                            else waiter.complete(msg.optJSONObject("result") ?: JSONObject())
                        }
                    }
                }
            } } catch (e: Exception) { synchronized(startupError){startupError.appendLine("RPC reader: ${e.javaClass.simpleName}: ${e.message?.take(500)}")} }
            finally {
                val detail=synchronized(startupError){startupError.toString().takeLast(1600)}
                pending.values.forEach { it.completeExceptionally(IllegalStateException("Phone Codex stopped${if(detail.isBlank())"" else ": $detail"}")) }; pending.clear()
                if(!closed) notification("ally/processExited",JSONObject())
            }
        }
        kotlin.concurrent.thread(name="PhoneCodexStderr",isDaemon=true) { runCatching {process.errorStream.bufferedReader().useLines { lines->lines.forEach { line->
            if(line.contains("error",true) && !Regex("bearer|token|secret|authorization|user.code",RegexOption.IGNORE_CASE).containsMatchIn(line)) synchronized(startupError){startupError.appendLine(line.take(1600));if(startupError.length>4096)startupError.delete(0,startupError.length-4096)}
        }}} }
    }
    private fun write(value: JSONObject) = synchronized(writer) { check(!closed); writer.write(value.toString()); writer.newLine(); writer.flush() }
    private fun respond(id: Any, value: JSONObject) { runCatching { write(value.put("id",id)) } }
    suspend fun initialize() {
        request("initialize", JSONObject().put("clientInfo",JSONObject().put("name","ally_phone").put("version","0.1.5")))
        write(JSONObject().put("method","initialized"))
        val config = request("config/read",JSONObject().put("includeLayers",false)).getJSONObject("config")
        check(config.optJSONObject("features")?.optBoolean("shell_tool",true)==false) { "Shell disabling could not be verified" }
        check(config.optJSONObject("features")?.optBoolean("view_image",true)==false) { "File-read disabling could not be verified" }
    }
    suspend fun request(method: String, params: JSONObject = JSONObject()): JSONObject {
        require(method in METHODS) { "Unsupported phone RPC" }
        val id=ids.incrementAndGet(); val waiter=CompletableDeferred<JSONObject>(); pending[id]=waiter
        try { write(JSONObject().put("id",id).put("method",method).put("params",params)); return withTimeout(45_000) { waiter.await() } }
        finally { pending.remove(id) }
    }
    override fun close() {
        if(!closing.compareAndSet(false,true))return
        closed=true
        reviews.cancel()
        runCatching { writer.close() }; process.destroy()
        if(!process.waitFor(1500,java.util.concurrent.TimeUnit.MILLISECONDS)) process.destroyForcibly()
        proxy.close(); temp.listFiles()?.forEach { it.deleteRecursively() }
        pending.values.forEach { it.cancel() }; pending.clear()
    }
    companion object {
        private val METHODS=setOf("initialize","config/read","account/read","account/login/start","account/login/cancel","account/logout","model/list","mcpServerStatus/list","thread/start","thread/resume","thread/read","turn/start","turn/steer","turn/interrupt")
    }
}

