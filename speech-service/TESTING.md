# Speech Service Testing Guide

## Quick Setup & Testing

### 1. Test Dependencies
```bash
cd Ally/speech-service
python quick_test.py
```

This will check if all required packages are installed and test TTS functionality.

### 2. Start Speech Service
```bash
python start_service.py
```

You should see:
- ✅ Models loading (Whisper and TTS)
- ✅ WebSocket server starting on port 8765
- ✅ "Speech service ready" message

### 3. Test TTS Only
```bash
python test_tts.py
```

This tests the TTS functionality via WebSocket.

### 4. Start Glass Chat App
```bash
cd ../glass-pip-chat
npm run dev
```

## Testing Voice Mode

1. **Open Glass Chat** - The app should start in development mode
2. **Show Speech Controls** - Click the microphone button in the header (or press Ctrl+Shift+V)
3. **Connect to Speech Service** - Click the "Connect" button (should auto-connect)
4. **Enable Voice Mode** - Click the "Voice Mode OFF" button to turn it ON
5. **Start Listening** - Click the "Start Listening" button
6. **Speak** - Say something like "Hello, how are you?"
7. **Check Results**:
   - Your speech should appear as a chat message
   - AI should respond
   - AI response should be spoken back via TTS

## Troubleshooting

### Speech Service Won't Start
- Check if port 8765 is available: `netstat -an | grep 8765`
- Install missing dependencies: `pip install whisper TTS torch pyaudio websockets ggwave webrtcvad`

### TTS Not Working
- Check console for "TTS model loaded successfully"
- Try different TTS model: `export TTS_MODEL=tts_models/en/ljspeech/tacotron2-DDC`
- Check if audio device is available

### Speech Recognition Not Working
- Check microphone permissions
- Verify WebSocket connection in browser console
- Check if Whisper model downloaded correctly

### Voice Mode Greyed Out
- Ensure speech service is connected (green dot)
- Check browser console for connection errors
- Restart speech service if needed

## Debug Mode

Add these environment variables for more verbose logging:
```bash
export WHISPER_MODEL=base
export TTS_MODEL=tts_models/en/jenny/jenny
export WEBSOCKET_PORT=8765
export DEBUG=1
```

## Expected Behavior

When working correctly:
1. **Speech Recognition**: Spoken words → Chat message
2. **AI Processing**: Chat message → AI response
3. **TTS Output**: AI response → Spoken audio
4. **Droid Mode**: AI response → ggwave audio signals

## Common Issues

- **"Maximum update depth exceeded"**: Fixed in latest version
- **"streamChatWithThinking is not a function"**: Fixed in latest version  
- **TTS model loading slowly**: First run downloads models, be patient
- **Audio not playing**: Check browser audio permissions and system volume