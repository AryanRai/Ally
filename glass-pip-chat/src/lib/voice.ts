import { pcm16k, UtteranceBuffer, wav16k } from './voiceAudio';

export interface SpeechStatus {
  connected: boolean; listening: boolean; device: string; modelsLoaded: boolean;
  phase: 'offline' | 'connecting' | 'ready' | 'listening' | 'transcribing' | 'speaking' | 'error';
  backend: string; model: string; level: number;
}
interface VoiceSnapshot {
  status: SpeechStatus; lastRecognizedText: string | null; recognitionId: number;
  speechError: string | null; isSpeaking: boolean; voiceModeEnabled: boolean; droidModeEnabled: boolean;
}
let snapshot: VoiceSnapshot = {
  status: { connected: false, listening: false, device: 'local', modelsLoaded: false, phase: 'offline', backend: 'faster-whisper', model: '', level: 0 },
  lastRecognizedText: null, recognitionId: 0, speechError: null, isSpeaking: false, voiceModeEnabled: false, droidModeEnabled: false,
};
const listeners = new Set<() => void>();
const update = (patch: Partial<VoiceSnapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
const status = (patch: Partial<SpeechStatus>) => update({ status: { ...snapshot.status, ...patch } });
const message = (error: unknown) => error instanceof Error ? error.message : 'Voice operation failed.';
const fail = (error: unknown) => { update({ speechError: message(error) }); status({ phase: 'error' }); };
let connecting: Promise<void> | undefined;
let capture: { stream: MediaStream; context: AudioContext; node: AudioWorkletNode; buffer: UtteranceBuffer } | undefined;
let startingCapture: Promise<void> | undefined;
let captureGeneration = 0;
let transcriptGeneration = 0;
let transcribing = false;
let pendingAudio: Array<{ bytes: Uint8Array; generation: number }> = [];
let connectionGeneration = 0;
let speakingGeneration = 0;
let speechQueue = Promise.resolve();
let playback: AudioContext | undefined;
let currentSource: AudioBufferSourceNode | undefined;

export const voice = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => snapshot,
  async connect() {
    if (snapshot.status.connected) return;
    if (connecting) return connecting;
    connecting = (async () => {
      const generation = connectionGeneration;
      status({ phase: 'connecting' }); update({ speechError: null });
      try {
        const result = await window.pip.speech.connect();
        if (!result.success) throw new Error(result.error);
        const resultStatus = await window.pip.speech.getStatus();
        if (generation !== connectionGeneration) return;
        if (!resultStatus.ready) throw new Error(resultStatus.error ?? 'Speech model is not ready.');
        status({ connected: resultStatus.ready, modelsLoaded: resultStatus.ready, backend: resultStatus.backend ?? 'local', model: resultStatus.model ?? '', phase: 'ready' });
      } catch (error) { if (generation === connectionGeneration) fail(error); throw error; }
    })().finally(() => { connecting = undefined; });
    return connecting;
  },
  async disconnect() {
    ++connectionGeneration;
    ++transcriptGeneration; pendingAudio = [];
    update({ voiceModeEnabled: false });
    await voice.stopListening(false); voice.stopCurrentSpeech();
    status({ connected: false, modelsLoaded: false, phase: 'offline' });
  },
  async startListening() {
    if (capture) return;
    if (startingCapture) return startingCapture;
    const generation = ++captureGeneration;
    startingCapture = (async () => {
      let stream: MediaStream | undefined;
      let context: AudioContext | undefined;
      try {
        await voice.connect();
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        if (generation !== captureGeneration) { stream.getTracks().forEach(track => track.stop()); return; }
        context = new AudioContext();
        await context.audioWorklet.addModule(new URL('./voice-capture.js', window.location.href).href);
        await context.resume();
        if (generation !== captureGeneration) { stream.getTracks().forEach(track => track.stop()); await context.close(); return; }
        const node = new AudioWorkletNode(context, 'ally-capture');
        const buffer = new UtteranceBuffer();
        const silence = context.createGain(); silence.gain.value = 0;
        context.createMediaStreamSource(stream).connect(node); node.connect(silence).connect(context.destination);
        capture = { stream, context, node, buffer };
        let meterFrame = 0;
        node.port.onmessage = event => {
          if (capture?.node !== node) return;
          const result = buffer.push(pcm16k(event.data, context!.sampleRate));
          if (++meterFrame % 5 === 0) status({ level: Math.min(1, result.level * 10) });
          // Echo cancellation is requested above; near-end speech immediately cancels local playback.
          if (result.started && snapshot.isSpeaking) voice.stopCurrentSpeech();
          if (result.utterance) void enqueueTranscription(wav16k(result.utterance));
        };
        stream.getAudioTracks()[0].onended = () => { void voice.stopListening(false); update({ voiceModeEnabled: false }); fail(new Error('Microphone disconnected. Choose a microphone and enable voice again.')); };
        status({ listening: true, phase: 'listening', level: 0 }); update({ speechError: null });
      } catch (error) {
        stream?.getTracks().forEach(track => track.stop());
        if (context && context.state !== 'closed') await context.close();
        update({ voiceModeEnabled: false }); status({ listening: false }); fail(error); throw error;
      }
    })().finally(() => { startingCapture = undefined; });
    return startingCapture;
  },
  async stopListening(flush = true) {
    ++captureGeneration;
    const current = capture; capture = undefined;
    if (current) {
      current.node.port.onmessage = null; current.node.disconnect();
      current.stream.getTracks().forEach(track => { track.onended = null; track.stop(); });
      if (current.context.state !== 'closed') await current.context.close();
      const frames = current.buffer.flush();
      if (flush && frames) void enqueueTranscription(wav16k(frames));
    }
    status({ listening: false, level: 0, phase: snapshot.status.connected ? 'ready' : 'offline' });
  },
  setVoiceModeEnabled(enabled: boolean) {
    update({ voiceModeEnabled: enabled });
    if (enabled) void voice.startListening().catch(() => {});
    else { ++transcriptGeneration; pendingAudio = []; void voice.stopListening(false); voice.stopCurrentSpeech(); }
  },
  setDroidModeEnabled() { fail(new Error('Audio modem mode is unavailable in the local speech runtime.')); },
  async sendGGWave() { throw new Error('Audio modem mode is unavailable in the local speech runtime.'); },
  async playGeneratedSpeech(audioData: string, generation = speakingGeneration, volume = 1) {
    playback ??= new AudioContext();
    await playback.resume();
    const bytes = Uint8Array.from(atob(audioData), char => char.charCodeAt(0));
    const buffer = await playback.decodeAudioData(bytes.buffer);
    if (generation !== speakingGeneration) return;
    const source = playback.createBufferSource(); source.buffer = buffer;
    const gain = playback.createGain(); gain.gain.value = Math.min(1, Math.max(0, volume));
    source.connect(gain).connect(playback.destination); currentSource = source;
    await new Promise<void>(resolve => { source.onended = () => { if (currentSource === source) currentSource = undefined; resolve(); }; source.start(); });
  },
  synthesizeSpeech(text: string) {
    const generation = speakingGeneration;
    speechQueue = speechQueue.catch(() => {}).then(async () => {
      if (generation !== speakingGeneration) return;
      update({ isSpeaking: true }); status({ phase: 'speaking' });
      try {
        let options: { engine?: 'local' | 'google'; volume?: number } = {};
        try { options = JSON.parse(localStorage.getItem('ally-voice-options') ?? '{}'); } catch { /* Use installed default. */ }
        const result = await window.pip.speech.synthesize(text, options);
        if (generation !== speakingGeneration) return;
        if (!result.success || !result.audio_data) throw new Error(result.error ?? 'No audio returned by the installed voice.');
        update({ speechError: result.warning ?? null });
        await voice.playGeneratedSpeech(result.audio_data, generation, result.provider === 'google' ? options.volume ?? 1 : 1);
      } catch (error) { if (generation === speakingGeneration) fail(error); }
      finally {
        if (generation === speakingGeneration) { update({ isSpeaking: false }); status({ phase: capture ? 'listening' : snapshot.status.connected ? 'ready' : 'offline' }); }
      }
    });
    return speechQueue;
  },
  synthesizeSpeechStreaming(text: string) { return voice.synthesizeSpeech(text); },
  speakResponse(text: string) { return snapshot.voiceModeEnabled ? voice.synthesizeSpeech(text) : Promise.resolve(); },
  speakResponseStreaming(text: string) { return voice.speakResponse(text); },
  stopCurrentSpeech() {
    ++speakingGeneration;
    try { currentSource?.stop(); } catch { /* Already ended. */ }
    currentSource = undefined;
    void window.pip?.speech.cancel();
    update({ isSpeaking: false });
  },
  async interruptAndSpeak(text: string) { voice.stopCurrentSpeech(); return voice.synthesizeSpeech(text); },
  resetTTSQueue() { ++transcriptGeneration; pendingAudio = []; capture?.buffer.flush(); voice.stopCurrentSpeech(); },
};

async function enqueueTranscription(bytes: Uint8Array) {
  if (pendingAudio.length >= 2) { fail(new Error('Transcription is catching up. Pause briefly before continuing.')); return; }
  pendingAudio.push({ bytes, generation: transcriptGeneration });
  if (transcribing) return;
  transcribing = true;
  try {
    while (pendingAudio.length) {
      const { bytes: audio, generation } = pendingAudio.shift()!;
      if (generation !== transcriptGeneration) continue;
      status({ phase: 'transcribing' });
      let result = await window.pip.speech.transcribe(audio);
      for (let retry = 0; result.status === 429 && retry < 5 && generation === transcriptGeneration; retry++) {
        await new Promise(resolve => setTimeout(resolve, 600 * (retry + 1)));
        result = await window.pip.speech.transcribe(audio);
      }
      if (generation !== transcriptGeneration) continue;
      if (!result.success) throw new Error(result.error);
      if (result.text?.trim()) update({ lastRecognizedText: result.text.trim(), recognitionId: snapshot.recognitionId + 1, speechError: null });
    }
  } catch (error) { fail(error); pendingAudio = []; }
  finally { transcribing = false; status({ phase: capture ? 'listening' : snapshot.status.connected ? 'ready' : 'offline' }); }
}

if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => { void voice.disconnect(); });
