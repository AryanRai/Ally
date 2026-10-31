package dev.ally.phone.codexprobe

import java.io.Closeable
import java.io.InputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Debug probe transport only. TLS stays end-to-end inside Codex; no HTTP body is inspected. */
internal class LoopbackConnectProxy(
    private val resolve: (String) -> Array<InetAddress> = InetAddress::getAllByName,
    private val connect: (InetAddress, Int) -> Socket = { address, port ->
        Socket().apply { connect(InetSocketAddress(address, port), 10000) }
    },
    private val event: (String) -> Unit = {},
) : Closeable {
    private val secret = UUID.randomUUID().toString()
    private val authorization = "Basic " + Base64.getEncoder().encodeToString("probe:$secret".toByteArray())
    private val server = ServerSocket().apply { bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0), 4) }
    private val sockets = ConcurrentHashMap.newKeySet<Socket>()
    private val running = AtomicBoolean(true)
    private val workers = Executors.newFixedThreadPool(6) { runnable -> Thread(runnable, "CodexProbeProxy").apply { isDaemon = true } }
    val port: Int get() = server.localPort
    val url: String get() = "http://probe:$secret@127.0.0.1:$port"
    val isClosed: Boolean get() = server.isClosed && sockets.isEmpty()
    private val acceptor = Thread({
        while (running.get()) {
            try {
                val client = server.accept()
                if (!client.inetAddress.isLoopbackAddress || sockets.size >= 4) { client.close(); continue }
                sockets.add(client)
                workers.execute { tunnel(client) }
            } catch (error: Exception) {
                if (running.get()) event("accept: ${error.javaClass.simpleName}")
            }
        }
    }, "CodexProbeAccept").apply { isDaemon = true; start() }

    private fun line(input: InputStream): String {
        val bytes = ArrayList<Byte>()
        while (bytes.size < 4096) {
            val b = input.read()
            check(b >= 0) { "Unexpected EOF in proxy header" }
            if (b == 10) return bytes.toByteArray().toString(Charsets.US_ASCII).trimEnd('\r')
            bytes.add(b.toByte())
        }
        error("Proxy header line too long")
    }

    private fun tunnel(client: Socket) {
        var upstream: Socket? = null
        var established = false
        try {
            client.soTimeout = 15000
            val input = client.getInputStream().buffered()
            val request = line(input).split(' ')
            val headers = mutableMapOf<String, String>()
            var bytes = 0
            while (true) {
                val value = line(input); bytes += value.length
                check(bytes <= 8192) { "Proxy headers too large" }
                if (value.isEmpty()) break
                val colon = value.indexOf(':'); check(colon > 0)
                headers[value.substring(0, colon).lowercase()] = value.substring(colon + 1).trim()
            }
            if (headers["proxy-authorization"] != authorization) {
                client.getOutputStream().write("HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"probe\"\r\nContent-Length: 0\r\n\r\n".toByteArray())
                return
            }
            // This probe only authenticates with OpenAI. No general LAN or arbitrary-host proxy.
            if (request.size != 3 || request[0] != "CONNECT" || request[1].lowercase() != "auth.openai.com:443") {
                client.getOutputStream().write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n".toByteArray())
                return
            }
            val started = System.nanoTime()
            val addresses = resolve("auth.openai.com") // Android's InetAddress uses the phone resolver/netd.
            check(addresses.isNotEmpty()) { "DNS returned no addresses" }
            event("Android DNS auth.openai.com: ${addresses.joinToString { it.hostAddress ?: "?" }} in ${(System.nanoTime() - started) / 1000000} ms")
            var failure: Exception? = null
            for (address in addresses) {
                check(!address.isAnyLocalAddress && !address.isLoopbackAddress && !address.isSiteLocalAddress && !address.isLinkLocalAddress) { "Non-public proxy destination" }
                try { upstream = connect(address, 443); break } catch (error: Exception) { failure = error }
            }
            val remote = upstream ?: throw (failure ?: IllegalStateException("No upstream"))
            sockets.add(remote); remote.soTimeout = 30000
            client.getOutputStream().write("HTTP/1.1 200 Connection Established\r\n\r\n".toByteArray())
            established = true
            workers.execute {
                try { input.copyTo(remote.getOutputStream()) } catch (_: Exception) { }
                finally { runCatching { remote.shutdownOutput() } }
            }
            remote.getInputStream().copyTo(client.getOutputStream())
        } catch (error: Exception) {
            event("proxy failure: ${error.javaClass.simpleName}: ${error.message}")
            if (!established) runCatching { client.getOutputStream().write("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n".toByteArray()) }
        } finally {
            upstream?.let { runCatching { it.close() }; sockets.remove(it) }
            runCatching { client.close() }; sockets.remove(client)
        }
    }

    override fun close() {
        running.set(false); server.close()
        sockets.toList().forEach { runCatching { it.close() } }
        workers.shutdownNow(); workers.awaitTermination(2, TimeUnit.SECONDS)
        acceptor.join(2000)
        sockets.clear()
    }
}
