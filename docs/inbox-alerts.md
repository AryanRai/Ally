# Actionable device Inbox

Phone and watch Inbox cards distinguish Questions, Approvals, Replies, Notes and Needs attention. Active requests appear before updates. Only a genuine live request can expose decision controls; reply prose mentioning permission never creates an approval. Viewing a card does not answer a request, and dismissing a notification cannot remove a live blocker.

Phone cards embed the existing real question/approval form, rich message body and available attachments. Both devices link cards and system notifications to their exact provider/session chat. Watch cards offer live fieldless decision actions; structured questions open their existing chat form. Older bare session IDs resolve only when a known chat matches uniquely. Unrecoverable or ambiguous legacy links are not guessed.

Reply delivery covers both devices. A bounded read-only feed mirrors confirmed unread completions from native Codex/Claude history, checks the exact unread revision again after loading, and ignores running tasks and user tails. It sends no model request or duplicate desktop toast. Revision-based IDs coalesce native and managed completion notices. Local viewed marks do not replace the shared chat unread acknowledgement.

Desktop verification: 24 focused reply/feed/hub/interaction tests, TypeScript and isolated Electron build passed. Android shared and isolated checks are recorded in the collaboration log. No real approval clicks, model sends or recordings are used for validation.

Deployment artifact: `%LOCALAPPDATA%/Ally/builds/inbox-hub-20261018`. It preserves the verified Circle renderer and prior seven-file attachment/timeline backend changes. `deploy-inbox.ps1` is the guarded one-time activation helper; `deployment.json` is authoritative for runtime state. A waiting state means the desktop backend has not yet switched. Queue ownership and subsequent deployment are coordinated through `agent-collaboration.md`; unfinished queue backend code is excluded from this artifact.
