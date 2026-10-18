# Ally local voice

Ally desktop and the Wear OS companion share one authenticated local transcription worker. It uses faster-whisper with CPU int8 inference and Silero speech detection. Codex or Claude still handles every assistant request.

Desktop voice uses an explicit browser microphone request with echo cancellation, noise suppression and gain control. An AudioWorklet sends small mono frames to an adaptive utterance gate. A pause of about 700ms finishes a phrase; an uninterrupted phrase is capped at 20 seconds. The worker receives a 16kHz mono PCM WAV through main-process IPC, with at most two queued phrases. Silero removes non-speech before transcription. This is phrase-based local transcription; it does not invent live partial transcripts.

The microphone is off until you enable voice. Turning voice off, disconnecting, changing chats or closing Ally discards stale queued work. Recordings stay in memory and are never written into chat history. The watch uses the same worker and its own hold-to-talk recording.

Replies default to installed Windows SAPI voices. Settings list the actual voices and persist voice, rate and volume. Sentence playback is queued; Stop audio cancels queued synthesis and playback. Speech detected while a reply plays interrupts playback. Headphones improve barge-in reliability because acoustic echo cancellation depends on the microphone and audio driver.

For higher quality playback, choose **Google Cloud · Chirp 3 HD** in Voice settings. Ally lists actual available English voices from Google; it uses Application Default Credentials from this PC and its quota project. Only reply text is sent to Cloud Text-to-Speech. Microphone recordings continue to use local transcription. Cloud text-to-speech is billed to that project. No key or OAuth token is sent to the renderer or stored in Ally settings. Local remains the default; a Google failure falls back to the selected Windows voice with a visible warning. Cloud playback supports volume; the rate setting applies to Windows voices. To configure another PC, enable the Cloud Text-to-Speech API on its chosen project and run `gcloud auth application-default login` with a quota project.

## Setup on Windows

Use an isolated Python 3.10+ environment:

```powershell
.\speech-service\setup.ps1
```

Then launch Ally and select **Voice → Connect**. Ally starts the worker and waits for its model. Initial setup downloads the public model; subsequent runs use the cache. To choose another Python runtime, set `ALLY_SPEECH_PYTHON` before launching Ally. Do not install into Conda's system packages; a clean virtual environment avoids incompatible native runtime DLLs.

Ally reads or creates a bearer token in `%APPDATA%\glass-pip-chat\watch-bridge.json`. This file is local and must not be committed. The worker binds only `127.0.0.1:18766`. No Google Cloud account or API key is needed for the current local backend.

Ally stores downloaded transcription models under `%LOCALAPPDATA%\Ally\speech\models` and transfer files under the neighbouring `xet` folder. This avoids shared Hugging Face cache junctions pointing at disconnected drives. Set `ALLY_STT_CACHE` to choose another model cache, or `HF_XET_CACHE` for an explicit transfer cache. Neither setting changes global Hugging Face configuration or removes existing models. A model name/path supplied through `ALLY_STT_MODEL` is retained. On other systems the default is `~/.local/share/Ally/speech/models`.

For manual diagnosis, after closing Ally's managed worker:

```powershell
.\speech-service\start.ps1
```

Desktop manages only a child it started, and stops that child on exit. An externally started compatible worker may be reused; Ally never kills it. Missing dependencies, model errors, authorization failures and port conflicts appear as actionable errors. Connect failure does not report success. A user Disconnect never schedules a reconnect and never reopens the microphone.

## HTTP contract

Every endpoint requires `Authorization: Bearer <local token>`.

- `GET /health`: service marker `ally-speech`, version, `ready`, loading/ready/error state, model and backend. Loading returns HTTP200 with `ready:false`.
- `POST /transcribe`: bounded 16kHz mono signed16-bit PCM WAV; returns `{ "text": "…" }`. Invalid audio/size, busy workers and model loading return structured errors. Empty speech is not sent to the agent.

The bearer token is held by Electron main and the paired watch; it is never exposed to the desktop renderer. Audio, transcripts and tokens are not logged by the voice path.

## Verification

```powershell
cd glass-pip-chat
npm run typecheck
npm run test:run
npm run build:electron
```

Worker tests use dependency injection and exercise loopback auth, readiness, audio validation and busy responses. Renderer tests cover encoding, resampling, utterance bounds, truthful Connect failures, Disconnect during Connect, and microphone permission failure.

The old `speech_service.py`, minimal WebSocket demo and manual WebSocket test scripts are retained as historical prototypes. Current startup scripts and Ally do not call them. Their old port8765, Coqui, Deepgram, ElevenLabs and ggwave setup instructions do not apply to the current runtime.
