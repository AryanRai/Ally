# Shared message queue

While a chat is working, choose **Queue** to add a separate follow-up. Phone shows the stack above the composer. Watch shows **Queued · N** on the input screen and in chat history; tap it for the stack. Desktop shows the same queue above the input, including the collapsed pill.

Each entry supports **Edit**, **Cancel**, and **Send now**. Hold the handle on phone/watch and drag vertically; desktop supports dragging the handle. Desktop arrow buttons and Android accessibility actions also move entries. Attachments stay with their entry when text is edited or reordered.

Messages run individually in order after the current response. Send now steers the current response when the connection supports it, or starts the message when the chat is idle. Unsupported steering keeps the message queued. Stop pauses remaining entries for review. Neither sending a queued message nor Send now approves tools or device actions.

`electron/agent/messageQueue.ts` is the authority for all surfaces. `message-queue.json` in Ally's existing user-data directory persists entries, order and submission receipts. The authenticated `/v1/queue/{chatId}` API and desktop IPC expose redacted snapshots and revision-checked changes. A sending entry is immutable; stale edits/reorders fail and refresh instead of overwriting another device. Canceled/edited submission retries cannot restore an old message. Queue state uses the original provider/session identity; no chat forks are created.

An interrupted handoff after a desktop restart is marked unconfirmed and pauses automatic delivery. Check original history and cancel that entry before intentionally submitting a fresh message. Queued messages appear in the stack rather than as already-delivered transcript messages.

## Android assistant entry

Ally registers as an Android digital assistant. On Pixel, Android Settings → System → Gestures → Press and hold power button must select Digital assistant. Ally settings link to both assistant and gesture settings. The app does not alter these system preferences on startup.

The service supports invocation from keyguard. A neutral unlock activity requests Android's existing unlock flow before showing chat content; dismissal leaves the phone locked. Hardware assistant invocation starts the supported foreground listening flow after unlock and with microphone permission. Opening the agent monitor does not start recording. See [assistant activation](assistant-activation-routing.md) for the current speech, silence, cancellation, and routing behavior.

After an APK replacement, Android can retain Ally's selected role while its voice-interaction service has no active implementation. Merely checking the role misses this state. Check readiness and, if necessary, reselect None and then Ally through normal Android Settings. Preserve the device's existing power-button preference, pairing, and endpoint; do not rewrite assistant roles or security settings through ADB. See [the binding diagnosis](chat-open-and-assistant-binding.md).
