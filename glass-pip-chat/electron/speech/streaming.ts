import { v2 } from '@google-cloud/speech';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import type { SpeechSettings } from './settings.js';
import { speakerSegments, type SpeakerSegment } from './speakers.js';
import { recognizeGeminiLive } from './gemini.js';

export type SpeechEvent = { id: string; type: 'transcript' | 'complete' | 'audio' | 'error'; text?: string; final?: boolean; audio?: string; error?: string; speaker?: string; speakers?: SpeakerSegment[]; speakerWarning?: string };
export interface Recognition { write(bytes: Uint8Array): void; end(): void; cancel(): void }

/** One bounded utterance. Only final Google segments are committed; partials are previews. */
export function recognizeLive(settings: SpeechSettings, emit: (event: Omit<SpeechEvent, 'id'>) => void, options: { diarization?: boolean } = {}): Recognition {
  if (!settings.cloud || !settings.project) throw new Error('Enable Google Cloud speech in Voice settings.');
  if ((settings.transcriptionProvider ?? settings.cloudProvider) === 'gemini') return recognizeGeminiLive({ ...settings, diarization: options.diarization === true && settings.diarization === true }, emit);
  const client = new v2.SpeechClient({ projectId: settings.project, apiEndpoint: 'us-speech.googleapis.com', quotaProjectId: settings.project });
  const stream = client._streamingRecognize();
  let text = ''; let ended = false; let inputEnded = false; let bytes = 0;
  const identifySpeakers = options.diarization === true && settings.diarization === true;
  const audio: Buffer[] = [];
  let finishing = false;
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
  stream.on('end', async () => {
    if (ended || finishing) return; finishing = true;
    let speakers: SpeakerSegment[] | undefined, speakerWarning: string | undefined;
    if (identifySpeakers && bytes > 0) {
      try {
        // Chirp 3 streaming has no diarization. Recognize supports it in en-US;
        // keep the original en-AU stream as fallback and never upload to storage.
        const [response] = await client.recognize({ recognizer: `projects/${settings.project}/locations/us/recognizers/_`, content: Buffer.concat(audio),
          config: { explicitDecodingConfig: { encoding: 'LINEAR16', sampleRateHertz: 16000, audioChannelCount: 1 }, languageCodes: ['en-US'], model: 'chirp_3', features: { diarizationConfig: {} } },
        }, { timeout: 20_000 });
        speakers = speakerSegments(response.results ?? []);
        if (!speakers.length || speakers.every(s => s.speaker === 'Unassigned speaker')) { speakers = undefined; speakerWarning = 'Speaker labels unavailable for this utterance.'; }
      } catch { speakerWarning = 'Speaker identification unavailable; kept the live transcript.'; }
    }
    if (ended) return;
    ended = true;
    emit({ type: 'complete', text: speakers?.map(s => s.text).join(' ') || text,
      ...(speakers ? { speakers, ...(new Set(speakers.map(s => s.speaker)).size === 1 ? { speaker: speakers[0].speaker } : {}) } : {}), ...(speakerWarning ? { speakerWarning } : {}) }); cleanup();
  });
  stream.write({ recognizer: `projects/${settings.project}/locations/us/recognizers/_`, streamingConfig: {
    config: { explicitDecodingConfig: { encoding: 'LINEAR16', sampleRateHertz: 16000, audioChannelCount: 1 }, languageCodes: ['en-AU'], model: 'chirp_3' },
    streamingFeatures: { interimResults: true },
  } });
  return {
    write(chunk) {
      if (ended || inputEnded) return;
      bytes += chunk.byteLength;
      if (!chunk.byteLength || chunk.byteLength % 2 || chunk.byteLength > 24_000 || bytes > 1_920_000 || stream.writableLength > 100) { fail('Live audio limit exceeded.'); return; }
      if (identifySpeakers) audio.push(Buffer.from(chunk));
      stream.write({ audio: Buffer.from(chunk) });
    },
    end() { if (!ended && !inputEnded) { inputEnded = true; stream.end(); } },
    cancel() { if (ended) return; ended = true; cleanup(); },
  };
}

/** Chirp 3 HD returns raw little-endian PCM as it is generated, not a complete WAV. */
export function synthesizeLive(settings: SpeechSettings, text: string, voice: string, audio: (bytes: Buffer) => void, signal: AbortSignal): Promise<void> {
  if (!settings.cloud || !settings.project) return Promise.reject(new Error('Cloud speech is disabled.'));
  const gemini = settings.cloudProvider === 'gemini';
  const selected = settings.geminiVoice ?? 'Aoede';
  if (!text.trim() || Buffer.byteLength(text) > 4500 || (gemini ? !/^[A-Z][a-z]{2,30}$/.test(selected) : !/^[a-z]{2}-[A-Z]{2}-Chirp3-HD-[A-Za-z]+$/.test(voice))) return Promise.reject(new Error('Invalid speech text or voice.'));
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
    stream.on('error', () => finish(new Error(`${gemini ? 'Gemini' : 'Google'} streaming voice unavailable. Check Cloud Text-to-Speech access and quota.`)));
    stream.on('data', result => { if (!done && result.audioContent?.length) {
      try { audio(Buffer.from(result.audioContent)); }
      catch { finish(new Error('Speech audio could not be delivered.')); }
    } });
    stream.on('end', () => finish());
    if (signal.aborted) { cancel(); return; }
    stream.write({ streamingConfig: { voice: gemini ? { name: selected, languageCode: 'en-US', modelName: settings.geminiTtsModel ?? 'gemini-2.5-flash-tts' } : { name: voice, languageCode: voice.slice(0, 5) }, streamingAudioConfig: { audioEncoding: 'PCM', sampleRateHertz: 24000 } } });
    stream.end({ input: { text, ...(gemini ? { prompt: settings.geminiStyle || 'Read the supplied words exactly in a warm, natural conversational voice.' } : {}) } });
  });
}

/** A WAV wrapper for consumers that need a complete file rather than PCM frames. */
export async function synthesizeCloudWav(settings: SpeechSettings, text: string, signal: AbortSignal): Promise<string> {
  const chunks: Buffer[] = []; let size = 0;
  await synthesizeLive(settings, text, settings.voice, chunk => {
    size += chunk.length;
    if (size > 24_000_000) throw new Error('Speech audio exceeded the playback limit.');
    chunks.push(Buffer.from(chunk));
  }, signal);
  if (!size || size % 2) throw new Error('No complete speech audio was returned.');
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(size + 36, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(size, 40);
  return Buffer.concat([header, ...chunks]).toString('base64');
}
