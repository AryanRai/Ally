import { Mic, MicOff, Settings, Square, Volume2 } from 'lucide-react';
import { useSpeechService } from '../hooks/useSpeechService';

interface SpeechControlsProps {
  className?: string; onVoiceModeChange?: (enabled: boolean) => void;
  onDroidModeChange?: (enabled: boolean) => void; onSettingsOpen?: () => void;
  compact?: boolean; voiceModeEnabled?: boolean; droidModeEnabled?: boolean;
}

export function SpeechControls({ className = '', onVoiceModeChange, onSettingsOpen, compact = false }: SpeechControlsProps) {
  const speech = useSpeechService();
  const toggle = () => {
    if (onVoiceModeChange) onVoiceModeChange(!speech.voiceModeEnabled);
    else speech.setVoiceModeEnabled(!speech.voiceModeEnabled);
  };
  const labels: Record<string, string> = { offline: 'Voice off', connecting: 'Loading speech model…', ready: 'Voice ready', listening: 'Listening', transcribing: 'Transcribing…', speaking: 'Speaking', error: 'Voice needs attention' };
  return <div className={`space-y-2 ${className}`}>
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${speech.isListening ? 'bg-orange-300 animate-pulse' : speech.isConnected ? 'bg-white/60' : 'bg-white/20'}`} />
      <span className="text-xs text-white/60 flex-1">{labels[speech.status.phase]}</span>
      <button title={speech.voiceModeEnabled ? 'Turn microphone off' : 'Enable voice conversation'} onClick={toggle}
        disabled={speech.status.phase === 'connecting'} className="flex items-center gap-2 border border-white/15 px-2 py-1.5 text-xs disabled:opacity-40">
        {speech.voiceModeEnabled ? <MicOff size={14} /> : <Mic size={14} />}{!compact && (speech.voiceModeEnabled ? 'Voice off' : 'Voice on')}
      </button>
      <button title="Stop speaking" onClick={speech.stopCurrentSpeech} className="p-2 text-white/50 hover:text-white">{speech.isSpeaking ? <Square size={14} /> : <Volume2 size={14} />}</button>
      {onSettingsOpen && <button title="Voice settings" onClick={onSettingsOpen} className="p-2 text-white/50 hover:text-white"><Settings size={14} /></button>}
    </div>
    {speech.isListening && <div role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(speech.status.level * 100)} className="h-1 bg-white/5 overflow-hidden">
      <div className="h-full bg-gradient-to-r from-orange-300 to-pink-400 transition-[width] duration-100" style={{ width: `${speech.status.level * 100}%` }} />
    </div>}
    {speech.speechError && <p role="alert" className="text-xs text-red-300">{speech.speechError}</p>}
    {!compact && <p className="text-[10px] text-white/35">Speak, then pause to send · local transcription · speak over a reply to interrupt</p>}
  </div>;
}
