# Phone context handoff

> Historical implementation report. For current persistent hold-close setup, structured metadata and original-file sharing, use the [device continuity guide](device-continuity.md). Earlier double-knock, timed-session and staged-only statements below describe previous increments; the latest deployment limits are in that guide and the [physical handoff log](physical-tap-handoff.md).

Manual snapshot review is shipped. Physical BLE/double-knock adapters are now implemented in source; this dedicated chat has not installed or activated them. See [physical-tap-handoff.md](physical-tap-handoff.md) for hardware evidence, authenticated protocol, opt-ins, calibration, capture guards and deployment/physical-validation status.

The explicit phone assistant action opens a local review of its existing OS-provided snapshot. It does not take another screenshot. The user selects an existing Codex or Claude conversation and taps Send in the existing share picker. This does not imply that an agent is executing locally on Android.

`ContextHandoff` transfers a frozen image/text copy through a random, one-shot, process-private token. Pending tokens expire after 60 seconds and their image bytes are wiped. No raw image is passed in an Android Intent. Process loss or token reuse reports expiration, never recaptures. `ContextHandoffLauncher` refuses to overwrite an existing share draft or an uncertain pending send; the activity repeats that guard. Imported context is stored privately using the existing ShareDraftStore and previewed before any upload.

The existing authenticated HTTPS attachment/message endpoints deliver to the explicitly selected chat. The share picker preserves its destination, request ID, attachment references and complete payload for retries. Bridge message receipts currently live in memory; duplicate prevention across desktop restart or receipt eviction is not guaranteed. Check history before retrying after a desktop restart. No chat is automatically created or forked by this handoff.

The original `ContextHandoffGesture` helper remains a pure eligibility rule. The new physical-tap adapter uses actual Windows BLE advertising and Android scanning/accelerometer signals, bound to fresh one-use proofs over the existing authenticated paired-device socket. It requires explicit opt-ins, unlocked devices, multiple fresh nearby samples, a settled double knock and cooldown. It supports calibration, bounded foreground sessions and acknowledged local-review feedback. No permissions/settings are granted automatically. NFC registration is still unimplemented. A real NFC fallback without BLE would need its own authenticated paired-target proof. Physical signal/capture acceptance remains untested.

Secure/disabled/own-overlay screenshot exclusions remain those enforced by Android and the existing AssistantScreenContext. Missing screen context must be reported honestly. This flow never activates a microphone itself.

Validation uses synthetic snapshot bytes and monotonic timestamps in JVM tests. Live private screen capture, real messages and physical proximity/knock behavior are intentionally untested. No APK installation, desktop restart or scrcpy/ADB launch is part of this change.

Validation (27 October 2026): combined :phone:testDebugUnitTest :app:testDebugUnitTest :phone:compileDebugKotlin :app:compileDebugKotlin succeeded. Phone 92 tests and watch 39 tests, zero failures/errors, including seven new handoff fixture/gesture tests and execution-routing lane changes. Existing status/navigation bar deprecation warnings only. SDK/JDK were selected through process-local environment variables; no persistent build configuration change. Physical gesture, Android activity handoff UI and real-send acceptance remain untested.


Both debug APKs assembled successfully after combined validation: wear-app/phone/build/outputs/apk/debug/phone-debug.apk and wear-app/app/build/outputs/apk/debug/app-debug.apk. They are staged build outputs only, not installed. Final repeated combined JVM/compile check was fully up to date and successful.


