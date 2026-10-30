import { app, ipcMain } from 'electron';
import { ensureSpeechRuntime, getSpeechRuntimeStatus, stopSpeechRuntime } from '../speech/runtime.js';
import { nativeSpeech, cancelNativeSpeech, installedVoices, type VoiceOptions } from '../speech/native.js';
import { googleSpeech, googleVoices } from '../speech/google.js';
import { outputMute, setOutputMute, registerOutputMute } from '../speech/outputMute.js';
import { speechSettings } from '../speech/settings.js';
import { transcribeRecording } from '../speech/transcription.js';
import { synthesizeCloudWav } from '../speech/streaming.js';

const failed = (error: unknown) => ({ success: false as const, error: error instanceof Error ? error.message : 'Speech operation failed.' });

/** Main process keeps worker credentials and recordings out of URLs, logs and persisted chats. */
export function registerSpeechIpc(): void {
  registerOutputMute();
  ipcMain.handle('speech:outputMute', () => outputMute());
  ipcMain.handle('speech:setOutputMute', (_, muted) => setOutputMute(muted));
  let cloudRequest: AbortController | undefined;
  ipcMain.handle('speech:connect', async () => {
    try { await ensureSpeechRuntime(); return { success: true }; } catch (error) { return failed(error); }
  });
  ipcMain.handle('speech:getStatus', async () => getSpeechRuntimeStatus());
  ipcMain.handle('speech:voices', async () => {
    try { return { success: true, voices: await installedVoices() }; } catch (error) { return failed(error); }
  });
  ipcMain.handle('speech:cloudVoices', async () => {
    try { return { success: true, voices: await googleVoices() }; } catch (error) { return failed(error); }
  });
  ipcMain.handle('speech:transcribe', async (_, bytes: Uint8Array) => {
    try {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < 6444 || bytes.byteLength > 1_950_044) throw new Error('Invalid recording length.');
      const settings = speechSettings();
      if (settings.cloud && (settings.transcriptionProvider ?? settings.cloudProvider) === 'gemini') return { success: true, ...await transcribeRecording(bytes, settings) };
      const { url, token } = await ensureSpeechRuntime();
      const response = await fetch(`${url}/transcribe`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/wav' },
        body: Buffer.from(bytes), signal: AbortSignal.timeout(90_000),
      });
      const data = await response.json() as { text?: string; error?: string };
      if (!response.ok) return { success: false, status: response.status, error: data.error ?? `Transcription failed (${response.status}).` };
      return { success: true, text: data.text ?? '' };
    } catch (error) { return failed(error); }
  });
  ipcMain.handle('speech:synthesize', async (_, text: string, options?: VoiceOptions) => {
    try {
      if (options?.engine === 'google' || options?.engine === 'gemini') {
        const request = new AbortController(); cloudRequest = request;
        try { return { success: true, audio_data: options.engine === 'gemini' ? await synthesizeCloudWav({ ...speechSettings(), cloud: true, cloudProvider: 'gemini' }, text, request.signal) : await googleSpeech(text, options.cloudVoice ?? '', request.signal), provider: options.engine }; }
        catch (error) {
          if (request.signal.aborted) return failed(new Error('Speech cancelled.'));
          return { success: true, audio_data: await nativeSpeech(text, options), provider: 'local', warning: `${failed(error).error} Using your Windows voice.` };
        } finally { if (cloudRequest === request) cloudRequest = undefined; }
      }
      return { success: true, audio_data: await nativeSpeech(text, options), provider: 'local' };
    } catch (error) { return failed(error); }
  });
  ipcMain.handle('speech:cancel', () => { cloudRequest?.abort(); cancelNativeSpeech(); return { success: true }; });
  app.on('will-quit', () => { cloudRequest?.abort(); cancelNativeSpeech(); stopSpeechRuntime(); });
}
