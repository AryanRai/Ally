# Ally for Wear OS

A native Kotlin / Compose for Wear OS companion with Wear Material 3 controls. Tested development target: Galaxy Watch 5, SM-R915F. Minimum Android API 30; compile/target API 36.

## Live voice and alerts

See [Voice and reply alerts](../docs/voice-and-notifications.md) for the current Google Chirp 3 live transcription, Chirp 3 HD streamed reply playback, local fallback, and active-turn background monitor. Settings includes Auto-read, Test voice, and reply alerts; replies include Read aloud / Stop audio. Google speech uses the desktop's configured project and credentials. The older local-only description below remains the fallback path.

## Experience

- Two horizontally swipeable pages: the hold-to-talk orb and the selected chat’s conversation with structured cards. Tap ALLY or the context label to open Chats; the picker also lives in settings and at the top of the history page. Switch between Codex and Claude, choose a previous watch/native session, or start a new watch chat.
- Ally / prxptn typography and neutral surfaces, Orbit's sunset energy palette and inward activity glow. The orb animates only during foreground recording/processing and shows Ally's listening eyes while recording.
- Open **··· → Appearance** for watch versions of the desktop's Energy, Siri, Cloud wave and Pixel orb styles, with Sunset, Default, Aurora and Ocean colours. Preview each option, select activity glow intensity (Off/Low/Medium/High), toggle listening eyes or reduced motion, or reset appearance. Changes save immediately on this watch, persist across app restarts and chat switches, and do not change the desktop look. Reduced motion disables orb rotation and microphone-driven movement; recording status and haptics remain available.
- Galaxy Watch5 touch bezel: turn around the screen edge to open replies from the orb, then scroll history, chats, settings, appearance choices and approval details. Uses Wear OS native rotary handling (also compatible with physical bezels), with controlled scrolling and haptics that respect Ally's pause switch. Only the visible pager page receives rotary focus. Bezel input never records audio, sends a message, changes a setting or answers an approval; tap controls explicitly. While recording, bezel navigation is disabled. Touch swipes remain available. Samsung's **Touch bezel** system setting must be enabled for physical edge gestures; Ally does not change it.
- Codex-style compact, expandable tool rows update with the existing 1.5-second turn polling, followed by the answer and engine-reported usage. Up to 24 recent tool entries are retained; details are bounded for the watch. Missing tool completion events are marked interrupted, never assumed successful.
- Hold the orb to record; release to upload. The orb reacts to the actual microphone level and shows elapsed recording time. A cancelled gesture or leaving the app cancels recording. Maximum recording: exactly 60 seconds. Audio is held in memory, sent through the bridge, and never saved by Ally.
- Start/stop/response haptics, pause microphone and haptics, text fallback, connection state, engine/context label, retry, and optional background reply notifications while the app process remains alive.
- Cards, local checklists, foreground timers, progress and follow-up buttons. The renderer accepts an explicit catalog; arbitrary scripts, HTML and URLs are not executed. Actions submit a prompt only on a tap. Timers only alert while their card is open; they are not background alarms or scheduled reminders.
- Text and recordings continue the selected chat until you choose another or tap New chat. Selection survives reopening the app. The reply page retains every exchange; Earlier messages loads older history in batches of 30. Imported conversations retain their native engine, session and working folder. Browsing does not acquire a writer; continuation reports a conflict if another app still owns it. Each chat defaults to Read only; settings can select Edit files or Full access / bypass for subsequent messages.

## Approvals and chat permissions

Open **··· → Chat permissions** to select a mode for the current chat. The choice is saved on this watch per chat and applies to both text and recordings. It cannot change during an active turn. Codex maps these modes to read-only, workspace-write and danger-full-access sandboxes; Claude maps them to plan, acceptEdits and bypassPermissions. Full access allows unsandboxed actions but does not override managed restrictions or mandatory tool confirmations.

Codex's real command, file-change, permission and supported connector approval requests appear on the watch. Read the details, choose any required answers, and explicitly allow, deny or cancel. There are no preselected answers. Command/file grants apply once; additional permissions apply only to the current turn. Approvals expire after ten minutes, cancel when the turn stops, and pause the execution timeout while awaiting your answer. A lost answer response can be retried without executing the decision twice. Reopening the watch resumes polling; restarting Ally expires in-memory turns and approvals.

Simple connector forms and user questions are supported. Browser authentication and unsupported forms still require the PC. Claude's interactive prompts are not forwarded yet. An automatic review rejection that produces no actionable server request cannot be approved from the watch; Ally must report the rejection accurately instead of inventing an Allow prompt.

Codex watch turns also receive the dedicated `ally_watch.ask_user` MCP tool. It waits for an explicit watch answer through the same turn-scoped queue, including in normal execution mode where the built-in plan-mode question tool may be unavailable. A question written in chat text or a desktop-only asynchronous question widget is not a pending watch approval. The private localhost MCP endpoint is authenticated, exists only during that turn, and closes on completion or interruption. Its answers record human input; they do not change settings or override another tool's restrictions.

Chrome file uploads separately require the ChatGPT extension's **Allow access to file URLs** setting. This is a browser capability requirement, not an Ally sandbox permission. An unsupported `chrome://` URL is not itself an automatic security-review rejection. See [the official Chrome extension upload setup](https://developers.openai.com/codex/app/chrome-extension/#upload-files).

Verified on 2026-10-17: an actual Codex turn initiated from the Galaxy Watch displayed “Cancel test or Continue test?”; selecting Cancel test and tapping Send answer cleared the pending request and resumed that same turn. No external action was part of this test. Desktop validation: 114 tests passed, TypeScript and Electron build passed, and both installed-Codex MCP smoke tests passed. The JSON-RPC reader now explicitly closes its private output pipes on shutdown so inherited Windows child pipes cannot keep the verification process alive.

## Build

Bezel verification (2026-10-17): build and lint passed (zero errors), installed
on Galaxy Watch5 SM-R915F. Injected native rotaryencoder SCROLL events opened
replies, scrolled history in both directions, and scrolled settings, appearance
and the chat picker. Returning from nested screens restored home rotary focus;
ordinary horizontal swipes still worked. No messages or approvals were submitted.
Physical edge gestures and haptic feel require an on-wrist check with Samsung's
Touch bezel setting enabled; ADB input injection does not validate that sensor.

Appearance verification (2026-10-17): debug build and Android lint passed (zero errors). Installed on the Galaxy Watch 5 and checked style/palette selectors, glow and toggle settings, Back navigation, and Pixel/Ocean rendering after force-stop/relaunch. All five appearance preferences survived; Reset appearance restored Energy/Sunset, Medium glow, listening eyes on and reduced motion off. The HTTPS endpoint was preserved. No message or recording was sent during these checks.

Install Android SDK platform 36 and a compatible JDK (17+; validated with JDK 23). Set `ANDROID_HOME` and `JAVA_HOME`, or create a local `local.properties` with `sdk.dir`.

```powershell
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest
```

## Desktop bridge and voice

Build Ally's Electron process with `npm run build:electron` in `glass-pip-chat`. Launch Ally once with `ALLY_WATCH_ENABLED=1` in its environment. This creates an enabled `watch-bridge.json` in Electron's user-data folder (Windows: `%APPDATA%\glass-pip-chat`). It contains a randomly generated token, port 18765, and the dedicated session IDs. The bridge starts on subsequent launches until `enabled` is set to `false` and Ally is restarted.

The bridge binds only to `127.0.0.1`. Requests require its bearer token. The watch can reach it over HTTPS at `https://ally.prxptn.com`, through the dedicated `ally-watch-prxptn` Cloudflare Tunnel. The tunnel has one published hostname, forwarding only to `http://127.0.0.1:18765`; other domains and existing routes are independent. ADB remains available for development installation and debugging, but is not required for watch requests over HTTPS. The watch permits cleartext only for localhost.

Ally starts its own `cloudflared` child after the bridge begins listening. Cloudflared reconnects its network transport; Ally restarts the child after unexpected exits with bounded backoff. Closing Ally stops that child, without managing other Cloudflare processes or services. `watch-bridge.json` contains an opt-in `cloudTunnel` object (`enabled`, `hostname`, `binary`, `tokenFile`); the private token file must live under Ally's user-data directory. No token is stored in the repository, logs, or child command arguments. When cloud mode is enabled, the development ADB reconnect manager stays off. PC sleep/offline still makes the agent unavailable; this is not a cloud-hosted agent or an offline message queue.

The watch checks connectivity again when reopened and every 15 seconds while active. Temporary proxy/tunnel errors (including Cloudflare's 530 when no connector is available) enter reconnecting state; authentication failures remain actionable errors. To change only the endpoint in a paired debug installation without retransmitting its token, launch `dev.ally.watch/.MainActivity` with `--es endpoint https://ally.prxptn.com` after stopping the app. Selection and the existing token are retained.

Desktop and watch now share the managed faster-whisper worker on localhost:18766. Ally starts it automatically when the enabled watch bridge starts or desktop voice connects. Microphones remain off while the model loads. Run `speech-service/setup.ps1` once from the repository to install its isolated environment. The watch reports loading/offline status and keeps text available.

For a manual development launch:

```powershell
..\speech-service\.venv\Scripts\python tools/transcribe.py --config "$env:APPDATA\glass-pip-chat\watch-bridge.json" --model small
```

The worker accepts authenticated, bounded 16 kHz mono PCM WAV uploads and transcribes them with voice-activity filtering, without opening the PC microphone. The default `small` model runs as CPU int8; `ALLY_STT_MODEL`, `ALLY_STT_DEVICE` and `ALLY_STT_COMPUTE_TYPE` allow an explicitly configured alternative. The first run downloads the selected public model if it is not cached. Text still works when voice is offline. No cloud speech API key is needed.

## Install on a paired watch

```powershell
.\tools\install-watch.ps1 -Device 'WATCH_IP:DEBUG_PORT'
```

This installs the debug APK, reverses port 18765 and provisions its endpoint/token using debug-only activity extras. It also enrolls the watch's hardware serial and ADB path in `watch-bridge.json`; restart Ally after the first enrollment. Release builds ignore those extras; use the watch's connection settings. Secrets are not compiled into the APK or committed. Grant microphone permission on the watch when first using the orb, then hold it again. Reply alerts are optional in settings.

In development ADB mode, Ally checks the enrolled watch's tunnel every 10 seconds. After a disconnect it retries with a 2–30 second backoff, discovers changed wireless-debugging ports through mDNS, verifies the watch's hardware identity, and restores port forwarding. It does not reset the global ADB server, pair new devices, or modify another device's tunnels. Existing installations can enroll by running the installer again. The watch retries connection checks every 15 seconds while its screen is active and resumes polling an accepted message; unacknowledged uploads require a tap to retry. Completed messages are not automatically resent, and authentication/agent failures retain their own error state.

Keep the PC and Ally running. Development ADB mode requires wireless debugging and local-network reachability; cloud mode requires working internet on both devices. Direct LAN discovery, durable message receipts across desktop restarts, a phone companion and server push are not implemented. Reply monitoring uses a bounded Android foreground service while an accepted turn is pending; it is not an always-on push service.

## Protocol

- `GET /v1/status`: connection and voice readiness.
- `GET /v1/chats?provider=codex&offset=0`: paginated chat picker.
- `POST /v1/chats`: `{provider, requestId}` creates a stable watch chat (idempotent).
- `GET /v1/chats/{id}?before=N`: selected chat identity and 30 history messages; omit before for the latest page.
- `POST /v1/messages`: `{provider, chatId, requestId, text, permission}` → `{id, chatId}`. Permission is `readonly`, `edit` or `full`; omission defaults to `readonly`.
- `POST /v1/audio?provider=codex&chatId=ID&requestId=UUID&permission=readonly`: `audio/wav` → `{id}`.
- `GET /v1/turns/{id}`: `thinking | done | error`, activity, bounded `steps`, reported `usage`, transcript, final reply and pending `approvals`.
- `POST /v1/turns/{id}/approvals/{approvalId}`: `{action, values}` submits an explicit answer to that turn's pending request. Requires the same bearer token; stale or conflicting answers are rejected.

Approval validation includes queue expiry, cancellation, answer validation, turn isolation and idempotent retries; JSON-RPC transport and Android parsing have regression tests. Run `node scripts/verify-watch-approvals.mjs` from `glass-pip-chat` for a real installed-Codex round trip using a localhost mock MCP server. It denies a simulated upload request, without uploading a file or starting an agent turn.

Request IDs make repeated uploads idempotent in the running bridge. One active request per selected chat prevents duplicate watch writers. Polling is bounded, retries preserve a pending turn, and the bridge retains the latest 100 turns in memory. Restarting the bridge expires pending responses; engine conversation history and watch-to-session links remain on disk. `watch-chats.json` stores stable watch identities, native session links and watch history; existing dedicated sessions are imported without deleting them.

```json
{"text":"Try these two things.","components":[{"type":"checklist","title":"Next steps","items":["Open your notes","Write the first sentence"]},{"type":"timer","title":"Focus","seconds":300}]}
```

## Chat selection verification (2026-10-17)

The updated APK is installed on the connected Galaxy Watch 5. Live checks covered the compact picker, both provider tabs, selecting an existing conversation, swiping to all exchanges, scrolling to older replies, Back navigation, and preserving selection after force-stopping/reopening the app. A message sent from the watch after reopening continued the same Codex session and remembered a code from the earlier turn. All six messages survived restarting the desktop bridge. Separate native Codex and Claude histories loaded without acquiring writers; history pagination returned 34 distinct messages across two pages, and chat-list pagination returned successive pages of 30.

Validation: 80 desktop tests passed, followed by the four conversation tests including an additional empty-chat pagination regression (81 total cases). TypeScript and desktop builds pass. All nine Android unit tests, Android build and lint pass. Bridge and shared voice readiness report ready. Claude history browsing works; its desktop runtime reported an invalid OAuth session during verification, so new Claude turns may require signing in again. The physical microphone was not re-tested in this change; both text and audio requests now carry the selected chat ID.

## Layout

Reconnect verification (2026-10-17): the updated watch APK and desktop bridge were installed locally. Removing the reverse mapping and disconnecting all transports for the enrolled watch left no ADB devices connected. Ally rediscovered the watch, connected it on its advertised port, and restored the mapping automatically. The watch returned to Ready and retained the same selected chat ID. Validation: 89 desktop tests, TypeScript, Electron build, 12 Android unit tests, APK build and Android lint passed. Port changes, stale discovery, hardware identity checks, backoff and shutdown also have transport regression coverage.

`MainActivity.kt`: screens and gestures. `WatchViewModel.kt`: request/recording state. `VoiceRecorder.kt`: bounded PCM capture. `WatchApi.kt`: authenticated transport. `Models.kt`: safe card catalog. `WatchNotifications.kt`: notification entry point. Desktop adapter: `glass-pip-chat/electron/watch/`. Speech worker: `tools/transcribe.py`.

## Fonts

`AllyStyle.kt` shares Ally's Geist / Geist Mono text and Tanker wordmark. Geist's static weights were generated from the existing Fontsource variable fonts; Tanker is copied unchanged from the prxptn frontend. Licenses and copyright notices are in `licenses/` and packaged in the APK's `assets/licenses/`.
