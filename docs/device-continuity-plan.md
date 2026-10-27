# Ally device continuity implementation

The user authorized three cooperating implementation lanes on 27 October 2026.

| Lane | Owner | First working increment |
| --- | --- | --- |
| Context handoff | context_handoff | Freeze available phone context, review it in the existing destination picker, explicitly send through authenticated attachment/message transport. |
| Execution location | execution_routing | Distinguish execution location from chat provider, recommend available PC route, require explicit submission and truthfully mark phone engine unavailable until implemented. |
| Phone live view | scrcpy_viewer | Optional separately authorized, device-bound, read-only scrcpy process with stop/expiry/disconnect cleanup. |
| Integration | root | Review interfaces, preserve concurrent work, coordinate shared files and validation. |

## Boundaries

A proximity observation proposes a review; it never authorizes capture, submission or device control. BLE-plus-knock and NFC hardware paths need separate real-device validation. Use existing snapshots and secure-surface rules; no fresh private screen capture in tests.

Context transfer works independently of mirroring. scrcpy requires an already authorized ADB transport; no automatic pairing or debug/security changes. Its raw live stream does not inherit protected-screen filtering from Ally accessibility tools. Viewer authorization must explain this distinction.

Android Codex runtime feasibility is not established. An accessibility transport is not an agent runtime. Do not show an executable phone choice until a real backend, authentication and lifecycle are verified.

Existing assistant/share request IDs preserve retry identity, but desktop bridge receipt deduplication is currently bounded process memory. Do not promise exactly-once delivery across desktop restart.

## Concurrent work

The existing chat codex:01a17732-eb42-7433-933c-ddabbf5f968e owns watch recording screen lifetime work. A coordination message was queued to it; delivery/acknowledgement was not yet confirmed. Avoid conflicting MainActivity/AssistantSheet hunks. Re-read docs/agent-collaboration.md before edits. Keep all dirty peer changes. No deployment/restart/install/Git operation is included in this initial staged increment.

## Validation

Use synthetic snapshots, fake process/device adapters and unit tests. Run relevant TypeScript and Android compile/tests after shared changes. Report source implementation separately from hardware/UI/streaming validation and deployment.

Status: implementation resumed after full access was enabled; per-lane completion is recorded in the collaboration ledger and lane documents.

## First increment completed - 27 October 2026

All three worker source claims are released to root. Handoff now has a phone-only explicit Review phone context on PC action in the power-hold request picker; it imports the existing OS-provided snapshot into the existing reviewed share destination flow. Location selection requires Run on PC before final Send; phone execution stays unavailable and forged location requests are rejected server-side. Optional viewer exposes phone_viewer_start/status/stop via MCP, requires authenticated caller and separate 15-minute raw-view consent, and uses a user-configured existing ALLY_SCRCPY_PATH plus authorized matching ADB transport.

Combined validation: TypeScript check PASS; 46 desktop tests across viewer backend, viewer tools, socket, execution destination, assistant routing and bridge PASS. Phone 92 and watch 39 JVM tests PASS; both Kotlin compile and debug APK assembly PASS. Phone APK wear-app/phone/build/outputs/apk/debug/phone-debug.apk SHA256 0EC8926C8E7A5660518716F9504D191CE153627B7C7890F641C478752D32A231; watch APK wear-app/app/build/outputs/apk/debug/app-debug.apk SHA256 FA7CBC42F932C90137C3888E49668EC937288F6D30F7020320CF5E76A57BF8AF.

Source/build completion is not live deployment. No APK installed, runtime restarted, private screen/microphone captured, real agent message submitted, ADB pairing or security setting changed. Hardware gesture adapters/calibration, matching animations, full desktop viewer UI/session-switch lifetime and an Android agent runtime remain follow-up work. scrcpy must be independently installed/configured before use. Actual handoff UI/live video need real device validation. Existing receipt deduplication does not survive desktop restart.

## Phone installation verified
User subsequently authorized phone access. Pixel7 existing authorized Wi-Fi ADB endpoint discovered and connected; exact Ally identity matched. Tested phone APK installed in place successfully, data retained, selected assistant bound, accessibility still enabled, on-device reconnection and real approved screen inspection succeeded. Verification session ended afterward. A Calculator probe was refused before execution because the screen revision changed; zero operations delivered. Desktop viewer activation, physical handoff UI and hardware gesture validation remain pending.

## Desktop activation armed after reply
User explicitly authorized desktop activation. Official scrcpy5.0.1 portable installed in project-local tools with official checksum verification. Combined ready candidate unified-20261026-154716-d3ac0dcd independently matches current sourceHash8d83e03359928003e719a5c195c1f683759ac0b3325cb71bb5bba57edc5fa447 and includes viewer registration plus peer usage changes.39 focused combined regression checks and TypeScript PASS. One hidden activation helper21832 waits for current managed SRCPY reply to finish, all decisions/native work idle and durable draft backup, then activates exact candidate with ALLY_SCRCPY_PATH. It validates new main, original selection/draft/native connection and live tool catalog/route capabilities, writing .local/device-continuity/activation-status.json. Until state complete, activation is pending, not verified live. No raw viewer started.
