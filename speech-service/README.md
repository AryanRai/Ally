# Ally Speech Service

A WebSocket-based speech processing service that provides Speech-to-Text (STT), Text-to-Speech (TTS), and ggwave audio communication for the Ally desktop overlay.

## Features

- **Speech Recognition**: Uses OpenAI Whisper for accurate speech-to-text conversion
- **Text-to-Speech**: Uses Coqui TTS for natural speech synthesis
- **ggwave Communication**: Audio-based data transmission for robot communication
- **WebSocket API**: Real-time communication with the Ally Electron app
- **GPU Acceleration**: Supports CUDA for faster processing

## Requirements

### System Dependencies

**Windows:**
- Python 3.8+
- Visual Studio Build Tools (for PyAudio compilation)
- CUDA Toolkit (optional, for GPU acceleration)

**macOS:**
- Python 3.8+
- Xcode Command Line Tools
- PortAudio (via Homebrew: `brew install portaudio`)

**Linux:**
- Python 3.8+
- Build essentials: `sudo apt-get install build-essential`
- PortAudio: `sudo apt-get install portaudio19-dev`
- ALSA: `sudo apt-get install libasound2-dev`

### Python Dependencies

Install the required Python packages:

```bash
pip install -r requirements.txt
```

## Installation

1. **Clone or navigate to the speech service directory:**
   ```bash
   cd Ally/speech-service
   ```

2. **Create a virtual environment (recommended):**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Test the installation:**
   ```bash
   python start_service.py
   ```

## Configuration

The service can be configured via environment variables:

- `WHISPER_MODEL`: Whisper model to use (default: "base")
  - Options: "tiny", "base", "small", "medium", "large"
- `TTS_MODEL`: TTS model to use (default: "tts_models/en/jenny/jenny")
- `WEBSOCKET_PORT`: WebSocket server port (default: 8765)
- `CUDA_VISIBLE_DEVICES`: GPU device to use (default: "0")

Example:
```bash
export WHISPER_MODEL=small
export TTS_MODEL=tts_models/en/ljspeech/tacotron2-DDC
export WEBSOCKET_PORT=8765
python start_service.py
```

## Usage

### Starting the Service

1. **Manual start:**
   ```bash
   python start_service.py
   ```

2. **With custom configuration:**
   ```bash
   WHISPER_MODEL=small WEBSOCKET_PORT=8765 python start_service.py
   ```

### Integration with Ally

The speech service automatically connects to the Ally Electron app via WebSocket. Once running:

1. Open Ally (the glass PiP chat overlay)
2. Press `Ctrl+Shift+V` (or `Cmd+Shift+V` on macOS) to toggle speech controls
3. Click "Connect" to establish connection with the speech service
4. Use the speech controls to:
   - Start/stop voice recognition
   - Test text-to-speech synthesis
   - Send ggwave audio signals

### WebSocket API

The service exposes a WebSocket API on `ws://localhost:8765` with the following commands:

#### Commands (Client → Service)

```json
{
  "command": "start_listening",
  "payload": {}
}
```

```json
{
  "command": "stop_listening", 
  "payload": {}
}
```

```json
{
  "command": "synthesize_speech",
  "payload": {
    "text": "Hello, this is a test"
  }
}
```

```json
{
  "command": "send_ggwave",
  "payload": {
    "text": "Robot command data"
  }
}
```

```json
{
  "command": "get_status",
  "payload": {}
}
```

#### Events (Service → Client)

```json
{
  "command": "speech_recognized",
  "payload": {
    "text": "recognized speech text",
    "confidence": 1.0,
    "timestamp": 1234567890
  }
}
```

```json
{
  "command": "speech_generated",
  "payload": {
    "audio_data": "base64_encoded_wav_data",
    "text": "synthesized text"
  }
}
```

```json
{
  "command": "ggwave_sent",
  "payload": {
    "success": true,
    "text": "transmitted text"
  }
}
```

## Troubleshooting

### Common Issues

1. **PyAudio installation fails:**
   - Windows: Install Visual Studio Build Tools
   - macOS: `brew install portaudio`
   - Linux: `sudo apt-get install portaudio19-dev`

2. **CUDA out of memory:**
   - Use a smaller Whisper model: `WHISPER_MODEL=tiny`
   - Reduce batch size in configuration
   - Use CPU instead: Set `use_gpu: false` in config

3. **WebSocket connection fails:**
   - Check if port 8765 is available
   - Verify firewall settings
   - Try a different port: `WEBSOCKET_PORT=8766`

4. **Audio device not found:**
   - Check audio device permissions
   - Verify microphone/speaker connections
   - Test with system audio settings

5. **TTS model download fails:**
   - Check internet connection
   - Try a different TTS model
   - Clear TTS cache: `rm -rf ~/.local/share/tts`

### Performance Optimization

1. **For faster speech recognition:**
   - Use GPU acceleration (CUDA)
   - Use smaller Whisper models for real-time processing
   - Adjust VAD sensitivity settings

2. **For better TTS quality:**
   - Use higher-quality TTS models
   - Adjust synthesis parameters
   - Use GPU acceleration

3. **For lower latency:**
   - Use "tiny" or "base" Whisper models
   - Reduce audio buffer sizes
   - Use local TTS models

## Development

### Project Structure

```
speech-service/
├── speech_service.py      # Main service implementation
├── start_service.py       # Startup script with environment setup
├── requirements.txt       # Python dependencies
└── README.md             # This file
```

### Adding New Features

1. **New speech models:** Update the model configuration in `SpeechConfig`
2. **New WebSocket commands:** Add handlers in `_handle_websocket_message`
3. **New audio processing:** Extend the audio processing threads
4. **New communication protocols:** Add alongside ggwave implementation

### Testing

Test individual components:

```bash
# Test WebSocket connection
python -c "import websockets; print('WebSocket support available')"

# Test audio devices
python -c "import pyaudio; p = pyaudio.PyAudio(); print(f'Audio devices: {p.get_device_count()}')"

# Test Whisper
python -c "import whisper; print('Whisper available')"

# Test TTS
python -c "from TTS.api import TTS; print('TTS available')"
```

## License

Part of the Ally/DroidCore project. See main project license.