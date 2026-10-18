# Ally for Android and Wear OS

**The same agents and conversations, from your phone or wrist.**

[← Ally](../README.md) · [Documentation](../docs/README.md) · [Voice and alerts](../docs/voice-and-notifications.md) · [Validation history](VERIFICATION.md)

This Gradle project contains the native Kotlin / Compose phone and watch companions. Both connect to the desktop’s authenticated bridge and retain the original agent, session, and working folder. They do not run an independent agent backend on the device.

## Choose your surface

| Android phone | Wear OS watch |
| --- | --- |
| Full chat composer, rich answers, and image attachments | Hold-to-talk orb, text fallback, and rich reply history |
| Share text, images, and files into a reviewable draft | Quick chat switcher, searchable history, and image viewing |
| Android assistant entry and a floating agent monitor | Supported assistant invocation and an agent monitor |
| Home-screen widgets and a Quick Settings tile | A Wear tile and rotary navigation on supported hardware |
| Inbox for actual device-action requests | Supported questions, approvals, alerts, and read-aloud controls |

Phone and watch appearance preferences persist on their own device. Selecting a conversation, reading a widget, or opening the agent monitor does not send a message or approve an action.

## Build from source

Requirements: Android SDK platform 36, a compatible JDK, and the Android Gradle toolchain. Modules target API 36 with minimum API 30; Java compatibility is 17. Configure `ANDROID_HOME` / `JAVA_HOME`, or your local SDK path in `local.properties`.

From `wear-app/` on Windows:

```powershell
.\gradlew.bat :app:testDebugUnitTest :phone:testDebugUnitTest
.\gradlew.bat :app:assembleDebug :phone:assembleDebug
```

On macOS/Linux, use `./gradlew`.

| Module | App | Debug APK |
| --- | --- | --- |
| `:app` | Wear OS | `app/build/outputs/apk/debug/app-debug.apk` |
| `:phone` | Android phone | `phone/build/outputs/apk/debug/phone-debug.apk` |
| `device-common/` | Shared assistant, reply, transport, and UI code | Included by both modules |

Lint runs separately:

```powershell
.\gradlew.bat :app:lintDebug :phone:lintDebug
```

Treat current lint output as the result of that run. Historical successful builds or device checks do not establish that every later revision passes every check.

## Connect to desktop Ally

First run and configure the [desktop application](../docs/getting-started.md). The opt-in device bridge binds to `127.0.0.1:18765` and authenticates requests with a private pairing token.

For an initial development setup, launching Ally with `ALLY_WATCH_ENABLED=1` enables the bridge and persists its configuration in `watch-bridge.json` under Electron’s user-data directory. On Windows that is normally `%APPDATA%\glass-pip-chat`. Keep this file private; do not commit it or bake its token into an APK.

### Existing HTTPS connection

Use the configured HTTPS endpoint and pairing token in the companion’s connection settings. Ally supports an explicitly configured Cloudflare Tunnel from that hostname to its loopback bridge. The desktop owns and reconnects its own tunnel process; other tunnels are independent.

The PC, Ally, and the tunnel must stay available. Devices cannot reach an agent while its desktop is asleep or offline. This connection does not turn Ally into a cloud-hosted worker or an offline message-delivery service.

### ADB development connection

An already authorized USB or wireless-debugging connection can forward the bridge for development. The development installer provisions a localhost endpoint and enrolls a watch for its reconnect manager:

```powershell
.\tools\install-watch.ps1 -Device 'WATCH_IP:DEBUG_PORT'
```

**Use this only when choosing ADB development mode.** It changes connection configuration and is not an update command for an existing cloud-paired watch. The reconnect manager verifies enrolled hardware and does not pair arbitrary devices or reset the global ADB server.

## Update an already paired installation

Use the appropriate replacement APK on an explicitly selected, already authorized device:

```powershell
adb -s PHONE_SERIAL install -r phone/build/outputs/apk/debug/phone-debug.apk
adb -s WATCH_SERIAL install -r app/build/outputs/apk/debug/app-debug.apk
```

A replacement install retains app data. Check the saved endpoint, pairing, selected chat, and Android assistant readiness afterwards. Installing the watch is a separate action; do not assume a phone update authorizes it.

Choose Ally’s assistant and power-button behavior through ordinary Android Settings. Android can retain a selected role while the voice-interaction service is unbound after an update. If needed, reselect None and then Ally through the OS picker. Do not rewrite role/security settings through ADB. [Binding diagnosis →](../docs/chat-open-and-assistant-binding.md)

## Voice, activity, and alerts

- **Voice:** hold the orb and release to submit. Leaving the app or cancelling the gesture cancels capture. Hardware assistant invocation has its own foreground listening lifecycle, documented in [activation and routing](../docs/assistant-activation-routing.md).
- **Transcription:** configured Google Cloud speech supports live previews; local faster-whisper provides the fallback path. Credentials remain on the PC. Model loading does not open the microphone.
- **Playback:** Read aloud and Stop audio control replies. Optional auto-read is a device preference. Playback fallback depends on the available device voice.
- **Activity:** the agent monitor, phone widgets, and Wear tile show read-only status snapshots. Needs input, Stopped, and Error remain distinct from Completed.
- **Alerts:** opt-in foreground connection and turn-monitor services support reconnects and reply/request alerts. Android notification permission, quiet hours, DND, force-stop, network loss, and battery restrictions can affect delivery; this is not a guarantee of always-on push.

[Voice and alerts](../docs/voice-and-notifications.md) · [Agent monitor](../docs/assistant-agent-monitor.md) · [Widgets and tiles](../docs/android-widgets-and-tiles.md)

## Questions, approvals, and follow-ups

Actual supported Codex questions and approval requests appear with their original turn identity and explicit answer controls. Requests expire or cancel with their owning turn. Lost answer responses can be retried without executing a decision twice. Full access does not bypass mandatory tool or device confirmation.

An automatic review rejection with no actionable request cannot be approved later through a fabricated Allow button. Browser authentication and unsupported forms may still require the PC. [Interaction details →](../docs/chat-interactions.md)

Queued follow-ups can be reviewed, edited, reordered, cancelled, or explicitly sent using the shared queue. A sending entry is immutable, and an uncertain handoff pauses for review rather than automatically resending. [Queue behavior →](../docs/message-queue.md)

Optional answer cards, checklists, progress, and action buttons use a fixed component catalog. Actions submit only after a tap. Timers alert only while their card is open; they are not background alarms or scheduled reminders. Arbitrary answer HTML/scripts do not execute on the device.

## Bridge reference

All endpoints require the paired bearer token. History is paginated; browsing never acquires an agent writer.

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/status` | Connection, capabilities, and voice readiness |
| `GET /v1/chats` | Paginated chat picker |
| `GET /v1/chats/{id}` | Exact chat identity, history page, and state |
| `POST /v1/chats` | Create a device chat with an idempotent request ID |
| `POST /v1/messages` | Submit text to the selected chat |
| `POST /v1/audio` | Submit bounded recorded audio for the selected chat |
| `GET /v1/turns/{id}` | Turn progress, result, tools, and real pending requests |
| `POST /v1/turns/{id}/approvals/{approvalId}` | Answer that turn’s supported pending request |

Request IDs and native session links preserve identity and safe retries. Some active transport/turn state is held in memory; restarting the bridge can expire pending requests. Durable conversation history, queue receipts, and saved drafts have separate persistence rules. Check the original history before retrying an uncertain send.

## Source map

```text
wear-app/
├── app/                Wear OS activity, view model, recording, and navigation
├── phone/              Phone activity, chat model, sharing, and system surfaces
├── device-common/      Shared assistant, transport, reply, and approval code
├── tools/              Development install and compatibility utilities
└── licenses/           Bundled font and asset notices
```

The shared `AllyStyle` uses Geist / Geist Mono and the Tanker wordmark. Preserve the license notices packaged with the fonts and assets. Historical hardware checks are retained in [VERIFICATION.md](VERIFICATION.md); newer feature-specific validation lives in the [documentation index](../docs/README.md).
