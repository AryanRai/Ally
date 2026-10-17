# Chat integration follow-up

Two separate issues remain after the watch and speech update. Neither is fixed by that update.

## 1. Ally-created Codex chats are absent from Codex's normal chat list

Ally currently launches normal Codex turns using `codex exec --json` in `electron/agent/runner.ts`. The conversation is persisted, but its source is `exec`. Codex's default app-server thread listing filters to interactive sources. Reading the affected conversation by ID works; its history has not disappeared.

Move normal Codex conversation execution to the documented app-server protocol, while retaining Claude's existing backend. Preserve streaming text, readable reasoning, tool activity, images, plans, diffs, usage, cancellation, permissions, model selection and robot MCP configuration. Keep auxiliary greetings ephemeral.

Existing sessions require deliberate compatibility handling: a local probe confirmed that `thread/resume` preserves an old `exec` source. Do not assume that resuming alone makes an old chat visible. Prefer supported APIs, preserve original history, and verify any migration is idempotent. Do not edit Codex's database or pretend Ally is another first-party client to force visibility.

The installed app-server probe created a new ephemeral thread with source `vscode`; verify persisted production chats in the actual desktop listing. Also verify continuation from each app, writer ownership, restart recovery and live history updates. Avoid taking a writer merely to browse history.

Reference: https://developers.openai.com/codex/app-server

## 2. Ally's combined sidebar makes engines and working folders ambiguous

Ally combines Claude Code and Codex sessions under working-directory groups. A group named after the user's home directory can therefore appear even though no corresponding saved Codex project exists. This is distinct from issue 1.

Make engine identity clear for every chat, including Ally-created chats, and distinguish working-folder groups from saved projects. Use a clear provider grouping/filter or equivalent familiar UI, consistent labels and an understandable home-folder label. Preserve existing chats, selection, session links and live updates. Do not represent a Claude chat as a native Codex conversation.

## Relevant code

- `glass-pip-chat/electron/agent/runner.ts`, `binaries.ts`, `parsers.ts`, `sessions.ts`, `sessionWatch.ts`, `ipc.ts`
- `glass-pip-chat/src/hooks/useAgentChat.ts`, `useAgentConversation.ts`, `useSessionSync.ts`, `useChats.ts`
- `glass-pip-chat/src/utils/chatManager.ts` and sidebar/chat components

Current storage links Ally chats to engine session IDs. Preserve those links or explicitly update them after a supported migration. App-server's newer history storage may require API-based history reads rather than relying solely on JSONL files.

## Baseline validation

Before these follow-up changes: 58 desktop tests and TypeScript pass; Vite/Electron builds pass; six Python tests and six Android tests pass; Android build and lint pass. The updated app has been restarted and speech/bridge health checks are ready. Physical microphone accuracy, acoustic interruption and the full watch microphone-to-agent loop still need live verification.
