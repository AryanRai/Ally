# Android validation history

[← Companion guide](README.md)

These are historical checks from 2026-10-17, preserved from the earlier companion README. Test totals, installations, authentication observations, and deployment state describe those runs; they are not current readiness or coverage claims. See the current guide and dated feature reports for subsequent changes.

Bezel verification (2026-10-17): build and lint passed (zero errors), installed
on Galaxy Watch5 SM-R915F. Injected native rotaryencoder SCROLL events opened
replies, scrolled history in both directions, and scrolled settings, appearance
and the chat picker. Returning from nested screens restored home rotary focus;
ordinary horizontal swipes still worked. No messages or approvals were submitted.
Physical edge gestures and haptic feel require an on-wrist check with Samsung's
Touch bezel setting enabled; ADB input injection does not validate that sensor.

---

Appearance verification (2026-10-17): debug build and Android lint passed (zero errors). Installed on the Galaxy Watch 5 and checked style/palette selectors, glow and toggle settings, Back navigation, and Pixel/Ocean rendering after force-stop/relaunch. All five appearance preferences survived; Reset appearance restored Energy/Sunset, Medium glow, listening eyes on and reduced motion off. The HTTPS endpoint was preserved. No message or recording was sent during these checks.

---

Verified on 2026-10-17: an actual Codex turn initiated from the Galaxy Watch displayed “Cancel test or Continue test?”; selecting Cancel test and tapping Send answer cleared the pending request and resumed that same turn. No external action was part of this test. Desktop validation: 114 tests passed, TypeScript and Electron build passed, and both installed-Codex MCP smoke tests passed. The JSON-RPC reader now explicitly closes its private output pipes on shutdown so inherited Windows child pipes cannot keep the verification process alive.

---

## Chat selection verification (2026-10-17)

The updated APK is installed on the connected Galaxy Watch 5. Live checks covered the compact picker, both provider tabs, selecting an existing conversation, swiping to all exchanges, scrolling to older replies, Back navigation, and preserving selection after force-stopping/reopening the app. A message sent from the watch after reopening continued the same Codex session and remembered a code from the earlier turn. All six messages survived restarting the desktop bridge. Separate native Codex and Claude histories loaded without acquiring writers; history pagination returned 34 distinct messages across two pages, and chat-list pagination returned successive pages of 30.

Validation: 80 desktop tests passed, followed by the four conversation tests including an additional empty-chat pagination regression (81 total cases). TypeScript and desktop builds pass. All nine Android unit tests, Android build and lint pass. Bridge and shared voice readiness report ready. Claude history browsing works; its desktop runtime reported an invalid OAuth session during verification, so new Claude turns may require signing in again. The physical microphone was not re-tested in this change; both text and audio requests now carry the selected chat ID.

---

Reconnect verification (2026-10-17): the updated watch APK and desktop bridge were installed locally. Removing the reverse mapping and disconnecting all transports for the enrolled watch left no ADB devices connected. Ally rediscovered the watch, connected it on its advertised port, and restored the mapping automatically. The watch returned to Ready and retained the same selected chat ID. Validation: 89 desktop tests, TypeScript, Electron build, 12 Android unit tests, APK build and Android lint passed. Port changes, stale discovery, hardware identity checks, backoff and shutdown also have transport regression coverage.
