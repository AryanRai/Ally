# Notch chat integration — 26 October 2026

The running desktop was started from `Ally/glass-pip-chat`, whose compiled renderer
was dated 17 October. Other chats recorded newer composer and drawing fixes in
`../.ally-drawing-resize-20261020`. The current source includes the guarded draft
storage and resizable drawing panel; rebuilding that source retains those fixes.

The new isolated desktop build is
`../.ally-notch-sync-20261026/glass-pip-chat`. Its parent contains a desktop-only
`start-ally.ps1`, source/artifact manifests, and validation logs. Existing processes
and previous frozen builds were retained. This build must be used together with
the updated private connector for shared selection; rebuilding a renderer alone
cannot add the main-process bridge API.

The failed “Explain this. this image” turn in **Continue MECH5720 Lab 1** contained
only text. The native client sends its primary image in top-level `screenshot`,
while the connector previously read `live_state.screenshot`. The adapter now reads
the native field, retains attached images and other screens, and uploads their
bytes through Ally's existing attachment route. Textual live state is preserved
as text. Invalid image payloads fail explicitly.

The authenticated bridge and guarded desktop IPC now share one versioned selection
state. Selecting an existing native chat in either interface selects the same
provider/session in the other. A delayed history read cannot replace a newer
choice. A native turn snapshots its target so later navigation cannot redirect
that turn or its cancellation. New notch chats become openable on the desktop
when their first accepted turn supplies a real provider session ID; no session
IDs are fabricated for empty chats. Permissions remain explicit per interface.

Native study turns request the native speech/drawing format on the selected agent.
The connector preserves valid fenced programs and safely quotes ordinary prose as
speech. It never executes generated programs. Screen/environment context reaches
the same turn without image base64 in the text prompt. This does not implement all
backend features: routines, autonomous jobs, integration endpoints and 3D drawing
still lack full parity. It is not a claim that every native feature works.

Desktop discovery now exposes cursor-based Load more instead of stopping at 80
sessions. Codex retains small five-row native requests and separate read lanes.
Successful refreshes retain loaded older pages, and transient provider failures
keep existing rows with a visible retry. Recents and project groups use latest
activity; the bridge also orders by activity rather than original creation.

Verification: 52 focused checks and TypeScript pass. The full suite passed 588
tests with four opt-in tests skipped and one filesystem timeout; all nine checks
in that file passed on its focused rerun. The private connector passes 22 checks;
embedded renderer TypeScript/build and isolated desktop Vite/Electron builds pass.
No real model message, microphone recording or new screen capture was used.
Runtime interaction and complete feature parity remain unverified.
