# CLAUDE.md

Guidance for Claude Code when working in this repository.

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
- **Agent backend** (`electron/agent/`): CLI args in `runner.ts`, JSONL → `AgentEvent` in `parsers.ts` (unit-tested in `parsers.test.ts`; add a case when a CLI's output changes). Never pass prompts on the command line — they go over stdin; long extra context goes through temp files.
- **Shared types**: `electron/agent/types.ts` is the source of truth; `src/types/agent.ts` re-exports it for the renderer.
- **Renderer**: `GlassChatPiP.tsx` is layout only. Chat persistence is `useChats` (wrapping `utils/chatManager.ts`); a turn is `useAgentConversation`; streaming IPC is `useAgentChat`.
- A chat's `agent` field (`provider`, `sessionId`, `cwd`) links it to a real agent session; forks keep provider/cwd but drop the session.
- **Circle to Ask** (`electron/capture/circle.ts` + `src/circle/`): hide Ally, grab the display with `desktopCapturer`, show a fullscreen overlay page, crop in physical pixels, then send `circle:ask` to the chat window. Images reach Codex via `-i` (must precede other flags; it is variadic) and Claude via `--input-format stream-json` base64 blocks.
- **Appearance** (`src/lib/look.ts`): one persisted store for orb, palette, glow and robot options. `AgentPresence` morphs the orb into `RobotAvatar` during perception; the collapsed UI is one acrylic pill. `ipc/cursor.ts` streams the global cursor only while a visible robot needs it. Settings previews do not subscribe to this feed.

## Gotchas

- When Ally is launched from inside a Claude Code session, inherited `CLAUDE_CODE_*` env vars break the child CLI's auth; `agent/binaries.ts#childEnv` strips them.
- The Codex Store app's `codex.exe` lives under `WindowsApps`; it's found via `Get-AppxPackage`. A thread open in the Codex app can't be resumed from Ally at the same time.
- Newer Codex-app threads keep history in SQLite, so importing them shows a placeholder message; resuming still works.
