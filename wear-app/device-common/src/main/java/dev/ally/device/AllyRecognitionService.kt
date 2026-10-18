package dev.ally.device

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionService
import android.speech.SpeechRecognizer
import dev.ally.device.voice.LiveSpeech
import dev.ally.device.voice.VoiceRecorder
import kotlinx.coroutines.*

/** Android's recognition contract uses the same explicitly started, bounded
 * capture as Ally. Assistant activation alone never calls this recognizer. */
class AllyRecognitionService : RecognitionService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val recorder = VoiceRecorder()
    private var speech: LiveSpeech? = null
    private var listener: Callback? = null
    private var finishing = false
    override fun onStartListening(intent: Intent, callback: Callback) {
        if (listener != null) { callback.error(SpeechRecognizer.ERROR_RECOGNIZER_BUSY); return }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            callback.error(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS); return
        }
        val prefs = DeviceLink.prefs(this)
        val endpoint = prefs.getString("endpoint", "")!!
        val token = prefs.getString("token", "")!!
        if (!endpoint.startsWith("https://") || token.isBlank()) { callback.error(SpeechRecognizer.ERROR_NETWORK); return }
        listener = callback; finishing = false
        try {
            speech = LiveSpeech(endpoint, token) { text -> scope.launch {
                if (listener === callback) callback.partialResults(Bundle().apply { putStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION, arrayListOf(text)) })
            } }
            recorder.start(scope, { onStopListening(callback) }, { fail(callback) }, { level, _ ->
                if (listener === callback) callback.rmsChanged(level)
            }, { speech?.write(it) })
            callback.readyForSpeech(Bundle())
        } catch (_: Exception) { fail(callback) }
    }
    override fun onStopListening(callback: Callback) {
        if (listener !== callback || finishing) return
        finishing = true
        scope.launch {
            try {
                recorder.stop()
                callback.endOfSpeech()
                val text = speech?.finish()
                if (listener === callback) {
                    if (text.isNullOrBlank()) callback.error(SpeechRecognizer.ERROR_NO_MATCH)
                    else callback.results(Bundle().apply { putStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION, arrayListOf(text)) })
                }
            } catch (e: CancellationException) { throw e } catch (_: Exception) { if(listener === callback) callback.error(SpeechRecognizer.ERROR_NETWORK) }
            finally { if(listener === callback) clear() }
        }
    }
    private fun fail(callback: Callback) { if(listener === callback) { clear(); callback.error(SpeechRecognizer.ERROR_AUDIO) } }
    private fun clear() { listener = null; finishing = false; recorder.cancel(); speech?.cancel(); speech = null }
    override fun onCancel(callback: Callback) { if (listener === callback) clear() }
    override fun onDestroy() { clear(); scope.cancel(); super.onDestroy() }
}
