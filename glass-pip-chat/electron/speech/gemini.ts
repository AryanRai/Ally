import WebSocket from 'ws';
import { GoogleAuth } from 'google-auth-library';
import type { SpeechSettings } from './settings.js';
import type { Recognition, SpeechEvent } from './streaming.js';

export function geminiLiveUrl(settings: SpeechSettings): string {
  if (!/^[a-z][a-z0-9-]{4,62}$/.test(settings.project)) throw new Error('Select your Google Cloud project in Voice settings.');
  const location = settings.geminiLocation ?? 'global';
  if (!['global', 'us', 'eu'].includes(location)) throw new Error('Unsupported Gemini speech location.');
  return `wss://${location === 'global' ? '' : location + '-'}aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
}
async function connect(settings: SpeechSettings): Promise<WebSocket> {
  const url = geminiLiveUrl(settings);
  const auth = new GoogleAuth({ projectId: settings.project, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient(), access = await client.getAccessToken();
  if (!access.token) throw new Error('Google Cloud credentials are unavailable.');
  return new WebSocket(url, { headers: { Authorization: `Bearer ${access.token}`, 'x-goog-user-project': settings.project }, maxPayload: 256_000, handshakeTimeout: 10_000 });
}

/** Transcription only: no tools, system prompt, generated answers or model audio. */
export function recognizeGeminiLive(settings: SpeechSettings, emit: (event: Omit<SpeechEvent, 'id'>) => void,
  open: () => Promise<WebSocket> = () => connect(settings)): Recognition {
  geminiLiveUrl(settings);
  settings = { ...settings }; // A shared settings change applies to the next utterance.
  let socket: WebSocket | undefined, done = false, ready = false, ending = false, total = 0, text = '';
  let queued: Buffer[] = [];
  let deadline: ReturnType<typeof setTimeout>;
  let setupDeadline: ReturnType<typeof setTimeout>;
  const cleanup = () => { clearTimeout(deadline); clearTimeout(setupDeadline); queued = []; socket?.close(); };
  const fail = (error = 'Gemini live transcription unavailable. Check Vertex AI access and quota for the selected project; recorded audio is kept for fallback.') => {
    if (done) return; done = true; cleanup(); emit({ type: 'error', error });
  };
  deadline = setTimeout(() => fail('Gemini transcription timed out. Use the recorded audio fallback.'), 80_000);
  setupDeadline = setTimeout(() => fail('Gemini did not connect in time. Use the recorded audio fallback.'), 12_000);
  const send = (value: unknown) => {
    if (done || !socket || socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 2_000_000) { fail('Gemini transcription fell behind. Use the recorded audio fallback.'); return; }
    socket.send(JSON.stringify(value));
  };
  const audio = (bytes: Buffer) => send({ realtimeInput: { audio: { data: bytes.toString('base64'), mimeType: 'audio/pcm;rate=16000' } } });
  void open().then(ws => {
    // Even an authentication request finishing after cancellation cannot reopen capture.
    if (done) { ws.on('error', () => {}); ws.close(); return; }
    socket = ws;
    ws.on('error', () => fail());
    ws.on('close', () => { if (!done) fail(); });
    const setup = () => send({ setup: {
      model: `projects/${settings.project}/locations/${settings.geminiLocation ?? 'global'}/publishers/google/models/gemini-3.5-transcribe-live`,
      generationConfig: { responseModalities: ['TEXT'] },
      inputAudioTranscription: { mode: settings.geminiMode ?? 'VERBATIM', languageCodes: [] },
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
    } });
    if (ws.readyState === WebSocket.OPEN) setup(); else ws.once('open', setup);
    ws.on('message', raw => {
      if (done) return;
      try {
        const event = JSON.parse(raw.toString());
        if (event.error) { fail(); return; }
        if (event.setupComplete && !ready) {
          clearTimeout(setupDeadline);
          ready = true; send({ realtimeInput: { activityStart: {} } });
          for (const bytes of queued) audio(bytes); queued = [];
          if (ending) send({ realtimeInput: { activityEnd: {} } });
        }
        const content = event.serverContent;
        if (typeof content?.interimInputTranscription?.text === 'string') emit({ type: 'transcript', text: `${text} ${content.interimInputTranscription.text}`.trim(), final: false });
        if (typeof content?.inputTranscription?.text === 'string') {
          text = `${text} ${content.inputTranscription.text}`.trim();
          if (text.length > 24_000) { fail('Gemini transcript exceeded the voice limit.'); return; }
          emit({ type: 'transcript', text, final: true });
        }
        // The dedicated Vertex transcription model ends with generationComplete;
        // conversational Live models may additionally send turnComplete.
        if ((content?.generationComplete || content?.turnComplete) && ending) {
          done = true; cleanup(); emit({ type: 'complete', text, ...(settings.diarization ? { speakerWarning: 'Speaker identification is unavailable for Gemini live transcription.' } : {}) });
        }
      } catch { fail('Gemini returned an invalid transcription event.'); }
    });
  }).catch(() => fail());
  return {
    write(bytes) {
      if (done || ending) return;
      total += bytes.byteLength;
      if (!bytes.byteLength || bytes.byteLength % 2 || bytes.byteLength > 24_000 || total > 1_920_000) { fail('Live audio limit exceeded.'); return; }
      if (ready) audio(Buffer.from(bytes)); else queued.push(Buffer.from(bytes));
    },
    end() { if (done || ending) return; ending = true; if (ready) send({ realtimeInput: { activityEnd: {} } }); },
    cancel() { if (done) return; done = true; cleanup(); },
  };
}
