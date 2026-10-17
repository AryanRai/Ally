# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Concurrent work

Read and update `docs/agent-collaboration.md` before editing: Codex and Claude are working concurrently. Respect file ownership and coordinate shared integration files and Git operations there.

## What this is

Ally is an Electron overlay (`glass-pip-chat/`) that uses **Claude Code** and **Codex** CLIs as its backends, plus a Python speech service (`speech-service/`). See README.md for the feature rationale and layout.

## Commands (run in `glass-pip-chat/`)

```bash
npm run dev          # Vite + Electron
npm run typecheck    # tsc --noEmit (covers src/ and electron/)
npm run test:run     # vitest
npm run build:electron   # compiles electron/ to dist/electron (rootDir pinned)
```

## Architecture rules

- **Agents do the work.** Don't add LLM providers or a tool-calling loop to Ally; new capabilities go to the agents as MCP servers or system-prompt context (see robot mode: `src/config/robotPersona.ts` + `robotMcpUrl` in agent config).
- **Main process** (`electron/`): `main.ts` only wires modules. Window concerns live in `window.ts`; each IPC area registers itself (`agent/ipc.ts`, `ipc/context.ts`, `ipc/speech.ts`).
- **Agent backend** (`electron/agent/`): Claude CLI args in `runner.ts`, Claude JSONL → `AgentEvent` in `parsers.ts`. Codex uses the documented stdio app-server via `codexRpc.ts`, `codexRun.ts`, and `codexEvents.ts`. The opt-in `codexDesktop.ts` / `codexDesktopRun.ts` path uses desktop client coordination for existing owned chats. Prompts and Codex configuration go through stdin or framed local IPC, never command-line arguments. Add regression cases when either protocol changes.
- **Shared types**: `electron/agent/types.ts` is the source of truth; `src/types/agent.ts` re-exports it for the renderer.
- **Renderer**: `GlassChatPiP.tsx` is layout only. Chat persistence is `useChats` (wrapping `utils/chatManager.ts`); a turn is `useAgentConversation`; streaming IPC is `useAgentChat`.
- A chat's `agent` field (`provider`, `sessionId`, `cwd`) links it to a real agent session; forks keep provider/cwd but drop the session.
- **Circle to Ask** (`electron/capture/circle.ts` + `src/circle/`): hide Ally, grab the display with `desktopCapturer`, show a fullscreen overlay page, crop in physical pixels, then send `circle:ask` to the chat window. Images reach Codex as app-server `localImage` input and Claude as stream-json base64 blocks.
- **Appearance** (`src/lib/look.ts`): one persisted store for orb, palette, glow and robot options. `AgentPresence` morphs the orb into `RobotAvatar` during perception; the collapsed UI is one acrylic pill. `ipc/cursor.ts` streams the global cursor only while a visible robot needs it. Settings previews do not subscribe to this feed.

## Gotchas

- When Ally is launched from inside a Claude Code session, inherited `CLAUDE_CODE_*` env vars break the child CLI's auth; `agent/binaries.ts#childEnv` strips them.
- The Codex Store app's `codex.exe` lives under `WindowsApps`; it's found via `Get-AppxPackage`. The standard app-server cannot resume a thread owned by Codex desktop. The experimental desktop connection submits through the existing owner, with no fork or scheduled model run.
- Codex history uses read-only `thread/read` and paginated turn/item APIs in `codexHistory.ts`; browsing must never resume a thread. Do not access Codex databases directly.
- Never fork a Codex chat automatically, including on writer conflicts or legacy `exec` continuation. Preserve existing `codex-migrations.json` mappings for previously migrated chats; unsupported legacy chats must report that the original needs Codex. Do not schedule model runs to release desktop ownership.
