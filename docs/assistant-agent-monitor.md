# Compact assistant agent monitor

The phone and watch assistant previews show a single 28 dp status row. It gives
active/completed counts, prioritizing questions or errors when they need
attention. Tap the row to expand a scrollable list; tap a conversation to switch
the same preview to that exact chat and show its reply. Selecting never submits
a message, stops an agent, forks a chat or answers an approval.

The phone shows about three list rows at once and the watch two. On the watch,
the expanded monitor replaces the voice dock and reply preview to keep the
window within the display. Collapse the row or select a chat to return to the
normal dock. Routing options remain independently scrollable. Activity polling
runs every four seconds only while the preview is visible. The selected chat's
existing read-only refresh and accepted-turn polling keep its reply current.

An **Agent monitor** entry in the phone navigation drawer and watch settings
opens this same window without activating the microphone. Hardware activation
retains automatic listening; entering the monitor cancels that capture. Any
unfinished transcribed request remains saved for a later explicit decision.

`GET /v1/assistant/activity` uses the paired bridge authentication. It merges:

- Current desktop Claude/Codex activity and managed per-chat turns.
- Actual pending questions/approvals, labelled Needs input.
- Explicit recent lifecycle endings, labelled Completed, Stopped or Error.

Completed means the agent response ended, not that every requested task was
successful. A missing or stale running entry is never classified as completion.
Claude uses final stop reasons and explicit interruption/API-error records;
Codex uses task_complete/turn_aborted. Existing exact-session read-only scanning
is reused, without additional agent turns, chat-history writers or transcript
copies. Terminal rows are retained for at most 30 minutes while observed; the
initial native scan includes recent files. Up to eight recent terminal rows
appear after all currently active and unread rows. Every unread or pending
notification remains listed even outside the recent window; it is not subject
to a three-chat or eight-row sample cap.

Listing does not acknowledge unread replies. The existing exact-revision
receipt is acknowledged only when the selected reply is visible. On connection
failure, the summary reports status unavailable and retained rows say Last seen;
they are not presented as live status.

Validation covers native lifecycle parsing, stale turns, exact session alias
merging, attention states, endpoint authentication/read-only behavior, Android
parsing/reconnect labels, TypeScript and both Android APKs. The isolated update
at `Exo/.ally-assistant-monitor-validation` preserves the deployed renderer and
voice-routing implementation. Its updater waits for replies to finish before
restarting the exact predecessor and updating the paired phone/watch with data
preserved. Monitor-only UI captures are collected after activation where the
assistant is visible; capture existence alone is not visual verification.
