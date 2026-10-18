# Unread chats

Finished replies display a blue dot in Ally desktop, phone and watch chat lists. Opening a picker or fetching history does not clear it. A client acknowledges the exact reply revision only after the latest assistant reply is visible, the conversation is foregrounded, and work has finished. A stale acknowledgement cannot clear a newer reply. Reading on one device updates the others on their next refresh.

The desktop bridge stores receipts in the existing user-data directory, in `chat-read-state.json`. Authenticated `GET /v1/read-states` returns shared receipts; `POST /v1/read-state` accepts an exact key and revision. Android assistant sheets acknowledge only actual displayed replies, not drafts or partial output. Lists retain their last known state during reconnect.

Codex integration reuses the local desktop named-pipe `thread-read-state-changed` v3 broadcasts. Bootstrap candidates are verified against a live owner snapshot; global state and databases are never rewritten. When broadcast identity and host context are available, Ally forwards read acknowledgements through the same desktop protocol. An Ally receipt still works when native forwarding context is unavailable. Turn identifiers prevent an unchanged snapshot from reopening an already-read reply after restart.

Ally-managed completions publish receipts directly. Other local sessions are observed through bounded read-only running/history checks: disappearance alone is insufficient, and completion requires a final assistant reply. Very short external Claude tasks that begin and finish between polls may be missed. Old history is not speculatively marked unread.

## Verification and activation

- Full desktop suite: 354 tests passed before the final visibility regressions and native reconciliation refinement; final focused suite: 19 tests passed across five files.
- Source and isolated TypeScript, Vite and Electron builds passed.
- Android unit tests, both debug APK builds and phone lint passed. Both APKs installed with preferences retained; assistant components and Samsung watch hold route verified.
- Read-only final-artifact native check observed one genuine unread state. No model test message, recording, approval click or synthetic production unread state was used.

The isolated deployment is `%LOCALAPPDATA%/Ally/builds/unread-chats-20261018`. It preserves the deployed tutor, phone-control and native-status functionality. Its one-time `deploy-unread.ps1` helper waits for active replies, perception capture and phone actions to settle before replacing the exact previous desktop instance. `deployment.json` records the current outcome; `waiting` means the desktop feature is not active yet. Newer concurrent deployments are left untouched. Android interaction cards being developed in another chat are outside this deployment.
