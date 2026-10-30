import { useEffect, useState } from 'react';
import { useSpeechService } from '../../hooks/useSpeechService';

export default function SpeechSettingsSection() {
  const speech = useSpeechService();
  const [voices, setVoices] = useState<string[]>([]);
  const [voiceError, setVoiceError] = useState('');
  const [cloudVoices, setCloudVoices] = useState<string[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [project, setProject] = useState('');
  const [notifications, setNotifications] = useState(true);
  const [diarization, setDiarization] = useState(false);
  const [geminiVoice, setGeminiVoice] = useState('Aoede');
  const [geminiStyle, setGeminiStyle] = useState('');
  const [transcription, setTranscription] = useState<'google' | 'gemini'>('google');
  const [smart, setSmart] = useState(false);
  useEffect(() => { void window.pip.speech.settings().then(settings => {
    setProject(settings.project); setNotifications(settings.notifications);
    setDiarization(settings.diarization === true);
    setGeminiVoice(settings.geminiVoice ?? 'Aoede'); setGeminiStyle(settings.geminiStyle ?? ''); setSmart(settings.geminiMode === 'SMART');
    setTranscription(settings.transcriptionProvider ?? settings.cloudProvider ?? 'google');
    setOptions(previous => ({ ...previous, engine: settings.cloud ? settings.cloudProvider ?? 'google' : 'local', cloudVoice: settings.voice }));
  }); }, []);
  const [options, setOptions] = useState<{ voice: string; rate: number; volume: number; engine: 'local' | 'google' | 'gemini'; cloudVoice: string }>(() => {
    try { return { voice: '', rate: 0, volume: .8, engine: 'local', cloudVoice: '', ...JSON.parse(localStorage.getItem('ally-voice-options') ?? '{}') }; }
    catch { return { voice: '', rate: 0, volume: .8, engine: 'local', cloudVoice: '' }; }
  });
  useEffect(() => { localStorage.setItem('ally-voice-options', JSON.stringify(options)); }, [options]);
  useEffect(() => {
    let disposed = false;
    window.pip?.speech.voices().then(result => {
      if (disposed) return;
      setVoices(result.voices ?? []); setVoiceError(result.error ?? '');
    }).catch(() => { if (!disposed) setVoiceError('Installed voices unavailable.'); });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (options.engine !== 'google') return;
    let disposed = false; setCloudLoading(true); setVoiceError('');
    window.pip.speech.cloudVoices().then(result => {
      if (disposed) return;
      const names = result.voices?.map(voice => voice.name) ?? [];
      setCloudVoices(names); setVoiceError(result.error ?? '');
      if (names.length) setOptions(previous => ({ ...previous, cloudVoice: names.includes(previous.cloudVoice) ? previous.cloudVoice : names.find(name => name === 'en-AU-Chirp3-HD-Aoede') ?? names[0] }));
    }).catch(() => { if (!disposed) setVoiceError('Google Cloud voices unavailable.'); }).finally(() => { if (!disposed) setCloudLoading(false); });
    return () => { disposed = true; };
  }, [options.engine]);
  return <section className="space-y-3 text-xs">
    <h3 className="text-sm font-medium text-white/80">Voice</h3>
    <label className="flex items-start gap-2 text-white/60"><input type="checkbox" checked={diarization} onChange={event => { setDiarization(event.target.checked); void window.pip.speech.saveSettings({ diarization: event.target.checked }); }} />
      Identify speakers in realtime sessions with Chirp. Adds a Google recognition pass after each utterance (English US model, billed usage). Gemini live transcription does not identify speakers.
    </label>
    <div className="border border-white/10 bg-white/[.025] p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono uppercase tracking-wide text-white/60">{speech.status.phase}</span>
        <button disabled={speech.status.phase === 'connecting'} className="border border-white/15 px-2 py-1 disabled:opacity-40"
          onClick={() => { void (speech.isConnected ? speech.disconnect() : speech.connect()).catch(() => {}); }}>
          {speech.status.phase === 'connecting' ? 'Loading model…' : speech.isConnected ? 'Disconnect' : 'Connect'}
        </button>
      </div>
      <p className="text-white/50">{options.engine !== 'local' ? `${transcription === 'gemini' ? 'Gemini live' : 'Chirp 3'} transcription + ${options.engine === 'gemini' ? 'Gemini' : 'Chirp 3 HD'} replies · ${project}` : 'Local Whisper transcription + Windows speech'}. Microphone starts only when you enable voice.</p>
      <p className="text-white/40">{options.engine !== 'local' ? 'Audio and reply text use this PC’s Google Cloud credentials and selected project billing. Desktop, phone and watch share these choices while connected to Ally.' : 'Microphone audio stays on this PC.'} Codex or Claude handles your request.</p>
      {speech.speechError && <p role="alert" className="text-red-300">{speech.speechError}</p>}
      <label className="block space-y-1"><span className="text-white/60">Speech engine · desktop, phone and watch</span>
        <select className="w-full bg-[#181818] border border-white/10 p-2" value={options.engine} onChange={event => { const engine = event.target.value as 'local' | 'google' | 'gemini'; setOptions({ ...options, engine }); if(engine !== 'local') setTranscription(engine); void window.pip.speech.saveSettings({ cloud: engine !== 'local', ...(engine !== 'local' ? { cloudProvider: engine, transcriptionProvider: engine } : {}) }); void speech.disconnect(); }}>
          <option value="local">Local · Windows installed voices</option><option value="google">Google Cloud · Chirp 3 HD</option><option value="gemini">Google Cloud · Gemini speech</option>
        </select>
      </label>
      {options.engine !== 'local' && <>
        <label className="block space-y-1"><span className="text-white/60">Google Cloud project</span><input aria-label="Google Cloud speech project" className="w-full bg-[#181818] border border-white/10 p-2" value={project} onChange={event => setProject(event.target.value)} onBlur={() => { void window.pip.speech.saveSettings({ project }); }} /></label>
        <label className="block space-y-1"><span className="text-white/60">Transcription</span><select aria-label="Transcription provider" className="w-full bg-[#181818] border border-white/10 p-2" value={transcription} onChange={event => { const provider = event.target.value as 'google' | 'gemini'; setTranscription(provider); void window.pip.speech.saveSettings({ transcriptionProvider: provider }); void speech.disconnect(); }}><option value="google">Chirp 3 · live words</option><option value="gemini">Gemini · live transcription</option></select></label>
        {transcription === 'gemini' && <label className="flex gap-2"><input type="checkbox" checked={smart} onChange={event => { setSmart(event.target.checked); void window.pip.speech.saveSettings({ geminiMode: event.target.checked ? 'SMART' : 'VERBATIM' }); }} />Clean up filler words and spoken corrections. Leave off for verbatim dictation.</label>}
      </>}
      {options.engine === 'gemini' && <>
        <label className="block space-y-1"><span className="text-white/60">Gemini voice</span><select aria-label="Gemini voice" className="w-full bg-[#181818] border border-white/10 p-2" value={geminiVoice} onChange={event => { setGeminiVoice(event.target.value); void window.pip.speech.saveSettings({ geminiVoice: event.target.value }); }}>{['Aoede','Kore','Puck','Charon','Fenrir','Leda','Orus','Zephyr'].map(name => <option key={name}>{name}</option>)}</select></label>
        <label className="block space-y-1"><span className="text-white/60">Speaking style</span><input aria-label="Gemini speaking style" className="w-full bg-[#181818] border border-white/10 p-2" maxLength={300} placeholder="Warm, natural, conversational" value={geminiStyle} onChange={event => setGeminiStyle(event.target.value)} onBlur={() => { void window.pip.speech.saveSettings({ geminiStyle }); }} /></label>
        <p className="text-white/40">Uses Gemini Flash TTS through Google Cloud. Windows or device speech remains the fallback if generation fails before playback.</p>
      </>}
      {options.engine === 'google' && <>
        <p className="text-white/50">Reply text is sent to Google Cloud Text-to-Speech using this PC’s credentials and quota project. Cloud usage is billed there. Windows voice is used if Google is unavailable.</p>
        <select aria-label="Google Cloud voice" className="w-full bg-[#181818] border border-white/10 p-2" disabled={cloudLoading} value={options.cloudVoice} onChange={event => { setOptions({ ...options, cloudVoice: event.target.value }); void window.pip.speech.saveSettings({ voice: event.target.value }); }}>
          {!cloudVoices.length && <option value="">{cloudLoading ? 'Loading available voices…' : 'No cloud voices available'}</option>}
          {cloudVoices.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </>}
      <label className="block space-y-1"><span className="text-white/60">{options.engine !== 'local' ? 'Local fallback voice' : 'Installed voice'}</span>
        <select className="w-full bg-[#181818] border border-white/10 p-2" value={options.voice} onChange={event => setOptions({ ...options, voice: event.target.value })}>
          <option value="">Windows default</option>{voices.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      {voiceError && <p className="text-red-300">{voiceError}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-white/60">{options.engine !== 'local' ? 'Fallback rate' : 'Rate'} {options.rate > 0 ? '+' : ''}{options.rate}
          <input className="w-full" type="range" min="-5" max="5" step="1" value={options.rate} onChange={event => setOptions({ ...options, rate: +event.target.value })} />
        </label>
        <label className="text-white/60">Volume {Math.round(options.volume * 100)}%
          <input className="w-full" type="range" min="0" max="1" step=".05" value={options.volume} onChange={event => setOptions({ ...options, volume: +event.target.value })} />
        </label>
      </div>
      <div className="flex gap-2">
        <button disabled={cloudLoading} className="border border-white/15 px-2 py-1 disabled:opacity-40" onClick={() => { void speech.synthesizeSpeech('Hello. Ally is ready when you are.'); }}>Test voice</button>
        <button className="border border-white/15 px-2 py-1" onClick={speech.stopCurrentSpeech}>Stop audio</button>
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={notifications} onChange={event => { setNotifications(event.target.checked); void window.pip.speech.saveSettings({ notifications: event.target.checked }); }} />Reply notifications when Ally is in the background</label>
    </div>
  </section>;
}
