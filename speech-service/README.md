# Ally local speech

**One authenticated transcription worker for desktop, phone, and watch.**

[← Ally](../README.md) · [Getting started](../docs/getting-started.md) · [Cloud voice and alerts](../docs/voice-and-notifications.md)

The current local worker uses **faster-whisper**, CPU int8 inference by default, and speech detection. It transcribes audio; Claude Code or Codex still handles the assistant conversation.

Google Cloud streaming recognition and speech synthesis are integrated separately through Electron. This guide covers the local worker used by the local voice path and compatible fallbacks.

## Set up on Windows

Use Python 3.10 or newer. From the repository root:

```powershell
.\speech-service\setup.ps1
```

This creates `speech-service/.venv` and installs `requirements-local.txt`. In Ally, choose **Voice → Connect**. Ally starts its worker and waits for readiness; the first connection may download the selected public model.

Keep this isolated environment rather than installing into an unrelated system or Conda environment. Windows native-runtime dependencies are deliberately pinned in `requirements-local.txt`.

Connecting or loading a model does not start the microphone. Use the explicit voice controls or the supported Android assistant invocation when you want to record. Text remains usable while speech is loading or offline.

## What happens to audio

| Stage | Local behavior |
| --- | --- |
| Capture | The desktop renderer or Android device owns explicit microphone capture |
| Transport | A bounded recording travels through the authenticated desktop path |
| Recognition | The local worker validates 16 kHz mono PCM WAV audio and removes non-speech |
| Result | A completed transcript returns to the chat controller; empty speech is not an agent message |
| Storage | The current voice path keeps recordings in memory rather than saving them into chat history |

Desktop local recognition is phrase based, with utterance gating; it does not invent live partial transcripts. Google Cloud recognition, when configured, provides a separate streaming-preview path and sends audio to Google. Google reply synthesis sends reply text to Google. [Provider behavior and fallback details →](../docs/voice-and-notifications.md)

Reply playback is handled by the desktop/device speech integration, not this Python HTTP worker. It can use configured Google synthesis or available system voices.

## Runtime and model caches

The worker listens only on `127.0.0.1:18766`. It uses the bearer token in the desktop’s private `watch-bridge.json`; on Windows this normally lives under `%APPDATA%\glass-pip-chat`.

| Setting | Purpose |
| --- | --- |
| `ALLY_SPEECH_PYTHON` | Explicit Python executable for Ally’s managed worker |
| `ALLY_STT_MODEL` | Selected model name or local model path |
| `ALLY_STT_DEVICE` | Explicit inference device |
| `ALLY_STT_COMPUTE_TYPE` | Explicit inference compute type |
| `ALLY_STT_CACHE` | Explicit model cache location |
| `HF_XET_CACHE` | Explicit transfer cache location |

Default model storage on Windows is `%LOCALAPPDATA%\Ally\speech\models`, with transfer files in the neighboring `xet` directory. On other systems the default model directory is `~/.local/share/Ally/speech/models`.

The owned cache avoids depending on shared Hugging Face junctions to disconnected drives. It does not remove existing models or rewrite global Hugging Face configuration. [Cache-repair background →](../docs/phone-speech-cache-repair.md)

An isolated desktop build must retain access to the sibling `speech-service` directory and its Python environment. Copying only the Electron renderer/main output does not provision local transcription.

## Manual diagnosis

After checking for an existing managed worker, a manual development launch is available:

```powershell
.\speech-service\start.ps1
```

Do not start a second worker on the same port. Ally reuses a compatible external worker and manages only a child it owns. Dependency, authorization, port, and model-loading errors must be treated as errors rather than a successful Connect.

A local backend needs no Google API key. Cloud speech needs the intended Google Cloud project, enabled APIs, desktop Application Default Credentials, and its quota project. Keep tokens and credentials out of Git, screenshots, logs, APKs, and renderer code.

## HTTP contract

Every endpoint requires `Authorization: Bearer <local token>`.

| Endpoint | Contract |
| --- | --- |
| `GET /health` | Returns the `ally-speech` service marker, readiness/state, model, and backend. Loading can return HTTP 200 with `ready: false`. |
| `POST /transcribe` | Accepts bounded 16 kHz mono signed 16-bit PCM WAV and returns a text result. Invalid audio, busy state, and loading produce structured errors. |

Readiness checks never open a microphone. Recordings, transcripts, and credentials are not logged by this voice path.

## Verification

With the local environment installed, run worker tests from `speech-service/`:

```powershell
.\.venv\Scripts\python.exe -m unittest test_transcriber
```

From `glass-pip-chat/`, run desktop integration checks:

```sh
npm run typecheck
npm run test:run
npm run build:electron
```

The worker tests use injected dependencies for authentication, readiness, model-cache behavior, audio validation, and busy responses. Desktop tests cover encoding, cancellation, fallback, and truthful connection state. Use synthetic audio for diagnostics; a private microphone recording or agent message is not needed.

## Historical prototypes

`speech_service.py`, the minimal WebSocket demo, and older manual WebSocket tests are retained as prototypes. The current startup scripts do not use their port 8765, Coqui, Deepgram, ElevenLabs, or ggwave setup. Start with `setup.ps1`, `start.ps1`, `transcriber.py`, and `requirements-local.txt` for the current local runtime.
