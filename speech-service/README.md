# Ally Speech Service

A WebSocket-based speech processing service that provides real-time Speech-to-Text (STT), Text-to-Speech (TTS), barge-in voice interruption, and ggwave audio communication for the Ally desktop overlay.

## Features

- **Streaming STT (cloud):** [Deepgram Nova-2](https://deepgram.com/) — word-by-word transcription via WebSocket with <300 ms latency. Interim partial transcripts are forwarded to the Ally UI in real time.
- **Streaming TTS (cloud):** [ElevenLabs Flash v2.5](https://elevenlabs.io/) — ~75 ms time-to-first-audio-chunk, MP3 audio streamed back while the LLM is still generating.
- **Offline STT fallback:** OpenAI Whisper + WebRTC VAD — accurate batch transcription, no internet required.
- **Offline TTS fallback:** Coqui TTS (`tts_models/en/jenny/jenny`) — high-quality neural speech synthesis, no internet required.
- **Barge-in / Voice Interruption:** `InterruptManager` detects user speech during TTS playback and immediately stops the audio stream.
- **ggwave Communication:** audio-based data transmission (up to 140 bytes) for robot communication via speakers and microphone.
- **WebSocket API:** real-time communication with the Ally Electron app over `ws://localhost:8765`.
- **GPU Acceleration:** CUDA support for faster Whisper inference and Coqui TTS synthesis.
- **Backend switching:** `STT_MODE` and `TTS_MODE` environment variables select the active backend at startup, with automatic fallback on error.

---

## Architecture

```
Microphone (16 kHz raw PCM)
    │
    ▼
┌─────────────────────────────────────────────┐
│  STT Backend (selected by STT_MODE)         │
│                                             │
│  deepgram → DeepgramSTTService              │
│    - Streams PCM to Deepgram Nova-2 WS      │
│    - Fires speech_interim (partial)         │
│    - Fires speech_recognized (final)        │
│                                             │
│  whisper  → Whisper + VAD thread            │
│    - Batches audio after silence            │
│    - Fires speech_recognized (final)        │
└──────────────┬──────────────────────────────┘
               │ final transcript
               ▼
         Ally UI / LLM (via WebSocket)
               │ response text
               ▼
┌─────────────────────────────────────────────┐
│  TTSRouter (selected by TTS_MODE)           │
│                                             │
│  elevenlabs → ElevenLabsTTSService          │
│    - Streams text to ElevenLabs Flash v2.5  │
│    - Receives MP3 chunks → PyAudio playback │
│    - ~75 ms first-chunk latency             │
│    - Falls back to Coqui on error           │
│                                             │
│  coqui     → Coqui TTS                     │
│    - Generates full WAV, then plays         │
│    - No internet required                   │
└──────────────┬──────────────────────────────┘
               │
               ▼
         PyAudio playback
               ▲
               │ SpeechStarted VAD event (Deepgram)
┌──────────────┴──────────────────────────────┐
│  InterruptManager                           │
│  - Detects user voice during TTS playback   │
│  - Calls TTSRouter.stop()                   │
│  - Clears TTS queue                         │
│  - Emits speech_interrupted to Ally UI      │
└─────────────────────────────────────────────┘
```

Total latency (speech end → first audio back):
- **Cloud mode:** ~500–800 ms (Deepgram + ElevenLabs + Ollama)
- **Offline mode:** ~3–5 s (Whisper + Coqui + Ollama)

---

## Requirements

### System Dependencies

**Windows:**
- Python 3.9+
- Visual Studio Build Tools (for PyAudio compilation)
- CUDA Toolkit (optional, for GPU acceleration)

**macOS:**
- Python 3.9+
- Xcode Command Line Tools
- PortAudio (via Homebrew: `brew install portaudio`)

**Linux:**
- Python 3.9+
- Build essentials: `sudo apt-get install build-essential`
- PortAudio: `sudo apt-get install portaudio19-dev`
- ALSA: `sudo apt-get install libasound2-dev`

### Python Dependencies

```bash
pip install -r requirements.txt
```

Key packages:
| Package | Purpose |
|---------|---------|
| `deepgram-sdk>=3.0.0` | Deepgram Nova-2 streaming STT |
| `elevenlabs>=1.0.0` | ElevenLabs Flash v2.5 streaming TTS |
| `openai-whisper` | Offline Whisper STT (fallback) |
| `TTS` | Coqui TTS offline synthesis (fallback) |
| `pyaudio` | Microphone capture + audio playback |
| `webrtcvad` | Voice Activity Detection (Whisper mode) |
| `websockets>=12.0` | WebSocket server + ElevenLabs client |
| `ggwave-python` | Audio-based data transmission |

---

## Installation

1. **Navigate to the speech service directory:**
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

4. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your preferred backends and API keys
   ```

5. **Start the service:**
   ```bash
   python start_service.py
   ```

---

## Configuration

All settings are read from environment variables (set them in `speech-service/.env`).

### Backend Selection

| Variable | Default | Options | Description |
|----------|---------|---------|-------------|
| `STT_MODE` | `whisper` | `whisper`, `deepgram` | STT backend |
| `TTS_MODE` | `coqui` | `coqui`, `elevenlabs` | TTS backend |

### Cloud API Keys

| Variable | Required when | Description |
|----------|--------------|-------------|
| `DEEPGRAM_API_KEY` | `STT_MODE=deepgram` | [Get a key](https://console.deepgram.com/) |
| `ELEVENLABS_API_KEY` | `TTS_MODE=elevenlabs` | [Get a key](https://elevenlabs.io/) |
| `ELEVENLABS_VOICE_ID` | `TTS_MODE=elevenlabs` | Voice ID from ElevenLabs library (default: `21m00Tcm4TlvDq8ikWAM` — Rachel) |

### Offline Model Selection

| Variable | Default | Description |
|----------|---------|-------------|
| `WHISPER_MODEL` | `base` | `tiny`, `base`, `small`, `medium`, `large` |
| `TTS_MODEL` | `tts_models/en/jenny/jenny` | Any Coqui-compatible model string |

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBSOCKET_PORT` | `8765` | Port for the WebSocket server |
| `CUDA_VISIBLE_DEVICES` | `0` | GPU device index |

### Example `.env` (cloud streaming mode)

```bash
STT_MODE=deepgram
DEEPGRAM_API_KEY=dg_xxxxxxxxxxxxxxxxxxxx

TTS_MODE=elevenlabs
ELEVENLABS_API_KEY=el_xxxxxxxxxxxxxxxxxxxx
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

WEBSOCKET_PORT=8765
```

### Example `.env` (fully offline mode)

```bash
STT_MODE=whisper
WHISPER_MODEL=small

TTS_MODE=coqui
TTS_MODEL=tts_models/en/jenny/jenny

WEBSOCKET_PORT=8765
```

---

## Usage

### Starting the Service

```bash
# Default (uses .env settings)
python start_service.py

# Inline override
STT_MODE=deepgram TTS_MODE=elevenlabs python start_service.py
```

### Platform scripts

```bash
# Windows
start.bat

# macOS/Linux
./start.sh

# PowerShell (cross-platform)
pwsh start.ps1
```

### Integration with Ally

1. Start the speech service (see above).
2. Open the Ally desktop overlay.
3. Press `Ctrl+Shift+V` (or `Cmd+Shift+V`) to open speech controls.
4. Click **Connect** to link with `ws://localhost:8765`.
5. Click **Start Listening** — your voice will be transcribed in real time (partial transcript shown as `🎤 …` in the input field when using Deepgram).

---

## WebSocket API

The service listens on `ws://localhost:8765`.

### Commands (Client → Service)

```json
{ "command": "start_listening",  "payload": {} }
{ "command": "stop_listening",   "payload": {} }
{ "command": "get_status",       "payload": {} }

{ "command": "synthesize_speech", "payload": { "text": "Hello world" } }
{ "command": "synthesize_streaming", "payload": { "text": "Hello world" } }

{ "command": "send_ggwave",   "payload": { "text": "Robot command" } }
{ "command": "clear_tts_queue", "payload": {} }
{ "command": "skip_current_tts", "payload": {} }
```

### Events (Service → Client)

```json
// Partial transcript (Deepgram mode only)
{ "command": "speech_interim", "payload": { "text": "how do I fix the" } }

// Final recognized transcript
{ "command": "speech_recognized", "payload": { "text": "...", "confidence": 1.0, "timestamp": 1234567890 } }

// User spoke while AI was talking → UI should clear partial response
{ "command": "speech_interrupted", "payload": {} }

// TTS audio chunk (base64 MP3)
{ "command": "speech_generated", "payload": { "audio_data": "...", "text": "..." } }

// ggwave transmission result
{ "command": "ggwave_sent", "payload": { "success": true, "text": "..." } }

// Status update (on connect and on change)
{ "command": "status_update", "payload": { "stt_mode": "deepgram", "tts_mode": "elevenlabs", "is_listening": false, "is_speaking": false, ... } }
```

---

## Project Structure

```
speech-service/
├── speech_service.py     # Main service
│   ├── DeepgramSTTService    — Deepgram Nova-2 streaming STT
│   ├── ElevenLabsTTSService  — ElevenLabs Flash v2.5 streaming TTS
│   ├── TTSRouter             — Selects backend; auto-fallback to Coqui
│   ├── InterruptManager      — Barge-in: stops TTS when user speaks
│   └── SpeechService         — WebSocket server, Whisper/Coqui fallbacks
├── start_service.py      # Startup: dependency checks, env validation, launch
├── requirements.txt      # Python dependencies
├── .env.example          # Environment variable template
├── start.bat             # Windows launcher
├── start.sh              # macOS/Linux launcher
└── start.ps1             # PowerShell launcher
```

---

## Troubleshooting

### Common Issues

1. **PyAudio installation fails:**
   - Windows: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - macOS: `brew install portaudio`
   - Linux: `sudo apt-get install portaudio19-dev`

2. **Deepgram connection fails:**
   - Verify `DEEPGRAM_API_KEY` is set and valid.
   - Confirm internet access from the machine.
   - Check the Deepgram console for usage/errors.

3. **ElevenLabs no audio:**
   - Verify `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`.
   - Check your ElevenLabs character quota (free tier: 10k chars/month).
   - The service will automatically fall back to Coqui on error.

4. **CUDA out of memory (Whisper/Coqui):**
   - Use a smaller model: `WHISPER_MODEL=tiny`
   - Use CPU: unset `CUDA_VISIBLE_DEVICES`

5. **WebSocket connection refused:**
   - Confirm the service is running: `python start_service.py`
   - Check port availability: `WEBSOCKET_PORT=8766`

6. **Audio device not found:**
   - Check microphone permissions in OS settings.
   - List devices: `python -c "import pyaudio; p=pyaudio.PyAudio(); [print(p.get_device_info_by_index(i)) for i in range(p.get_device_count())]"`

### Performance Tips

- Use `STT_MODE=deepgram` + `TTS_MODE=elevenlabs` for <1 s total voice latency.
- Use `WHISPER_MODEL=tiny` or `base` for lowest offline STT latency.
- Enable GPU (`CUDA_VISIBLE_DEVICES=0`) to speed up Whisper and Coqui.

---

## Testing

```bash
# Check WebSocket library
python -c "import websockets; print('websockets OK')"

# Check audio devices
python -c "import pyaudio; p=pyaudio.PyAudio(); print(f'{p.get_device_count()} audio devices')"

# Check Whisper (offline)
python -c "import whisper; print('Whisper OK')"

# Check Coqui (offline)
python -c "from TTS.api import TTS; print('Coqui TTS OK')"

# Check Deepgram SDK (cloud)
python -c "from deepgram import DeepgramClient; print('Deepgram SDK OK')"

# Check ElevenLabs SDK (cloud)
python -c "from elevenlabs import ElevenLabs; print('ElevenLabs SDK OK')"
```

---

## Cost Estimate (cloud mode)

| Service | Rate | Typical daily use | Daily cost |
|---------|------|------------------|------------|
| Deepgram Nova-2 | $0.0043/min | 20 min | ~$0.09 |
| ElevenLabs Flash v2.5 | ~$0.18/1k chars | 2,000 chars | ~$0.36 |
| **Total** | | | **~$0.45/day** |

ElevenLabs offers a **free tier** (10k chars/month) — enough for testing. Deepgram also has a free tier ($200 credit).

---

## License

Part of the Ally/DroidCore project. See main project license.
