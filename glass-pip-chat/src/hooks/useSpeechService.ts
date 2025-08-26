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
  synthesizeSpeechStreaming: (text: string) => Promise<void>;
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
  speakResponseStreaming: (text: string) => Promise<void>;
  
  // Interruption control
  stopCurrentSpeech: () => void;
  interruptAndSpeak: (newText: string) => Promise<void>;
  resetTTSQueue: () => void;
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
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentStreamIdRef = useRef<string | null>(null);
  const pendingChunksRef = useRef<Map<string, string[]>>(new Map());

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

    // Streaming TTS events
    cleanupFunctions.push(
      window.pip.speech.onTTSStreamStart((data: any) => {
        console.log('🎵 TTS streaming started:', data.message_id);
        const messageId = data.message_id || 'default';
        
        // Check if we have a stale current stream that's not actually playing
        const hasStaleStream = currentStreamIdRef.current && 
                              !isPlayingRef.current && 
                              audioQueueRef.current.length === 0;
        
        // If this is a new stream and we're not currently playing, or we have a stale stream, start it
        if (!currentStreamIdRef.current || hasStaleStream) {
          if (hasStaleStream) {
            console.log('🧹 Clearing stale TTS stream:', currentStreamIdRef.current);
          }
          currentStreamIdRef.current = messageId;
          audioQueueRef.current = [];
          isPlayingRef.current = false;
          console.log('🎯 Starting new TTS stream:', messageId);
        } else {
          // Queue this stream for later
          pendingChunksRef.current.set(messageId, []);
          console.log('📝 Queuing TTS stream:', messageId, '(current stream:', currentStreamIdRef.current, ')');
        }
      })
    );

    cleanupFunctions.push(
      window.pip.speech.onTTSStreamChunk((data: any) => {
        const messageId = data.message_id || 'default';
        console.log('📦 TTS chunk received:', messageId, data.chunk_index, '/', data.total_chunks);
        
        if (data.audio_data) {
          // If this chunk belongs to the current stream, add to active queue
          if (currentStreamIdRef.current === messageId) {
            audioQueueRef.current.push(data.audio_data);
            // Start playing if not already playing
            if (!isPlayingRef.current) {
              playNextAudioChunk();
            }
          } else {
            // Otherwise, store in pending chunks
            const chunks = pendingChunksRef.current.get(messageId) || [];
            chunks.push(data.audio_data);
            pendingChunksRef.current.set(messageId, chunks);
            console.log('📋 Stored chunk for queued stream:', messageId);
          }
        }
      })
    );

    cleanupFunctions.push(
      window.pip.speech.onTTSStreamComplete((data: any) => {
        const messageId = data.message_id || 'default';
        console.log('✅ TTS streaming completed:', messageId);
        
        // If this was the current stream, prepare to start next
        if (currentStreamIdRef.current === messageId) {
          // Wait for current audio to finish, then start next stream
          const checkAndStartNext = () => {
            if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
              startNextPendingStream();
            } else {
              setTimeout(checkAndStartNext, 100);
            }
          };
          setTimeout(checkAndStartNext, 100);
        }
      })
    );

    cleanupFunctions.push(
      window.pip.speech.onTTSStreamError((error: string) => {
        console.error('❌ TTS streaming error:', error);
        setSpeechError(`TTS streaming error: ${error}`);
        
        // Clear current stream and start next
        currentStreamIdRef.current = null;
        audioQueueRef.current = [];
        isPlayingRef.current = false;
        startNextPendingStream();
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

  const synthesizeSpeechStreaming = useCallback(async (text: string) => {
    if (!window.pip?.speech) {
      throw new Error('Speech service not available');
    }
    
    console.log('🎤 Requesting streaming TTS for:', text.substring(0, 50) + '...', {
      currentStream: currentStreamIdRef.current,
      isPlaying: isPlayingRef.current,
      queueLength: audioQueueRef.current.length,
      pendingStreams: pendingChunksRef.current.size
    });
    
    const result = await window.pip.speech.synthesizeStreaming(text);
    if (!result.success) {
      throw new Error(result.error || 'Failed to synthesize streaming speech');
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
      
      // Store reference for interruption
      currentAudioSourceRef.current = source;
      
      return new Promise<void>((resolve, reject) => {
        source.onended = () => {
          currentAudioSourceRef.current = null;
          resolve();
        };
        source.onerror = (error) => {
          currentAudioSourceRef.current = null;
          reject(error);
        };
        source.start();
      });

    } catch (error) {
      console.error('Error playing audio:', error);
      throw error;
    }
  }, []);

  const startNextPendingStream = useCallback(() => {
    // Find the next pending stream
    const pendingStreams = Array.from(pendingChunksRef.current.entries());
    if (pendingStreams.length > 0) {
      const [nextMessageId, chunks] = pendingStreams[0];
      
      console.log('🎯 Starting next pending TTS stream:', nextMessageId, 'with', chunks.length, 'chunks');
      
      // Set as current stream
      currentStreamIdRef.current = nextMessageId;
      audioQueueRef.current = [...chunks];
      
      // Remove from pending
      pendingChunksRef.current.delete(nextMessageId);
      
      // Start playing
      if (!isPlayingRef.current && audioQueueRef.current.length > 0) {
        playNextAudioChunk();
      }
    } else {
      currentStreamIdRef.current = null;
      console.log('🏁 No more pending TTS streams');
    }
  }, []);

  const playNextAudioChunk = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    isPlayingRef.current = true;
    
    try {
      // Play one chunk at a time, waiting for completion
      const audioData = audioQueueRef.current.shift();
      if (audioData) {
        await playGeneratedSpeech(audioData);
        // Small delay between chunks for natural speech flow
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('Error playing audio chunk:', error);
    } finally {
      isPlayingRef.current = false;
      
      // Continue playing next chunk if available
      if (audioQueueRef.current.length > 0) {
        setTimeout(() => playNextAudioChunk(), 50);
      } else if (currentStreamIdRef.current) {
        // Current stream finished, start next pending stream
        console.log('🎵 Current stream finished, checking for next...');
        setTimeout(() => startNextPendingStream(), 100);
      }
    }
  }, [playGeneratedSpeech, startNextPendingStream]);

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

  const speakResponseStreaming = useCallback(async (text: string) => {
    if (!voiceModeEnabled || !window.pip?.speech) {
      return;
    }

    try {
      if (droidModeEnabled) {
        // Use ggwave for droid communication (no streaming support)
        await sendGGWave(text);
      } else {
        // Use streaming TTS for normal speech
        await synthesizeSpeechStreaming(text);
      }
    } catch (error) {
      console.error('Error speaking response with streaming:', error);
      setSpeechError(`Failed to speak response with streaming: ${error}`);
    }
  }, [voiceModeEnabled, droidModeEnabled, sendGGWave, synthesizeSpeechStreaming]);

  const stopCurrentSpeech = useCallback(() => {
    console.log('🔇 Stopping current speech and clearing all queues');
    
    // Stop current audio playback
    if (currentAudioSourceRef.current) {
      try {
        currentAudioSourceRef.current.stop();
        currentAudioSourceRef.current = null;
        console.log('🛑 Stopped current audio source');
      } catch (error) {
        console.error('Error stopping current audio:', error);
      }
    }

    // Clear all queues and reset state
    const hadPendingStreams = pendingChunksRef.current.size > 0;
    const hadQueuedAudio = audioQueueRef.current.length > 0;
    const hadCurrentStream = currentStreamIdRef.current !== null;
    
    audioQueueRef.current = [];
    pendingChunksRef.current.clear();
    currentStreamIdRef.current = null;
    isPlayingRef.current = false;

    // Also tell the speech service to clear its queue
    if (window.pip?.speech) {
      window.pip.speech.clearTTSQueue?.();
    }

    console.log('🧹 Speech state cleared:', {
      hadCurrentStream,
      hadQueuedAudio,
      hadPendingStreams: hadPendingStreams
    });
  }, []);

  const interruptAndSpeak = useCallback(async (newText: string) => {
    // Stop current speech
    stopCurrentSpeech();

    // Start new speech after a brief delay
    setTimeout(async () => {
      try {
        if (droidModeEnabled) {
          await sendGGWave(newText);
        } else {
          await synthesizeSpeechStreaming(newText);
        }
      } catch (error) {
        console.error('Error in interrupt and speak:', error);
      }
    }, 100);
  }, [stopCurrentSpeech, droidModeEnabled, sendGGWave, synthesizeSpeechStreaming]);

  const resetTTSQueue = useCallback(() => {
    console.log('🔄 Resetting TTS queue for new conversation');
    stopCurrentSpeech();
  }, [stopCurrentSpeech]);

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
    synthesizeSpeechStreaming,
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
    speakResponse,
    speakResponseStreaming,
    
    // Interruption control
    stopCurrentSpeech,
    interruptAndSpeak,
    resetTTSQueue
  };
}