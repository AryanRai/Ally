/**
 * Speech Controls Component
 * Provides UI controls for speech recognition, synthesis, and ggwave
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Radio,
  Wifi,
  WifiOff,
  Settings,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { useSpeechService } from '../hooks/useSpeechService';

interface SpeechControlsProps {
  className?: string;
  onSpeechRecognized?: (text: string) => void;
  onVoiceModeChange?: (enabled: boolean) => void;
  onDroidModeChange?: (enabled: boolean) => void;
  onSettingsOpen?: () => void;
  compact?: boolean;
  voiceModeEnabled?: boolean;
  droidModeEnabled?: boolean;
}

export function SpeechControls({ 
  className = '', 
  onSpeechRecognized,
  onVoiceModeChange,
  onDroidModeChange,
  onSettingsOpen,
  compact = false,
  voiceModeEnabled = false,
  droidModeEnabled = false
}: SpeechControlsProps) {
  const {
    status,
    isConnected,
    isListening,
    connect,
    disconnect,
    startListening,
    stopListening,
    synthesizeSpeech,
    sendGGWave,
    lastRecognizedText,
    speechError
  } = useSpeechService();


  const [isConnecting, setIsConnecting] = useState(false);
  const hasTriedConnect = useRef(false);

  // Handle speech recognition results
  const lastProcessedText = useRef<string | null>(null);
  useEffect(() => {
    if (lastRecognizedText && lastRecognizedText !== lastProcessedText.current && onSpeechRecognized) {
      lastProcessedText.current = lastRecognizedText;
      onSpeechRecognized(lastRecognizedText);
    }
  }, [lastRecognizedText, onSpeechRecognized]);

  // Auto-connect on mount
  useEffect(() => {
    if (!isConnected && !isConnecting && !hasTriedConnect.current) {
      hasTriedConnect.current = true;
      handleConnect();
    }
  }, [isConnected, isConnecting]);

  const handleConnect = async () => {
    if (isConnecting) return;
    
    setIsConnecting(true);
    try {
      await connect();
    } catch (error) {
      console.error('Failed to connect to speech service:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error) {
      console.error('Failed to disconnect from speech service:', error);
    }
  };

  const handleToggleListening = async () => {
    try {
      if (isListening) {
        await stopListening();
      } else {
        await startListening();
      }
    } catch (error) {
      console.error('Failed to toggle listening:', error);
    }
  };



  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Connection Status */}
        <motion.button
          onClick={isConnected ? handleDisconnect : handleConnect}
          disabled={isConnecting}
          className={`p-2 rounded-lg transition-colors ${
            isConnected 
              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title={isConnected ? 'Disconnect from speech service' : 'Connect to speech service'}
        >
          {isConnecting ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <Wifi className="w-4 h-4" />
            </motion.div>
          ) : isConnected ? (
            <Wifi className="w-4 h-4" />
          ) : (
            <WifiOff className="w-4 h-4" />
          )}
        </motion.button>

        {/* Voice Mode Toggle */}
        <motion.button
          onClick={() => onVoiceModeChange?.(!voiceModeEnabled)}
          disabled={!isConnected}
          className={`p-2 rounded-lg transition-colors ${
            voiceModeEnabled
              ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
          } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
          whileHover={isConnected ? { scale: 1.05 } : {}}
          whileTap={isConnected ? { scale: 0.95 } : {}}
          title={`Voice mode: ${voiceModeEnabled ? 'ON' : 'OFF'} - ${!isConnected ? 'Connect first' : 'Click to toggle'}`}
        >
          {voiceModeEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </motion.button>

        {/* Listening Toggle */}
        <motion.button
          onClick={handleToggleListening}
          disabled={!isConnected || !voiceModeEnabled}
          className={`p-2 rounded-lg transition-colors ${
            isListening
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
          } ${(!isConnected || !voiceModeEnabled) ? 'opacity-50 cursor-not-allowed' : ''}`}
          whileHover={(isConnected && voiceModeEnabled) ? { scale: 1.05 } : {}}
          whileTap={(isConnected && voiceModeEnabled) ? { scale: 0.95 } : {}}
          title={isListening ? 'Stop listening' : 'Start listening'}
        >
          {isListening ? (
            <MicOff className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </motion.button>

        {/* Droid Mode Toggle */}
        <motion.button
          onClick={() => onDroidModeChange?.(!droidModeEnabled)}
          disabled={!isConnected || !voiceModeEnabled}
          className={`p-2 rounded-lg transition-colors ${
            droidModeEnabled
              ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
              : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
          } ${(!isConnected || !voiceModeEnabled) ? 'opacity-50 cursor-not-allowed' : ''}`}
          whileHover={(isConnected && voiceModeEnabled) ? { scale: 1.05 } : {}}
          whileTap={(isConnected && voiceModeEnabled) ? { scale: 0.95 } : {}}
          title={droidModeEnabled ? 'Switch to TTS mode' : 'Switch to droid mode (ggwave)'}
        >
          <Radio className="w-4 h-4" />
        </motion.button>

        {/* Settings */}
        {onSettingsOpen && (
          <motion.button
            onClick={onSettingsOpen}
            className="p-2 rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Open main settings"
          >
            <Settings className="w-4 h-4" />
          </motion.button>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Status Bar */}
      <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            isConnected ? 'bg-green-400' : 'bg-red-400'
          }`} />
          <span className="text-sm text-white/80">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          {status.device && (
            <span className="text-xs text-white/60 bg-white/10 px-2 py-1 rounded">
              {status.device.toUpperCase()}
            </span>
          )}
        </div>
        
        {speechError && (
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs">{speechError}</span>
          </div>
        )}
      </div>

      {/* Main Controls */}
      <div className="grid grid-cols-2 gap-3">
        {/* Connection Control */}
        <motion.button
          onClick={isConnected ? handleDisconnect : handleConnect}
          disabled={isConnecting}
          className={`p-4 rounded-lg transition-colors flex flex-col items-center gap-2 ${
            isConnected 
              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isConnecting ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <Wifi className="w-6 h-6" />
            </motion.div>
          ) : isConnected ? (
            <Wifi className="w-6 h-6" />
          ) : (
            <WifiOff className="w-6 h-6" />
          )}
          <span className="text-sm">
            {isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}
          </span>
        </motion.button>

        {/* Voice Mode Control */}
        <motion.button
          onClick={() => onVoiceModeChange?.(!voiceModeEnabled)}
          disabled={!isConnected}
          className={`p-4 rounded-lg transition-colors flex flex-col items-center gap-2 ${
            voiceModeEnabled
              ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
          } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
          whileHover={isConnected ? { scale: 1.02 } : {}}
          whileTap={isConnected ? { scale: 0.98 } : {}}
        >
          <Volume2 className="w-6 h-6" />
          <span className="text-sm">
            {voiceModeEnabled ? 'Voice Mode ON' : 'Voice Mode OFF'}
          </span>
        </motion.button>

        {/* Listening Control */}
        <motion.button
          onClick={handleToggleListening}
          disabled={!isConnected || !voiceModeEnabled}
          className={`p-4 rounded-lg transition-colors flex flex-col items-center gap-2 ${
            isListening
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
          } ${(!isConnected || !voiceModeEnabled) ? 'opacity-50 cursor-not-allowed' : ''}`}
          whileHover={(isConnected && voiceModeEnabled) ? { scale: 1.02 } : {}}
          whileTap={(isConnected && voiceModeEnabled) ? { scale: 0.98 } : {}}
        >
          {isListening ? (
            <>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <MicOff className="w-6 h-6" />
              </motion.div>
              <span className="text-sm">Stop Listening</span>
            </>
          ) : (
            <>
              <Mic className="w-6 h-6" />
              <span className="text-sm">Start Listening</span>
            </>
          )}
        </motion.button>

        {/* Droid Mode Control */}
        <motion.button
          onClick={() => onDroidModeChange?.(!droidModeEnabled)}
          disabled={!isConnected || !voiceModeEnabled}
          className={`p-4 rounded-lg transition-colors flex flex-col items-center gap-2 ${
            droidModeEnabled
              ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
              : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
          } ${(!isConnected || !voiceModeEnabled) ? 'opacity-50 cursor-not-allowed' : ''}`}
          whileHover={(isConnected && voiceModeEnabled) ? { scale: 1.02 } : {}}
          whileTap={(isConnected && voiceModeEnabled) ? { scale: 0.98 } : {}}
        >
          <Radio className="w-6 h-6" />
          <span className="text-sm">
            {droidModeEnabled ? 'Droid Mode' : 'TTS Mode'}
          </span>
        </motion.button>
      </div>



      {/* Last Recognized Text */}
      {lastRecognizedText && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-2 bg-green-500/20 rounded-lg backdrop-blur-sm border border-green-500/30 max-h-20 overflow-hidden"
        >
          <div className="flex items-start gap-2">
            <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-green-400 font-medium">Recognized:</p>
              <p className="text-xs text-white/80 break-words overflow-hidden" style={{ 
                display: '-webkit-box', 
                WebkitLineClamp: 2, 
                WebkitBoxOrient: 'vertical' 
              }}>{lastRecognizedText}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Settings Link */}
      {onSettingsOpen && (
        <motion.button
          onClick={onSettingsOpen}
          className="w-full p-2 rounded-lg bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 transition-colors flex items-center justify-center gap-2"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Settings className="w-4 h-4" />
          <span className="text-sm">Open Settings</span>
        </motion.button>
      )}
    </div>
  );
}