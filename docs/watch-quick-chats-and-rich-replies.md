# Watch quick chats and rich replies

From the orb, swipe up on the bottom **Swipe up · Chats** handle, or tap the handle or chat title. The compact switcher lists running chats from both providers, followed by up to six recent chats from Codex and Claude. Running chats are not duplicated in Recent, and selection always uses the exact chat ID. The top-right menu and bottom **All chats** button open the existing provider/search/folder library. Back returns to the switcher; selecting a chat returns to its orb. Left swipe still opens the conversation.

The switcher refreshes running status every five seconds and recent catalogs every fifteen seconds while visible and foregrounded. Passive selected-history refresh pauses while menus are open so it cannot briefly disable or move the list. Existing watch-owned turn, recording, approval and unsent-input protections still govern switching; opening the picker does not stop a task or submit a prompt. Work running in another client can be selected and observed through the existing live-status path.

Assistant replies, streaming text, card titles/bodies and checklist items now render Markdown headings, emphasis, lists, quotations, code and web links. CommonMark handles nested formatting and reference links. Code scrolls horizontally; tables become narrow labeled records with every cell and link retained. Images are presented as links using their alternative text. HTML is displayed as text. The existing answer cards, actions, timers and compact Read aloud footer remain in answer order.

Tapping a web link opens its full address with **Open on phone** (Wear RemoteActivityHelper), **Open on watch**, and Back. Phone handoff failures are shown with a watch-browser fallback. Only HTTP/HTTPS links become actions; local files and executable URL schemes remain noninteractive. Opening the chooser itself does not launch a browser or send a message.

## Validation

- All 28 watch unit tests and the debug APK build pass. Seven new cases cover exact IDs across providers, running/recent deduplication, ordering, nested formatting, reference/bare/image links, table values, code and unsupported URL schemes, and incomplete streamed Markdown.
- Watch lint still reports the existing `WearPasswordInput` error twice for the same masked pairing-token field in `device-common/DeviceInboxActivity.kt:30`. No new lint errors were introduced; token masking is retained.
- Installed using `adb install -r`, retaining pairing, preferences and selected chat. No desktop restart, phone update, microphone recording, real approval or model verification prompt is required.
- On the actual Watch5: verified bottom swipe, running/recent rows, selection of an existing recent chat, full-library menu/search, returning to the orb and left-swipe history. An existing GitHub PR link appeared blue and underlined and opened the correct full-address chooser. Phone/watch browser launches were not triggered. The original selected chat was restored through the full picker and the watch returned to its orb; no Android crash was logged.
