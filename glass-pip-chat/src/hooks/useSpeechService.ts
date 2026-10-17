import { useSyncExternalStore } from 'react';
import { voice } from '../lib/voice';
export type { SpeechStatus } from '../lib/voice';

/** A single capture/playback owner, shared by the shell, controls and settings. */
export function useSpeechService() {
  const state = useSyncExternalStore(voice.subscribe, voice.getSnapshot);
  return { ...voice, ...state, isConnected: state.status.connected, isListening: state.status.listening, interimTranscript: null };
}
