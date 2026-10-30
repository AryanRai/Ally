import { speechSettings, type SpeechSettings } from './settings.js';
import { ensureSpeechRuntime } from './runtime.js';
import { recognizeGeminiLive } from './gemini.js';
import type { Recognition } from './streaming.js';

export function pcmFromVoiceWav(bytes: Uint8Array): Buffer {
  const wav = Buffer.from(bytes);
  if (wav.length < 6444 || wav.length > 1_950_044 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Invalid voice recording.');
  let format = false, pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4), start = offset + 8;
    if (size > wav.length - start) throw new Error('Incomplete voice recording.');
    const tag = wav.toString('ascii', offset, offset + 4);
    if (tag === 'fmt ') format = size >= 16 && wav.readUInt16LE(start) === 1 && wav.readUInt16LE(start + 2) === 1 && wav.readUInt32LE(start + 4) === 16000 && wav.readUInt16LE(start + 14) === 16;
    if (tag === 'data') pcm = wav.subarray(start, start + size);
    offset = start + size + size % 2;
  }
  if (!format || !pcm || pcm.length < 6400 || pcm.length > 1_920_000 || pcm.length % 2) throw new Error('Expected 16 kHz mono PCM voice audio.');
  return pcm;
}

/** Same recorded-audio provider for desktop, phone and watch. Never creates a chat. */
export async function transcribeRecording(bytes: Uint8Array, settings: SpeechSettings = speechSettings()): Promise<{ text: string; warning?: string }> {
  let warning: string | undefined;
  if (settings.cloud && (settings.transcriptionProvider ?? settings.cloudProvider) === 'gemini') {
    const pcm = pcmFromVoiceWav(bytes);
    try {
      const text = await new Promise<string>((resolve, reject) => {
        let capture: Recognition | undefined;
        const timer = setTimeout(() => { capture?.cancel(); reject(new Error('Gemini recording transcription timed out.')); }, 30_000);
        try { capture = recognizeGeminiLive(settings, event => {
          if (event.type === 'error') { clearTimeout(timer); reject(new Error(event.error)); }
          if (event.type === 'complete') { clearTimeout(timer); resolve(event.text ?? ''); }
        }); } catch(error) { clearTimeout(timer); reject(error); return; }
        for (let offset = 0; offset < pcm.length; offset += 16000) capture.write(pcm.subarray(offset, offset + 16000));
        capture.end();
      });
      return { text };
    } catch { warning = 'Gemini transcription unavailable; used local transcription for this recording.'; }
  }
  const { url, token } = await ensureSpeechRuntime();
  const response = await fetch(`${url}/transcribe`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/wav' }, body: Buffer.from(bytes), signal: AbortSignal.timeout(120_000) });
  const data = await response.json() as { text?: string; error?: string };
  if (!response.ok) throw new Error(data.error ?? 'Local transcription unavailable.');
  return { text: data.text ?? '', ...(warning ? { warning } : {}) };
}
