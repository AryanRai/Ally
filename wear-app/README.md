# Ally for Wear OS

A native Kotlin / Compose for Wear OS companion with Wear Material 3 controls. Tested development target: Galaxy Watch 5, SM-R915F. Minimum Android API 30; compile/target API 36.

## Experience

- Two horizontally swipeable pages: the hold-to-talk orb and a scrollable answer with structured cards.
- Hold the orb to record; release to upload. A cancelled gesture or leaving the app cancels recording. Maximum recording: 60 seconds. Audio is held in memory, sent through the bridge, and never saved by Ally.
- Start/stop/response haptics, pause microphone and haptics, text fallback, connection state, engine/context label, retry, and optional background reply notifications while the app process remains alive.
- Cards, local checklists, foreground timers, progress and follow-up buttons. The renderer accepts an explicit catalog; arbitrary scripts, HTML and URLs are not executed. Actions submit a prompt only on a tap. Timers only alert while their card is open; they are not background alarms or scheduled reminders.
- The watch uses its own persistent conversation per engine. It does not acquire a writer for a chat already open in Codex. The bridge runs agents read-only in Ally's configured working folder.

## Build

Install Android SDK platform 36 and a compatible JDK (17+; validated with JDK 23). Set `ANDROID_HOME` and `JAVA_HOME`, or create a local `local.properties` with `sdk.dir`.

```powershell
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest
```

## Desktop bridge and voice

Build Ally's Electron process with `npm run build:electron` in `glass-pip-chat`. Launch Ally once with `ALLY_WATCH_ENABLED=1` in its environment. This creates an enabled `watch-bridge.json` in Electron's user-data folder (Windows: `%APPDATA%\glass-pip-chat`). It contains a randomly generated token, port 18765, and the dedicated session IDs. The bridge starts on subsequent launches until `enabled` is set to `false` and Ally is restarted.

The bridge binds only to `127.0.0.1`. Requests require its bearer token. Development uses `adb reverse` over the already paired ADB connection, so no router exposure or firewall changes are required. A future standalone deployment should terminate HTTPS in front of this authenticated API; the watch permits cleartext only for localhost.

Start the separate local Whisper worker in a virtual environment (the package is `openai-whisper`, not the unrelated package named `whisper`):

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r tools/requirements.txt
.\.venv\Scripts\python tools/transcribe.py --config "$env:APPDATA\glass-pip-chat\watch-bridge.json" --model base
```

The worker listens on localhost:18766, accepts bounded 16 kHz mono PCM WAV uploads, and transcribes them without using the PC microphone. The first run downloads the selected Whisper model if it is not cached. Text still works when the voice worker is offline. No cloud speech API key is needed.

## Install on a paired watch

```powershell
.\tools\install-watch.ps1 -Device 'WATCH_IP:DEBUG_PORT'
```

This installs the debug APK, reverses port 18765 and provisions its endpoint/token using debug-only activity extras. Release builds ignore those extras; use the watch's connection settings. Secrets are not compiled into the APK or committed. Grant microphone permission on the watch when first using the orb, then hold it again. Reply alerts are optional in settings.

The ADB reverse tunnel must be recreated after disconnects/reboots. Keep the PC, Ally and voice worker running. This MVP does not provide an internet relay, phone companion, process-independent background push, TTS or arbitrary desktop-chat selection.

## Protocol

- `GET /v1/status`: connection and voice readiness.
- `POST /v1/messages`: `{provider, requestId, text}` → `{id}`.
- `POST /v1/audio?provider=codex&requestId=UUID`: `audio/wav` → `{id}`.
- `GET /v1/turns/{id}`: `thinking | done | error`, activity, transcript and final reply.

Request IDs make repeated uploads idempotent in the running bridge. One active request per engine prevents writer conflicts. Polling is bounded, retries preserve a pending turn, and the bridge retains the latest 100 turns in memory. Restarting the bridge expires pending responses; engine conversation history remains on disk.

```json
{"text":"Try these two things.","components":[{"type":"checklist","title":"Next steps","items":["Open your notes","Write the first sentence"]},{"type":"timer","title":"Focus","seconds":300}]}
```

## Layout

`MainActivity.kt`: screens and gestures. `WatchViewModel.kt`: request/recording state. `VoiceRecorder.kt`: bounded PCM capture. `WatchApi.kt`: authenticated transport. `Models.kt`: safe card catalog. `WatchNotifications.kt`: notification entry point. Desktop adapter: `glass-pip-chat/electron/watch/`. Speech worker: `tools/transcribe.py`.
