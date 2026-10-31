package dev.ally.phone.codexprobe

import org.junit.Assert.*
import org.junit.Test
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import java.util.Base64
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

class LoopbackConnectProxyTest {
    private fun auth(proxy: LoopbackConnectProxy) = "Basic " + Base64.getEncoder().encodeToString(URI(proxy.url).userInfo.toByteArray())
    private fun status(proxy: LoopbackConnectProxy, request: String, authorization: String?): String =
        Socket("127.0.0.1", proxy.port).use { client ->
            client.soTimeout = 3000
            client.getOutputStream().write((request + "\r\n" + (authorization?.let { "Proxy-Authorization: $it\r\n" } ?: "") + "\r\n").toByteArray())
            client.getInputStream().bufferedReader().readLine()
        }

    @Test fun rejectsMissingCredentialsBeforeDns() {
        LoopbackConnectProxy(resolve = { error("DNS must not run") }).use { proxy ->
            assertTrue(status(proxy, "CONNECT auth.openai.com:443 HTTP/1.1", null).contains("407"))
        }
    }
    @Test fun refusesArbitraryDestinationsAndHttp() {
        LoopbackConnectProxy(resolve = { error("DNS must not run") }).use { proxy ->
            for (request in listOf("CONNECT 192.168.1.1:443 HTTP/1.1", "CONNECT auth.openai.com:80 HTTP/1.1", "CONNECT auth.openai.com.evil.test:443 HTTP/1.1", "GET http://auth.openai.com/ HTTP/1.1")) {
                assertTrue(status(proxy, request, auth(proxy)).contains("403"))
            }
        }
    }
    @Test fun refusesPrivateDnsAnswer() {
        LoopbackConnectProxy(resolve = { arrayOf(InetAddress.getByName("127.0.0.1")) }, connect = { _, _ -> error("Must not connect") }).use { proxy ->
            assertTrue(status(proxy, "CONNECT auth.openai.com:443 HTTP/1.1", auth(proxy)).contains("502"))
        }
    }
    @Test fun tunnelsBytesAndClosesActiveSockets() {
        val closed = CountDownLatch(1)
        ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { upstream ->
            val echo = thread(isDaemon = true) {
                upstream.accept().use { socket ->
                    assertEquals(42, socket.getInputStream().read()); socket.getOutputStream().write(43)
                    assertEquals(-1, socket.getInputStream().read()); closed.countDown()
                }
            }
            val proxy = LoopbackConnectProxy(resolve = { arrayOf(InetAddress.getByName("1.1.1.1")) }, connect = { _, port -> assertEquals(443, port); Socket("127.0.0.1", upstream.localPort) })
            Socket("127.0.0.1", proxy.port).use { client ->
                client.soTimeout = 3000
                client.getOutputStream().write("CONNECT auth.openai.com:443 HTTP/1.1\r\nProxy-Authorization: ${auth(proxy)}\r\n\r\n".toByteArray())
                // Read exactly the header so TLS/application bytes remain untouched.
                val input = client.getInputStream()
                val header = StringBuilder()
                while (!header.endsWith("\r\n\r\n")) header.append(input.read().also { assertTrue(it >= 0) }.toChar())
                assertTrue(header.startsWith("HTTP/1.1 200"))
                client.getOutputStream().write(42); assertEquals(43, input.read())
                proxy.close(); assertTrue(proxy.isClosed)
                assertEquals(-1, input.read())
            }
            assertTrue(closed.await(3, TimeUnit.SECONDS)); echo.join(3000)
        }
    }
}
