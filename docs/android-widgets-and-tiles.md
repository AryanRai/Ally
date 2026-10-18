# Ally Android widgets and tiles

The phone offers two home-screen widgets in the launcher's Widgets picker:

- **Ally · Agents**: resizable status summary, the most relevant chat, checked
  timestamp, manual refresh, Talk to Ally and Agents. Tapping the chat opens
  that exact conversation; Agents opens the floating monitor without listening.
- **Ally · Quick actions**: compact Talk, Agents and Inbox shortcuts.

The phone's Quick Settings editor also offers **Ally agents**. It opens the
monitor after unlock. On Wear OS, the Tiles picker offers **Ally agents**, with
agent status, the most relevant chat, and Talk/Agents/Inbox actions. Tiles and
widgets are registered by the APK; placement is chosen by the user in the
system picker, not silently changed by the app.

Status is a read-only snapshot from the shared authenticated activity feed.
The phone status widget updates on its platform schedule (30 minutes), manual
refresh, and real reply/question/reconnection events from the user's existing
opt-in device connection. Opening the floating preview also updates the shared
snapshot. The Wear tile refreshes when requested by Wear OS, with a one-minute
freshness interval. There is no extra persistent polling service, microphone
capture, agent turn or automatic approval associated with a refresh.

All snapshots show when they were checked. Failures and snapshots older than
two minutes are marked stale on the next render; retained information is not
presented as a fresh connection. Widget and tile Talk actions activate voice
only after a tap. Agents and Inbox never start recording. Existing microphone
permission and assistant selection remain required.

The message queue now uses the app's near-black surface, thin neutral border,
Geist text, mono micro-label and compact action row. Edit, Send now, remove,
drag reordering, accessible movement actions and revision validation retain
their existing behavior. Removing a queued message still cancels it.

Desktop, phone and watch recent lists no longer sample three or six chats.
Chats sort newest-created first, independently of unread badges and assistant output. Working chats retain their full dedicated list.
The activity feed includes every durable unread/attention receipt even outside
the loaded history page, while keeping only a bounded sample of quiet recent
completions. Missing older chat titles are resolved with at most two concurrent
read-only native history requests; only titles are cached in memory. None of
these reads acknowledges a notification or starts an agent. Android search
also includes unread chats outside its normal history page.

Validation includes TypeScript, desktop sidebar/activity/HTTP tests, both
Android unit suites/APK builds, manifest/resource compilation and phone lint.
Full watch lint also flags the existing manual pairing-token password field
in `DeviceInboxActivity.kt` (WearPasswordInput); that unrelated form is
unchanged. The Quick Settings tile's legacy Intent API is limited to Android
versions below 34, with the PendingIntent overload used on Android 14+.

The combined artifact remains at `Exo/.ally-assistant-monitor-validation` and
is activated by its guarded idle updater. Pairing, assistant selection, data,
other native desktop agents and Samsung's existing power-button route are
preserved. Final `deployment.json` is authoritative for installed status.
