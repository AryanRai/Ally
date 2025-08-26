/**
 * React hook for speech service integration
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface SpeechStatus {
  connected: boolean;
  listening: boolean;
  device: string;
  modelsLoaded: boolean;
}

export interface SpeechRecognitionResult {
  text: string;
  confidence: number;
  timestamp: number;
}

export interface UseSpeechServiceReturn {
  // Status
  status: SpeechStatus;
  isConnected: boolean;
  isListening: boolean;
  
  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  synthesizeSpeech: (text: string) => Promise<void>;
  sendGGWave: (text: string) => Promise<void>;
  
  // Events
  lastRecognizedText: string | null;
  speechError: string | null;
  
  // Audio playback
  playGeneratedSpeech: (audioData: string) => Promise<void>;
  
  // Voice mode
  voiceModeEnabled: boolean;
  setVoiceModeEnabled: (enabled: boolean) => void;
  droidModeEnabled: boolean;
  setDroidModeEnabled: (enabled: boolean) => void;
  
  // Auto-speak responses
  speakResponse: (text: string) => Promise<void>;
}

export function useSpeechService(): UseSpeechServiceReturn {
  const [status, setStatus] = useState<SpeechStatus>({
    connected: false,
    listening: false,
    device: 'cpu',
    modelsLoaded: false
  });
  
  const [lastRecognizedText, setLastRecognizedText] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState<boolean>(false);
  const [droidModeEnabled, setDroidModeEnabled] = useState<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize audio context
  useEffect(() => {
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      audioContextRef.current = new AudioContext();
    }
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Setup event listeners
  useEffect(() => {
    if (!window.pip?.speech) return;

    const cleanupFunctions: (() => void)[] = [];

    // Connection events
    cleanupFunctions.push(
      window.pip.speech.onConnected(() => {
        setStatus(prev => ({ ...prev, connected: true }));
        setSpeechError(null);
        // Request status update
        window.pip.speech.getStatus();
      })
    );

    cleanupFunctions.push(
      window.pip.speech.onDisconnected(() => {
        setStatus(prev => ({ ...prev, connected: false, listening: false }));
      })
    );

    // Speech recognition events
    cleanupFunctions.push(
      window.pip.speech.onSpeechRecognized((result: SpeechRecognitionResult) => {
        setLastRecognizedText(result.text);
        setSpeechError(null);
      })
    );

    cleanupFunctions.push(
      window.pip.speech.onSpeechError((error: string) => {
        setSpeechError(error);
        console.error('Speech error:', error);
      })
    );

    // Listening state events
    cleanupFunctions.push(
      window.pip.speech.onListeningStarted(() => {
        setStatus(prev => ({ ...prev, listening: true }));
      })
    );

    cleanupFunctions.push(
      window.pip.speech.onListeningStopped(() => {
        setStatus(prev => ({ ...prev, listening: false }));
      })
    );

    // Status updates
    cleanupFunctions.push(
      window.pip.speech.onStatusUpdate((serviceStatus: any) => {
        setStatus(prev => ({
          ...prev,
          listening: serviceStatus.listening,
          device: serviceStatus.device,
          modelsLoaded: serviceStatus.models_loaded
        }));
      })
    );

    // Speech generation events
    cleanupFunctions.push(
      window.pip.speech.onSpeechGenerated((data: any) => {
        if (data.audio_data) {
          playGeneratedSpeech(data.audio_data).catch(error => {
            console.error('Error playing generated speech:', error);
          });
        }
      })
    );

    // GGWave events
    cleanupFunctions.push(
      window.pip.speech.onGGWaveSent((data: any) => {
        console.log('GGWave sent:', data);
      })
    );

    cleanupFunctions.push(
      window.pip.speech.onGGWaveError((error: string) => {
        console.error('GGWave error:', error);
        setSpeechError(`GGWave error: ${error}`);
      })
    );

    // Cleanup function
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, []);

  // Check initial connection status
  useEffect(() => {
    if (window.pip?.speech) {
      window.pip.speech.isConnected().then((connected: boolean) => {
        setStatus(prev => ({ ...prev, connected }));
        if (connected) {
          window.pip.speech.getStatus();
        }
      });
    }
  }, []);

  // Action functions
  const connect = useCallback(async () => {
    if (!window.pip?.speech) {
      throw new Error('Speech service not available');
    }
    
    const result = await window.pip.speech.connect();
    if (!result.success) {
      throw new Error(result.error || 'Failed to connect to speech service');
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!window.pip?.speech) return;
    
    const result = await window.pip.speech.disconnect();
    if (!result.success) {
      throw new Error(result.error || 'Failed to disconnect from speech service');
    }
  }, []);

  const startListening = useCallback(async () => {
    if (!window.pip?.speech) {
      throw new Error('Speech service not available');
    }
    
    const result = await window.pip.speech.startListening();
    if (!result.success) {
      throw new Error(result.error || 'Failed to start listening');
    }
  }, []);

  const stopListening = useCallback(async () => {
    if (!window.pip?.speech) {
      throw new Error('Speech service not available');
    }
    
    const result = await window.pip.speech.stopListening();
    if (!result.success) {
      throw new Error(result.error || 'Failed to stop listening');
    }
  }, []);

  const synthesizeSpeech = useCallback(async (text: string) => {
    if (!window.pip?.speech) {
      throw new Error('Speech service not available');
    }
    
    const result = await window.pip.speech.synthesize(text);
    if (!result.success) {
      throw new Error(result.error || 'Failed to synthesize speech');
    }
  }, []);

  const sendGGWave = useCallback(async (text: string) => {
    if (!window.pip?.speech) {
      throw new Error('Speech service not available');
    }
    
    const result = await window.pip.speech.sendGGWave(text);
    if (!result.success) {
      throw new Error(result.error || 'Failed to send GGWave');
    }
  }, []);

  const playGeneratedSpeech = useCallback(async (audioData: string) => {
    if (!audioContextRef.current) {
      throw new Error('Audio context not available');
    }

    try {
      // Decode base64 audio data
      const binaryString = atob(audioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode audio buffer
      const audioBuffer = await audioContextRef.current.decodeAudioData(bytes.buffer);
      
      // Create and play audio source
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();

    } catch (error) {
      console.error('Error playing audio:', error);
      throw error;
    }
  }, []);

  const speakResponse = useCallback(async (text: string) => {
    if (!voiceModeEnabled || !window.pip?.speech) {
      return;
    }

    try {
      if (droidModeEnabled) {
        // Use ggwave for droid communication
        await sendGGWave(text);
      } else {
        // Use TTS for normal speech
        await synthesizeSpeech(text);
      }
    } catch (error) {
      console.error('Error speaking response:', error);
      setSpeechError(`Failed to speak response: ${error}`);
    }
  }, [voiceModeEnabled, droidModeEnabled, sendGGWave, synthesizeSpeech]);

  return {
    // Status
    status,
    isConnected: status.connected,
    isListening: status.listening,
    
    // Actions
    connect,
    disconnect,
    startListening,
    stopListening,
    synthesizeSpeech,
    sendGGWave,
    
    // Events
    lastRecognizedText,
    speechError,
    
    // Audio playback
    playGeneratedSpeech,
    
    // Voice mode
    voiceModeEnabled,
    setVoiceModeEnabled,
    droidModeEnabled,
    setDroidModeEnabled,
    
    // Auto-speak responses
    speakResponse
  };
}