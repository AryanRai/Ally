# Android phone and watch companions

Build from `wear-app`: `gradlew :app:testDebugUnitTest :app:assembleDebug :phone:assembleDebug`.
Install the appropriate debug APK with `adb -s SERIAL install -r APK`. This preserves pairing and selected chats. Do not use the old ADB-tunnel install script for a cloud-paired watch.

The phone uses the same HTTPS bridge and token as the watch. Its dark panels, Geist/Tanker typography, animated orb, provider selector, permission selector, and chat composer follow desktop Ally. Chats keep their existing identity; no copies or automatic forks. The watch picker has recent chats, search, and collapsible project/folder headings. Search covers loaded pages; More chats loads another page.

## Alerts and controls

Open Settings -> Connection, alerts & quiet hours (watch: Cards & device connection), save the HTTPS address and pairing token, allow notifications, and enable Keep connected. The ongoing Android notification indicates an opt-in foreground connection service. It reconnects with bounded backoff without polling an AI or consuming model tokens. The PC and its Cloudflare tunnel must be running. This is not FCM: force-stop, revoked notifications, or OS restrictions can interrupt delivery; reopen Ally to reconnect. Quiet hours are 22:00-08:00 local device time and system DND/mute is respected.

`/v1/devices/live` uses the bridge bearer token, rejects browser Origin, and bounds message size, connected clients, buffered cards, and pending commands. Perception phone/watch priorities route only to that device type; desktop/passive/silent cards remain desktop. Phone receives reply notices; watch retains its existing per-turn reply monitor. Dismissals feed back to the perception engine. Cards replay for up to ten minutes and deduplicate locally.

Registered MCP tools: `device_list`, `watch_haptic`, `watch_show_card`, `phone_notify`, `phone_open_url`, `phone_set_timer`. Commands require a real Allow once decision on the target device, expire after two minutes, fail on disconnect, and never replay offline. Full access cannot skip this approval. Multiple devices require an explicit deviceId. Browser/timer actions open their system app and report a handoff, never an unverified completed action.

## Speech and shortcuts

Voice settings include an optional speaker-label pass for realtime perception. Chirp 3 streaming continues in en-AU; a bounded in-memory en-US Recognize pass adds anonymous labels after each utterance. This costs an extra Google recognition call. Labels are scoped to the utterance, not named identities across a meeting. Failure preserves the streaming transcript. Ordinary voice input does not invoke this extra pass. `scripts/verify-diarization.mjs` runs a billed synthetic two-voice diagnostic using GOOGLE_CLOUD_PROJECT (default Orbit).

Ctrl/Cmd+R, Shift+Ctrl/Cmd+R and F5 reload with a draft/active-turn confirmation. F4 and Ctrl/Cmd+Shift+S resize; F6 toggles the sidebar. The Settings shortcut reference matches these bindings.

## Validation

TypeScript and the desktop suite cover device consent boundaries, stale/offline requests, WebSocket authentication and speech coexistence, speaker fallback/cancellation, and existing features. Android unit tests cover folder grouping/search, permission parsing, and connection recovery. Live Android validation uses the Pixel 7 and Galaxy Watch5; no personal messages need to be sent for a smoke check. Linux/macOS perception helpers remain unverified on this Windows machine.

Local services use separate ports: watch bridge18765, speech worker18766, chat-routing MCP18767 (or the next free non-reserved port). Existing MCP settings on18765/18766 migrate on launch. Existing external Claude/Codex registrations must use the new endpoint; Settings -> Agents -> Add to apps refreshes them. Isolated desktop deployments must include the sibling speech-service directory and its Python environment for local fallback.
