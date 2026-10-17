import { v2 } from '@google-cloud/speech';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import type { SpeechSettings } from './settings.js';

export type SpeechEvent = { id: string; type: 'transcript' | 'complete' | 'audio' | 'error'; text?: string; final?: boolean; audio?: string; error?: string };
export interface Recognition { write(bytes: Uint8Array): void; end(): void; cancel(): void }

/** One bounded utterance. Only final Google segments are committed; partials are previews. */
export function recognizeLive(settings: SpeechSettings, emit: (event: Omit<SpeechEvent, 'id'>) => void): Recognition {
  if (!settings.cloud || !settings.project) throw new Error('Enable Google Cloud speech in Voice settings.');
  const client = new v2.SpeechClient({ projectId: settings.project, apiEndpoint: 'us-speech.googleapis.com', quotaProjectId: settings.project });
  const stream = client._streamingRecognize();
  let text = ''; let ended = false; let inputEnded = false; let bytes = 0;
  const timer = setTimeout(() => fail('Live transcription timed out. Use the recorded audio fallback.'), 80_000);
  const cleanup = () => { clearTimeout(timer); stream.destroy(); void client.close(); };
  const fail = (error: string) => { if (ended) return; ended = true; emit({ type: 'error', error }); cleanup(); };
  stream.on('error', () => fail('Google live transcription unavailable. Check Orbit Speech-to-Text access or use local speech.'));
  stream.on('data', response => {
    if (ended) return;
    for (const result of response.results ?? []) {
      const part = result.alternatives?.[0]?.transcript ?? '';
      if (result.isFinal) text = `${text} ${part}`.trim();
      emit({ type: 'transcript', text: result.isFinal ? text : `${text} ${part}`.trim(), final: !!result.isFinal });
    }
  });
  stream.on('end', () => { if (ended) return; ended = true; emit({ type: 'complete', text }); cleanup(); });
  stream.write({ recognizer: `projects/${settings.project}/locations/us/recognizers/_`, streamingConfig: {
    config: { explicitDecodingConfig: { encoding: 'LINEAR16', sampleRateHertz: 16000, audioChannelCount: 1 }, languageCodes: ['en-AU'], model: 'chirp_3' },
    streamingFeatures: { interimResults: true },
  } });
  return {
    write(chunk) {
      if (ended || inputEnded) return;
      bytes += chunk.byteLength;
      if (!chunk.byteLength || chunk.byteLength % 2 || chunk.byteLength > 24_000 || bytes > 1_920_000 || stream.writableLength > 100) { fail('Live audio limit exceeded.'); return; }
      stream.write({ audio: Buffer.from(chunk) });
    },
    end() { if (!ended && !inputEnded) { inputEnded = true; stream.end(); } },
    cancel() { if (ended) return; ended = true; cleanup(); },
  };
}

/** Chirp 3 HD returns raw little-endian PCM as it is generated, not a complete WAV. */
export function synthesizeLive(settings: SpeechSettings, text: string, voice: string, audio: (bytes: Buffer) => void, signal: AbortSignal): Promise<void> {
  if (!settings.cloud || !settings.project) return Promise.reject(new Error('Cloud speech is disabled.'));
  if (!text.trim() || Buffer.byteLength(text) > 4500 || !/^[a-z]{2}-[A-Z]{2}-Chirp3-HD-[A-Za-z]+$/.test(voice)) return Promise.reject(new Error('Invalid speech text or voice.'));
  return new Promise((resolve, reject) => {
    const client = new TextToSpeechClient({ projectId: settings.project, quotaProjectId: settings.project });
    const stream = client.streamingSynthesize();
    let done = false;
    const finish = (error?: Error) => {
      if (done) return; done = true; clearTimeout(timer); signal.removeEventListener('abort', cancel);
      stream.destroy(); void client.close(); error ? reject(error) : resolve();
    };
    const cancel = () => finish(new Error('Speech cancelled.'));
    const timer = setTimeout(() => finish(new Error('Cloud speech timed out.')), 40_000);
    signal.addEventListener('abort', cancel, { once: true });
    stream.on('error', () => finish(new Error('Google streaming voice unavailable. Check Cloud Text-to-Speech access and quota.')));
    stream.on('data', result => { if (!done && result.audioContent?.length) audio(Buffer.from(result.audioContent)); });
    stream.on('end', () => finish());
    if (signal.aborted) { cancel(); return; }
    stream.write({ streamingConfig: { voice: { name: voice, languageCode: voice.slice(0, 5) }, streamingAudioConfig: { audioEncoding: 'PCM', sampleRateHertz: 24000 } } });
    stream.end({ input: { text } });
  });
}
