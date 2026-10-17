import { useEffect, useState } from 'react';
import { useSpeechService } from '../../hooks/useSpeechService';

export default function SpeechSettingsSection() {
  const speech = useSpeechService();
  const [voices, setVoices] = useState<string[]>([]);
  const [voiceError, setVoiceError] = useState('');
  const [cloudVoices, setCloudVoices] = useState<string[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [options, setOptions] = useState<{ voice: string; rate: number; volume: number; engine: 'local' | 'google'; cloudVoice: string }>(() => {
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
    <div className="border border-white/10 bg-white/[.025] p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono uppercase tracking-wide text-white/60">{speech.status.phase}</span>
        <button disabled={speech.status.phase === 'connecting'} className="border border-white/15 px-2 py-1 disabled:opacity-40"
          onClick={() => { void (speech.isConnected ? speech.disconnect() : speech.connect()).catch(() => {}); }}>
          {speech.status.phase === 'connecting' ? 'Loading model…' : speech.isConnected ? 'Disconnect' : 'Connect'}
        </button>
      </div>
      <p className="text-white/50">Local transcription · {speech.status.model || 'Whisper'} · speech detection. Microphone starts only when you enable voice.</p>
      <p className="text-white/40">Microphone audio stays on this PC. Codex or Claude handles your request.</p>
      {speech.speechError && <p role="alert" className="text-red-300">{speech.speechError}</p>}
      <label className="block space-y-1"><span className="text-white/60">Reply voice engine</span>
        <select className="w-full bg-[#181818] border border-white/10 p-2" value={options.engine} onChange={event => setOptions({ ...options, engine: event.target.value as 'local' | 'google' })}>
          <option value="local">Local · Windows installed voices</option><option value="google">Google Cloud · Chirp 3 HD</option>
        </select>
      </label>
      {options.engine === 'google' && <>
        <p className="text-white/50">Reply text is sent to Google Cloud Text-to-Speech using this PC’s credentials and quota project. Cloud usage is billed there. Windows voice is used if Google is unavailable.</p>
        <select aria-label="Google Cloud voice" className="w-full bg-[#181818] border border-white/10 p-2" disabled={cloudLoading} value={options.cloudVoice} onChange={event => setOptions({ ...options, cloudVoice: event.target.value })}>
          {!cloudVoices.length && <option value="">{cloudLoading ? 'Loading available voices…' : 'No cloud voices available'}</option>}
          {cloudVoices.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </>}
      <label className="block space-y-1"><span className="text-white/60">{options.engine === 'google' ? 'Local fallback voice' : 'Installed voice'}</span>
        <select className="w-full bg-[#181818] border border-white/10 p-2" value={options.voice} onChange={event => setOptions({ ...options, voice: event.target.value })}>
          <option value="">Windows default</option>{voices.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      {voiceError && <p className="text-red-300">{voiceError}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-white/60">{options.engine === 'google' ? 'Fallback rate' : 'Rate'} {options.rate > 0 ? '+' : ''}{options.rate}
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
    </div>
  </section>;
}
