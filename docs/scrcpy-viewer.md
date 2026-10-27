# Optional local phone viewer

`glass-pip-chat/electron/devices/scrcpyViewer.ts` implements an opt-in external-window lifecycle. `scrcpyViewerTools.ts`, registered through the device socket, exposes explicit `phone_viewer_start`, `phone_viewer_status` and `phone_viewer_stop` MCP tools. Registration starts no subprocess. It is not automatically started by proximity, handoff, routing or application startup. No downloads, pairing, ADB connection setup, settings changes, real phone capture or live deployment are performed by this implementation.

## Consent and identity

A normal Ally phone-control grant does **not** authorize this viewer. Raw scrcpy video cannot apply Ally's accessibility/XML protected-screen checks to every frame. Sensitive content may appear if Android allows it to be mirrored; Android secure surfaces remain subject to Android restrictions. Do not claim equivalent filtering, bypass secure surfaces or expose this stream to an agent as an approved screenshot.

An explicit “View phone locally” action must disclose: “Show this phone's live screen in a separate window on this computer. This viewer has no audio, input, clipboard sync or recording. Sensitive content may appear; Ally's phone-control screen filtering does not apply. Close the window or press Stop to end viewing.” Obtain a distinct `unfiltered-local-viewer` grant through the real approval broker, bound to device ID, ADB serial, exact chat/session and expiry (maximum 60 minutes). Do not silently extend existing control consent.

The backend checks serial-to-Ally identity before approval and immediately before launch. Phone and chat lifetimes require stable live AbortSignals. Disconnect/reconnect must replace/abort the phone signal. Only the main process resolves the installed executable and obtains authorization; renderer arguments cannot select executable paths or supply grants. Request IDs deduplicate starts and one device/serial can have only one pending/live/stopping viewer.

## Current MCP integration

Set `ALLY_SCRCPY_PATH` in the desktop process environment to an already installed absolute scrcpy executable path. Agents cannot set it through these tools. Explicit start requires an authenticated originating caller, matching connected phone ID and already-authorized ADB serial. The real interaction broker shows a separate 15-minute raw-viewer approval before launch. Status and Stop are limited to that same authenticated caller. Phone-side Stop/revocation closes the viewer too. Shutdown unregisters the tools and closes all viewers. No frames are returned to the agent.

The current MCP cancellation signal belongs to the initiating HTTP request, **not a full chat lifetime**. Cancellation stops the viewer, but successful tool completion does not automatically end it; grant expiry, phone disconnect, revocation, window close and explicit Stop still do. Chat switching is not currently wired as revocation and must not be advertised as automatically stopping viewing. A future desktop UI should supply a real chat-session lifetime signal and a persistent local Stop button. The external scrcpy window itself can always be closed.

## Backend integration contract

Construct `ScrcpyViewer` with `executable`, `identity`, `connection`, `session` and `authorize` adapters. Public methods are `start({requestId,deviceId,serial,chatId})`, `status(requestId,chatId)`, `stop(requestId,chatId)`, `revoke(grantId,deviceId)` and `close()`.

1. Resolve only approved installed scrcpy candidates in the main process. `discoverScrcpy` checks explicit local paths without execution or network access. Pin and validate a supported distribution before shipping.
2. A future desktop UI can wire explicit start/status/stop IPC after sender and exact originating-chat validation. Never auto-start on handoff or execution recommendation. “Starting” means subprocess requested; “running” means spawned, not proof the first video frame is visible.
3. Implement cancellable `authorize` using the real approval broker and disclosure above. Return only a matching viewer grant. Subscribe phone Stop/session revocation to `revoke`; unified Stop must end both control and viewing. Do not re-use the control-session grant.
4. Keep visible local Stop; call `close` during app shutdown and abort the exact chat signal on chat switch/end. Reservations persist until actual child exit. Failed termination remains “stopping”; never claim it ended or open a second stream.

The subprocess uses `--serial=<explicit> --no-control --no-audio --no-clipboard-autosync` and a static window title, with no shell and ignored stdout/stderr. No recording or transport setup flags are accepted. Expiry, Stop, revocation, disconnection, chat end and app close terminate the child; a stronger termination attempt follows after two seconds. Authorization/identity preparation is bounded to 150 seconds even if an adapter ignores cancellation. Test coverage uses synthetic identities and a fake process, never actual phone screens or ADB.

## Upstream references (checked 27 October 2026)

- [Control](https://github.com/Genymobile/scrcpy/blob/master/doc/control.md): read-only mode and clipboard flag.
- [Audio](https://github.com/Genymobile/scrcpy/blob/master/doc/audio.md): audio defaults to enabled, so explicitly disabled here.
- [Connection](https://github.com/Genymobile/scrcpy/blob/master/doc/connection.md): explicit serial and existing ADB connection requirements.
