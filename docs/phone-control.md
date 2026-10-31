# Phone control

Ally exposes phone control through the existing `ally_chats` MCP server. The current Codex or Claude agent plans and operates the phone; there is no second phone model or autonomous background loop. Existing native tools handle notifications, HTTPS links, app launch, alarms and timers first.

## Connection paths

**Accessibility service (recommended):** No USB or ADB required. Enable the Ally accessibility service once in Android Settings → Accessibility → Ally, or via the Ally phone app under Settings → "Allow Ally to control this phone". The service connects over your existing Wi-Fi or mobile network through the standard Ally device bridge. This path supports all operations listed below including Unicode text input.

**ADB (development):** An alternative path for development use. Requires Android SDK platform-tools, USB debugging or wireless ADB authorized by the owner, and the **debug** Ally companion with Keep connected enabled. Install `adb` so it is reachable at `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or the usual Windows SDK location, or on PATH. Release apps without `run-as` are deliberately unsupported on this path.

Both paths require an explicit per-request user approval on the phone or watch before any operation runs.


## On-device control (any network, no ADB)

The Ally phone app includes an accessibility service, **Ally control**. Turn it on once in Android Settings → Accessibility (on Android 13+, sideloaded apps first need **Allow restricted settings** in Ally's App info). The desktop then sends the same validated operations over the authenticated device connection, so control works from any Wi-Fi or mobile data. Omit `serial` in `phone_control` to use it; `phone_control_devices` lists it as transport `on-device`.

- **One approval per session.** The first request from a chat asks once for a timed control session (`sessionMinutes`, default 15, at most 60). Later requests from that chat run without asking until the session ends. The phone enforces the session itself and shows an ongoing "Ally is controlling this phone" notification with **Stop**; Stop ends it on the phone and on the desktop.
- **Screen and lock.** During a session an invisible, untouchable overlay keeps the screen on; the timeout setting is never changed. If the phone is locked, Ally turns the screen on and shows Android's own fingerprint/face/PIN prompt, and continues once you unlock. If it stays locked for about 75 seconds, nothing runs.
- **Same safety checks.** The phone reports its screen in uiautomator's format, so the sensitive-screen, protected-control and screen-revision checks below apply unchanged. Text supports Unicode; Recents and JPEG screenshots are available. After an action, the screen read waits briefly for launch and unlock animations to settle, and a screenshot is only returned with the matching screen.

The ADB development adapter described below still works and now uses the same sessions.

## Setup and scope

Use an Android phone with the updated Ally companion and Keep connected enabled. Install Android SDK platform-tools on the desktop (`ANDROID_HOME`, `ANDROID_SDK_ROOT`, or the usual Windows SDK location; otherwise `adb` on PATH). This adapter needs a reachable local ADB transport; the authenticated phone bridge alone does not provide arbitrary UI control across the internet. Release apps without `run-as` are deliberately unsupported.

The companion writes only its non-secret device UUID to its private `files/phone-control-id`. Desktop `run-as dev.ally.phone cat files/phone-control-id` matches that identity against a currently connected authenticated bridge device. Pairing tokens, app preferences and credentials are never read by this adapter. Multiple USB/Wi-Fi transports can be the same phone; always select an explicit serial and matching deviceId.

## Agent workflow

1. Call `phone_control_devices` to discover authorized transports and matching connected Ally phones.
2. Call `phone_control` with a new `requestId`, `serial`, `deviceId`, `operations: []`, and optionally `screenshot: true`. Include the exact originating `chatId` (`codex:sessionId` or `claude:sessionId`) if MCP caller context is unavailable. The user approves the actual request in that chat on a paired phone or watch, either on the card or with the notification's Allow button (after unlocking). Delivery and notification receipts do not count as consent.
3. Ally returns the target phone's foreground approval chat to the background, restoring the previous app. After a short restoration delay, the desktop reads a UI hierarchy and optionally a PNG. The result contains a `revision` and coordinate bounds.
4. Call `phone_control` with a fresh requestId, that revision as `expectedRevision`, and up to eight exact operations. The chat shows the immutable operation list before approval on either device. Each request requires a separate real approval. Supported operations are `tap`, `swipe`, `text`, `key` (`home` / `back`), and `open_app` (Android package name). Text supports basic Latin letters, digits, spaces and limited punctuation, not a full Unicode keyboard.
5. Inspect the returned UI to verify the outcome. Input delivery is not proof that an app completed a task. Use `phone_action_status` for progress and partial-completion counts; `phone_action_cancel` stops remaining work but cannot undo delivered input.

Example action payload after inspecting the screen:

```json
{
  "requestId": "phone-calc-open-001",
  "serial": "YOUR_AUTHORIZED_ADB_SERIAL",
  "deviceId": "UUID_FROM_PHONE_CONTROL_DEVICES",
  "expectedRevision": "64_HEX_CHARACTERS_FROM_INSPECTION",
  "operations": [{ "type": "open_app", "packageName": "com.google.android.calculator" }],
  "screenshot": true
}
```

## Consent and execution limits

Approval expires after two minutes, execution after sixty seconds, and the complete request after three minutes. A stale UI revision, wrong identity, disconnect/reconnect, refusal, cancellation or unavailable UI stops execution. Commands are not queued offline or replayed. Identical requestIds return status instead of repeating actions; changing their parameters is rejected. A busy device rejects competing control calls, including another transport of the same phone.

Only fixed ADB operations are accepted. Host subprocesses never use a shell, and text excludes remote-shell metacharacters and ADB percent substitutions. The executor validates parameters again and rejects out-of-bounds coordinates. Known permission, settings, password, authentication, banking and payment surfaces are refused; password fields and sensitive labels stop inspection before UI or images are returned. Known Send/Pay/Approve/Allow/Delete/Submit controls and SystemUI targets are not tapped. A screenshot is withheld if the UI changes during capture.

These checks are conservative heuristics, not a guarantee of recognizing every app or secret. Agents must hand credentials, OTP, purchases, communications, security permissions and destructive actions back to the owner. This tool does not expose arbitrary shell, message-send, Enter/submit keys, unlock, or security-prompt approval. It must never be used to approve itself. Some apps hide their UI or disable screenshots; the adapter reports failure instead of bypassing that protection.

Action history stores IDs, state, timestamps, counts and failure reasons in process memory (maximum 500 requests), without UI, screenshots or entered text. Request and result content still travels through normal agent/MCP transport and may appear in chat history. Restarting Ally clears this audit and its idempotency keys; old native approvals are connection-bound and cannot authorize work in the new process.

## Deployment and verification

Desktop integration is additive in `electron/devices/socket.ts`, using DeviceHub and the shared chat interaction broker. MCP supports PNG image content as well as text. Android shares connection-bound inline request cards, exact-chat notification routing, previous-app restoration and duplicate-tap guarding. See [chat-interactions.md](chat-interactions.md) for phone/watch decisions, unread attention and questions.

Tests cover shell injection, invalid operations, protected screens/controls, coordinate bounds, PNG validation, temporary-file cleanup, approval versus delivery, identity mismatch, stale revisions, cancellation, disconnect/reconnect, expiry, replay/parameter binding and partial-completion reporting. Physical screen/control testing requires an actual user approval; synthetic tests never press an approval button.
