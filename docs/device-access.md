# Native device access

This feature separates transport setup, screen viewing, phone control and APK installation. None authorizes the others. Implementation and deployment checkpoints are recorded below; source readiness is not a claim of physical verification.

## Pair phone ADB from the watch

Open **Ally → Settings → Device access** on the watch and choose **Pair phone with PC**. The connected PC generates a one-use, six-minute AOSP-compatible QR, delivered only through that watch's authenticated Ally socket. Both the intended phone and watch must be connected to Ally so the resulting ADB identity can be verified. If several phones are connected, use the PC `device_access_prepare` tool to choose the intended phone explicitly.

On the phone, open Android's **Wireless debugging → Pair device with QR code** and scan the watch. The user performs this native pairing action; Ally never clicks debugging/security prompts or changes settings. The PC pairs once against the exact randomized service announced by that scan, then verifies the phone's existing Ally device ID over the resulting ADB transport. A wrong/unavailable identity is reported as unverified; it never starts phone control, a viewer, an installation or an agent.

The QR and generated pairing secret stay in session memory, not Android preferences, notifications, tool status, process arguments or logs. QR display uses a secure activity and clears on disconnect, Stop or expiry. Stop ends the pairing attempt; already-established Android trust is managed manually on the phone. This QR is for reachable local Wi-Fi, not a remote-network tunnel. Discovery failure alone cannot establish whether devices are on different networks.

The Android client checks the PC's `deviceAccessProtocol` before sending new commands. With an older PC build it explains that a PC update/restart is required, instead of closing the existing connection with unsupported messages.

## Watch maintenance

The same watch screen offers **Start 10-minute maintenance**. This is a local explicit action, not an automatic response to a remote tool request. It starts a visible foreground notification with Stop, a bounded CPU wake lock and a temporary Wi-Fi network request. It does not toggle Wi-Fi or debugging. Resources are released on Stop, service destruction or expiry; there is no boot/restart replay.

While this Ally screen is visible, it uses `FLAG_KEEP_SCREEN_ON` with a dim per-window brightness. A QR uses brighter white for scanning. Going to another app removes Ally's screen-on flag. Android does not offer this app a supported way to force the system Wireless debugging settings window to stay awake, prevent a deliberate power-button sleep, or guarantee that an OEM keeps its debugging listener alive in ambient/sleep mode. A CPU wake lock does not keep a display on. The useful fallback is to enable debugging manually, return to Ally's maintenance screen, and reconnect to the fresh advertised endpoint when necessary.

`device_access_prepare(purpose=watch_maintenance)` asks for a real user decision and offers this screen on the watch. It reports **offered**, not started. The user opens it and taps Start. Authenticated maintenance reports give the PC a bounded reported lease and Wi-Fi status; this is not a claim that ADB itself is currently reachable.

## Choosing a transport

* `device_access_status` reports actual Ally/ADB readiness without screen capture or pairing. It reports native-stream capability separately from ADB.
* `phone_control` prefers the on-device Accessibility executor through Ally, on any network. If that capability is absent, preflight may select an already-authorized ADB transport with the exact matching Ally identity. It never changes executor after a refusal, protected-screen stop or failed plan.
* `phone_viewer_start` retains the separate read-only scrcpy flow, including actual raw-view approval and unchanged no-control/no-audio/no-clipboard/no-recording flags. Serial can be discovered by exact identity when omitted. It does not pair automatically.
* `phone_stream_start` is the integrated no-ADB route described below. A refusal in one viewing route must not be evaded using another.
* APK installation still needs an authorized stable ADB transport and separate user installation intent. Accessibility control and a viewer are not installation capabilities.

## Integrated no-ADB viewer

The phone advertises `native-viewer-v1` only when its native adapter is installed. An authenticated chat can request `phone_stream_start(requestId, deviceId)`. A real raw-view approval is required first. The PC then opens an isolated **Ally · Phone viewer** window and offers a notification on the selected phone. The user opens the notification (or phone **Settings → Phone viewer**) and chooses **Review Android screen sharing**. Android's own MediaProjection prompt decides the screen/app to share. Each session needs fresh native consent; no old capture token is restored or reused.

The foreground MediaProjection service sends a roughly one-frame-per-second JPEG preview, capped at720×1280 and180KB per frame, through the existing authenticated Ally connection. Slow connections drop preview frames rather than queue them indefinitely. This is an integrated low-frame-rate preview, not scrcpy video performance. Secure/protected content can remain black under Android's capture rules. No microphone, audio, input injection, clipboard sync or recording is added.

Frames terminate at the isolated local viewer, with no preload, external navigation, frame-returning tools, media attachments or files. Status returns counters/lifecycle only. Request/device/chat/token binding, frame-size/type/rate limits, parent/device disconnect, desktop lock, window Stop/close, Android Stop and15-minute expiry revoke the viewer. Native Stop/decline and stale tokens are not retried. The phone's existing control grant remains separate.

## Validation and deployment

Initial native-access TypeScript and41 desktop checks passed; phone/watch JVM suites and both APK builds passed with the root IME and queue-preview sources. Expanded native-stream suite passed60 checks including the root watchdog bridge tests; final combined validation/deployment is recorded in the ledger and `.local/assistant-timeout/native-device-access-validation.json` when completed.

Full watch lint currently reports seven existing errors outside these new feature files: the share picker's Fragment-version lint and password-input constants in assistant redaction/token setup. These were not suppressed or changed under another owner's scope. Phone lint passed. No private capture, microphone, model, message or real raw-stream test has been performed by this chat.

The PC implementation must be staged and manually activated; the earlier agent-driven restart rejection is not retried. The Android UI remains compatible with the current older PC until that activation. Do not claim an installed Android app proves the new PC protocol is live.

Platform references: [AOSP ADB Wi-Fi/QR format](https://android.googlesource.com/platform/packages/modules/adb/+/HEAD/docs/dev/adb_wifi.md), [Android screen-on limits](https://developer.android.com/develop/background-work/background-tasks/awake/screen-on), [PowerManager wake-lock semantics](https://developer.android.com/reference/android/os/PowerManager), [MediaProjection and per-session consent](https://developer.android.com/media/grow/media-projection), [foreground-service prerequisites](https://developer.android.com/develop/background-work/services/fgs/service-types).

Final deployment checkpoint: both frozen APKs installed with `install -r`, then independently matched against installed `base.apk` SHA256. Phone79ce5c1e… and watchf1a61688… include root IME/queue preview/assistant timeout repairs. Both assistants remain selected and bound without repair or security changes. Watch endpoint35973 succeeded after the user kept its native debugging screen visible; no failed install was replayed. Phone opt-ins and RSSI calibration were preserved.

Combined validation:142phone/42watch JVM tests, both APK builds, phone lint, TypeScript,60focused desktop checks plus17handoff checks passed. Desktop candidate `unified-20261027-031712-73d20ff7` remains staged with verified source hash; it is not live. The normal manual restart script can activate a matching candidate. Real QR scanning, watch maintenance stability and native phone capture remain physically unverified in this increment. A generated-image-only Electron harness verified the viewer lifecycle and Stop; screenshot export from that harness returned an empty image, so no visual screenshot QA is claimed.
