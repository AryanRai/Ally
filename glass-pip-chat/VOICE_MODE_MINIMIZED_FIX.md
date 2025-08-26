# Voice Mode in Minimized Mode Fix

## Issue
When the voice mode button was enabled in minimized/collapsed mode, it only toggled the visual state but didn't actually:
1. Start speech recognition (listening for voice input)
2. Send recognized speech as messages to the LLM
3. Provide TTS responses

The voice mode worked correctly in maximized mode but not in minimized mode.

## Root Cause
The voice mode toggle in minimized mode was only calling `setVoiceModeEnabled()` but wasn't:
- Starting the speech recognition service
- Connecting the speech recognition results to the message sending system
- Auto-connecting to the speech service when needed

## Solution Implemented

### 1. **Automatic Speech Recognition Start/Stop**
Added an effect that automatically starts/stops speech recognition when voice mode is toggled:

```typescript
// Handle voice mode changes - start/stop listening automatically
useEffect(() => {
  const handleVoiceModeChange = async () => {
    if (!speechService.isConnected) {
      console.log('Speech service not connected, cannot change voice mode');
      return;
    }

    if (voiceModeEnabled) {
      console.log('🎤 Voice mode enabled - starting speech recognition');
      try {
        if (!speechService.isListening) {
          await speechService.startListening();
        }
      } catch (error) {
        console.error('Failed to start listening:', error);
      }
    } else {
      console.log('🔇 Voice mode disabled - stopping speech recognition');
      try {
        if (speechService.isListening) {
          await speechService.stopListening();
        }
      } catch (error) {
        console.error('Failed to stop listening:', error);
      }
    }
  };

  handleVoiceModeChange();
}, [voiceModeEnabled, speechService.isConnected, speechService.isListening]);
```

### 2. **Automatic Speech Recognition Processing**
Added an effect that automatically processes speech recognition results and sends them as messages:

```typescript
// Handle speech recognition results - automatically send as messages when voice mode is enabled
const lastProcessedSpeechRef = useRef<string | null>(null);
useEffect(() => {
  if (speechService.lastRecognizedText && 
      voiceModeEnabled && 
      speechService.lastRecognizedText !== lastProcessedSpeechRef.current) {
    
    console.log('🎤 Processing speech recognition result:', speechService.lastRecognizedText);
    lastProcessedSpeechRef.current = speechService.lastRecognizedText;
    handleSpeechRecognized(speechService.lastRecognizedText);
  }
}, [speechService.lastRecognizedText, voiceModeEnabled]);
```

### 3. **Auto-Connection to Speech Service**
Enhanced the voice mode toggle to automatically connect to the speech service if not already connected:

```typescript
onVoiceModeToggle={async () => {
  const newVoiceMode = !voiceModeEnabled;
  
  // If enabling voice mode and not connected, try to connect first
  if (newVoiceMode && !speechService.isConnected) {
    console.log('🔌 Connecting to speech service...');
    try {
      await speechService.connect();
    } catch (error) {
      console.error('Failed to connect to speech service:', error);
      return; // Don't enable voice mode if connection failed
    }
  }
  
  setVoiceModeEnabled(newVoiceMode);
}}
```

### 4. **Auto-Connect on App Start**
Added automatic connection attempt when the app starts:

```typescript
// Auto-connect to speech service on mount
useEffect(() => {
  const autoConnectSpeech = async () => {
    if (!speechService.isConnected && window.pip?.speech) {
      console.log('🔌 Auto-connecting to speech service on mount...');
      try {
        await speechService.connect();
        console.log('✅ Speech service auto-connected successfully');
      } catch (error) {
        console.log('⚠️ Speech service auto-connect failed (this is normal if service is not running):', error);
      }
    }
  };

  const timer = setTimeout(autoConnectSpeech, 1000);
  return () => clearTimeout(timer);
}, [speechService.connect, speechService.isConnected]);
```

### 5. **Consistent Voice Mode Handling**
Updated both collapsed and expanded mode voice toggles to use the same connection logic.

## How It Works Now

### In Minimized Mode:
1. **Click Voice Toggle**: 
   - Automatically connects to speech service if not connected
   - Enables voice mode and starts speech recognition
   - Visual indicator shows voice mode is active

2. **Speak into Microphone**:
   - Speech is recognized by the service
   - Recognized text is automatically sent as a message to the LLM
   - LLM response is played back via TTS (if streaming TTS enabled)

3. **Click Voice Toggle Again**:
   - Disables voice mode and stops speech recognition
   - Visual indicator shows voice mode is inactive

### In Maximized Mode:
- Same functionality as minimized mode
- Additional speech controls panel available for advanced settings

## Testing the Fix

### Prerequisites:
1. Speech service must be running (`python speech_service.py`)
2. Microphone permissions granted in browser

### Test Steps:
1. **Start the app** - should auto-connect to speech service
2. **Minimize the chat window** (collapse to minimized mode)
3. **Click the voice toggle button** (speaker icon)
   - Button should turn purple indicating voice mode is ON
   - Console should show: "🎤 Voice mode enabled - starting speech recognition"
4. **Speak into microphone** (e.g., "Hello, how are you?")
   - Console should show: "🎤 Processing speech recognition result: Hello, how are you?"
   - Message should appear in chat
   - LLM should respond
   - Response should be played via TTS
5. **Click voice toggle again** to disable
   - Button should turn gray
   - Speech recognition should stop

## Debug Information

The fix includes comprehensive logging to help debug issues:
- Connection status logging
- Voice mode state changes
- Speech recognition start/stop
- Speech recognition results processing
- Auto-connection attempts

Check browser console for detailed logs when testing.

## Benefits

1. **Consistent Behavior**: Voice mode works the same in both minimized and maximized modes
2. **Automatic Operation**: No manual connection or setup required
3. **Seamless Experience**: Just click the voice button and start talking
4. **Error Handling**: Graceful handling of connection failures
5. **Visual Feedback**: Clear indicators of voice mode status
6. **Full Integration**: Speech recognition → Message sending → LLM response → TTS playback

## Files Modified

- `src/components/GlassChatPiP.tsx`: Main voice mode integration logic
- `src/components/chat/CollapsedHeader.tsx`: Voice toggle button (already had right-click for settings)
- Enhanced logging and error handling throughout