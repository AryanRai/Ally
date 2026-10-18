# Getting started with Ally

[← Documentation](README.md) · [Project overview](../README.md) · [Android companions](../wear-app/README.md)

Use this guide to run the desktop app, connect an agent, and add optional speech or companion devices.

## 1. Prepare the desktop

You need Node.js with npm, Git, and at least one supported agent installation. Windows is the primary verified development environment; some native behavior differs on macOS and Linux.

Sign in to Claude Code or Codex through its own supported sign-in flow. Ally uses those installations and their existing sessions. It does not replace the agents’ authentication or run a separate provider/tool loop.

From the repository root:

```sh
cd glass-pip-chat
npm ci
npm run dev
```

The development command starts Vite, waits for it, builds Electron, and opens the desktop app.

If you already have a live Ally instance, coordinate before launching another copy. Shared ports, agent ownership, active responses, and unsent drafts matter. See the [collaboration scratchpad](agent-collaboration.md) when working in a shared checkout.

## 2. Choose an agent and folder

Open **Settings → Agents**:

1. Check that Ally found the intended Claude Code or Codex executable.
2. Choose the default working folder and the appropriate permission mode.
3. Select an engine/model in the composer, then start a chat or open an existing session.

Native chats keep their provider and session identity. Opening a chat reads its history; it does not send a message. Ally selects it immediately while any native hydration continues in the background. It keeps the saved view if history is temporarily unavailable and does not switch back after you navigate elsewhere.

For Codex chats already owned by the desktop app, the configured experimental desktop route can use that owner. An unsupported writer conflict remains an error; Ally does not silently fork the conversation. [Understand chat ownership →](codex-chat-ownership.md)

## 3. Add voice, if you want it

### Local transcription

On Windows, install the isolated Python environment from the repository root. Use Python 3.10 or newer:

```powershell
.\speech-service\setup.ps1
```

In Ally, choose **Voice → Connect**. The first connection may download the selected faster-whisper model. Connecting or loading the model does not open the microphone; microphone capture follows the user’s voice control or assistant invocation.

The worker listens on authenticated loopback port `18766`. Text input remains available if the worker is loading or unavailable. [Local speech setup and cache options →](../speech-service/README.md)

### Google Cloud speech

Voice settings also support Google Cloud streaming recognition and streamed reply synthesis. Configure an intended Google Cloud project, enable Speech-to-Text and Text-to-Speech, and set up Application Default Credentials and the matching quota project on the PC. Google usage is billed to that project.

Credentials stay on the PC. Devices connect to Ally’s authenticated bridge rather than receiving Google credentials. Streaming recognition and playback have their own local/device fallback rules. [Voice behavior and alerts →](voice-and-notifications.md)

## 4. Connect a phone or watch

Build and configure the Android companions using the [companion guide](../wear-app/README.md). Both use the same desktop bridge and pairing token.

| Connection | Use it for | Requirements |
| --- | --- | --- |
| **Configured HTTPS tunnel** | Paired devices away from the development connection | An explicitly configured tunnel, private pairing token, and internet access |
| **ADB tunnel** | Local development and device debugging | An already authorized ADB connection and the development forwarding setup |

The bridge listens on `127.0.0.1:18765`. The desktop and its chosen connection must stay available. PC sleep, app exit, network loss, force-stop, or mobile OS restrictions can interrupt access and alerts.

For an existing cloud-paired installation, a normal replacement APK install with `adb install -r` retains application data. Do not use the development watch installer: it provisions a localhost endpoint and changes the transport setup.

Choose Ally as the digital assistant through normal Android Settings if you want hardware assistant invocation. If the role appears selected but activation is broken after an update, reselect it through the system assistant picker and check service readiness. Do not use ADB to rewrite assistant roles or security settings. [Binding diagnosis →](chat-open-and-assistant-binding.md)

## 5. Try the core workflow

- **Keep a small window:** collapse to the pill and use the bounded reply reader. Expand when you need the full transcript.
- **Attach a region:** start Circle selection, choose an area, then submit your question from the existing composer. Selection alone does not submit an agent query.
- **Explore a diagram:** open the drawing controls to sketch, navigate steps, minimize, or reopen the same board. Clearing the board or changing chats revokes that board’s context.
- **Add a follow-up:** use Queue during active work. Edit, reorder, cancel, or explicitly send an entry with the existing controls.
- **Check another agent:** the monitor shows current activity and genuine needs-input/error states. Selecting a chat does not answer an approval or submit a prompt.

## Common setup problems

| Symptom | Check |
| --- | --- |
| Agent unavailable | CLI path, the agent’s own sign-in state, and working-folder access |
| Codex writer conflict | The exact owning app and configured route; do not create a replacement chat as a workaround |
| Voice loading or offline | Python environment, model cache, readiness/error state, and selected speech provider |
| Companion cannot connect | PC/Ally availability, endpoint, token, tunnel or ADB transport, and device connection settings |
| Android assistant selected but unresponsive | Actual service binding and the normal OS assistant selector |
| Approval cannot be found | Whether the tool actually issued a pending request; an automatic review rejection is not an Allow prompt |
| Vercel build says a folder is missing | The retired `ally-remote-service` integration; see [deployment diagnosis](vercel-retired-deployments.md) |

## Build and check changes

From `glass-pip-chat/`:

```sh
npm run typecheck
npm run test:run
npm run build:vite
npm run build:electron
```

`npm run build` also creates a platform package. It writes build output in the checkout: use an isolated candidate for coordinated live deployments. Local speech’s Python environment is a separate runtime requirement and must remain reachable beside an isolated desktop build.

For shared work, check exact file ownership and active deployment slots before editing or restarting. Synthetic fixtures and read-only metadata are usually enough for software checks; do not send real agent prompts, record a private microphone, or capture a private screen merely to validate a documentation or layout change.
