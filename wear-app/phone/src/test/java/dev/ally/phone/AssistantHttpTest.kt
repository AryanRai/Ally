package dev.ally.phone

import dev.ally.device.AssistantHttp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.EventListener
import okhttp3.Request
import org.junit.Assert.*
import org.junit.Test
import java.net.ServerSocket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class AssistantHttpTest {
    @Test fun cancellingPendingRequestCancelsActualNetworkCallWithoutRetry() = runBlocking {
        ServerSocket(0).use { server ->
            val sent = CountDownLatch(1)
            val cancelled = CountDownLatch(1)
            val client = AssistantHttp.client.newBuilder().eventListener(object : EventListener() {
                override fun requestHeadersEnd(call: Call, request: Request) { sent.countDown() }
                override fun canceled(call: Call) { cancelled.countDown() }
            }).build()
            val pending = async(Dispatchers.IO) {
                AssistantHttp.execute(client, Request.Builder().url("http://127.0.0.1:${server.localPort}/lookup").build())
            }
            assertTrue(withContext(Dispatchers.IO) { sent.await(5, TimeUnit.SECONDS) })
            pending.cancelAndJoin()
            assertTrue(cancelled.await(1, TimeUnit.SECONDS))
            assertFalse(client.retryOnConnectionFailure)
            assertFalse(client.followRedirects)
            client.connectionPool.evictAll()
        }
    }
}
