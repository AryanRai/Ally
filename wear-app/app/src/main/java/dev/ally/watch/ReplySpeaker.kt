package dev.ally.watch

import android.content.Context
import kotlinx.coroutines.CoroutineScope

/** Watch playback keeps its media service while the shared engine queues narration. */
internal class ReplySpeaker(context: Context, scope: CoroutineScope, state: (Boolean, String) -> Unit) {
    private val app = context.applicationContext
    private val speech = dev.ally.device.voice.ReplySpeech(app, scope, state,
        { ReplyPlayback.begin(app) }, { ReplyPlayback.end(app, it) }, { ReplyPlayback.renew(app, it) })
    fun speak(text: String, endpoint: String, token: String, cloud: Boolean) = speech.speak(text, endpoint, token, cloud)
    fun enqueue(text: String, endpoint: String, token: String, cloud: Boolean) = speech.enqueue(text, endpoint, token, cloud)
    fun stop() = speech.stop()
    fun close() = speech.close()
}
