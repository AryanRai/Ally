# Voice Mode Improvements Test Guide

## Quick Test Checklist

### 1. Voice Mode in Collapsed Mode
- [ ] Start the application
- [ ] Collapse the chat window (minimize)
- [ ] Look for the voice mode toggle button (speaker icon)
- [ ] Click the voice mode toggle
- [ ] Verify the button changes color and shows status indicator
- [ ] If speech service is not connected, button should be disabled
- [ ] Test speech recognition (speak into microphone)
- [ ] Verify TTS responses play when AI responds

### 2. Speech Settings Modal
- [ ] Press `Ctrl+Shift+P` to open speech settings
- [ ] Verify modal opens with tabbed interface
- [ ] Test each tab:
  - **Connection**: Try connecting/disconnecting
  - **Voice**: Change voice settings and test TTS
  - **Recognition**: Adjust language settings
  - **Advanced**: Toggle streaming TTS and GGWave options
- [ ] Verify settings are saved when closing modal
- [ ] Reopen modal and verify settings persisted

### 3. Voice Mode in Expanded Mode
- [ ] Expand the chat window
- [ ] Open speech controls panel
- [ ] Click settings button in speech controls
- [ ] Verify speech settings modal opens
- [ ] Test voice mode toggle in expanded mode
- [ ] Verify consistency between collapsed and expanded modes

### 4. Integration Testing
- [ ] Enable voice mode
- [ ] Start a conversation by speaking
- [ ] Verify AI response is spoken back via TTS
- [ ] Test interruption by speaking while AI is responding
- [ ] Verify streaming TTS works (responses start playing before complete)

## Expected Behavior

### Voice Mode Toggle
- **Disabled State**: Gray icon, no status dot, disabled when service disconnected
- **Enabled State**: Purple icon, purple status dot, speech recognition active
- **Connection Required**: Button disabled until speech service connects

### Speech Settings Modal
- **Tabs**: Connection, Voice, Recognition, Advanced
- **Connection Tab**: Host/port settings, connect/disconnect buttons, auto-reconnect toggle
- **Voice Tab**: Voice selection, speed/pitch/volume sliders, test buttons
- **Recognition Tab**: Language selection, continuous recognition options
- **Advanced Tab**: Streaming TTS, GGWave settings, chunk size

### Keyboard Shortcuts
- `Ctrl+Shift+P`: Open speech settings modal
- `Ctrl+Shift+V`: Toggle speech controls panel (existing)

## Troubleshooting

### Voice Mode Not Working
1. Check if speech service is connected (green dot in header)
2. Open speech settings and try reconnecting
3. Verify WebSocket host/port settings
4. Check browser permissions for microphone access

### Settings Not Persisting
1. Check browser localStorage permissions
2. Try clearing localStorage and reconfiguring
3. Verify settings modal shows "Save & Close" confirmation

### TTS Not Playing
1. Check voice settings in speech settings modal
2. Test TTS with test button in voice tab
3. Verify volume settings
4. Check if streaming TTS is enabled

## Development Notes

### Files Modified
- `src/components/GlassChatPiP.tsx`: Main integration
- `src/components/chat/CollapsedHeader.tsx`: Voice mode in collapsed mode
- `src/components/SpeechControls.tsx`: Settings button
- `src/components/SpeechSettingsModal.tsx`: New settings modal

### Key Features Added
- Comprehensive speech settings modal
- Voice mode consistency between collapsed/expanded modes
- Connection status indicators
- Settings persistence
- Test functionality for TTS and GGWave
- Keyboard shortcuts

### Integration Points
- Speech service hook integration
- Settings persistence via localStorage
- Connection status monitoring
- Voice mode state management
- TTS streaming support