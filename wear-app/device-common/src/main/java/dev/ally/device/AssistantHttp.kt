package dev.ally.device

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** No automatic retries for uploads or sends; cancellation closes the actual call. */
internal object AssistantHttp {
    val client = OkHttpClient.Builder().retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).build()
    suspend fun execute(client: OkHttpClient, request: Request): Pair<Int, String> = suspendCancellableCoroutine { continuation ->
        val call = client.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) { if (continuation.isActive) continuation.resumeWithException(e) }
            override fun onResponse(call: Call, response: Response) {
                response.use {
                    try {
                        val value = it.code to it.body?.string().orEmpty()
                        if (continuation.isActive) continuation.resume(value)
                    } catch (e: Exception) { if (continuation.isActive) continuation.resumeWithException(e) }
                }
            }
        })
    }
}
