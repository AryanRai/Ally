# Ally

**Ally** is a glassmorphic, always-on-top desktop overlay that fronts **Claude Code** and **Codex**. The agents do the work (files, shell, MCP tools, their own sessions); Ally gives them a floating glass window you can summon from anywhere, plus voice and robot integration they don't have on their own.

<img width="481" height="214" alt="Ally overlay" src="https://github.com/user-attachments/assets/f2e88fcf-58c6-447f-b384-19a7c1efbbb1" />

## What Ally adds on top of the agents

| Feature | Why it's here |
|---|---|
| **Glass PiP overlay**: always on top, `Ctrl+Shift+C` from anywhere, collapses to a pill, tray icon | Claude's Quick Entry is macOS-only; Codex has no overlay |
| **One window for both agents**: pick Claude Code or Codex (and a model) per chat | The two apps are otherwise separate |
| **Agent sessions browser**: continue any Claude Code / Codex session in Ally | Ally chats *are* real agent sessions, resumed by id |
| **Voice loop**: speech in, spoken replies out, barge-in | Claude Code only dictates; it never speaks replies |
| **Circle to Ask**: `Ctrl+Shift+Space` (or shake the cursor) freezes the screen; circle anything, then Ask / Search web / Explain / Fix / Copy text / Translate | Pixel-style Circle to Search, but the circled pixels go straight to Claude Code or Codex as an image |
| **Robot avatar**: collapsing turns Ally into a little robot ([agent-robot-avatar](https://github.com/CX-ArtLab/agent-robot-avatar)) whose eyes follow your cursor anywhere and whose face shows what the agent is doing | Ambient status without a window in the way |
| **Clipboard context**: copy something, hit *Explain* | Quick capture without switching windows |
| **Robot mode**: DroidCore persona + the HowYouSeeMe MCP server handed to the agent | Lets either agent see through the robot |

Retired in v2 (the agents now cover them): Ally's own Ollama/OpenRouter/Gemini chat, its homemade MCP/ACP/PTC tool loop, Supabase sync + web build + `ally-remote-service`/Discord (use Claude Code Remote Control/Channels or Codex Remote), the terminal panel, and the browser extension.

## Layout

```
glass-pip-chat/          Electron + React app
  electron/
    main.ts              app lifecycle + global hotkeys
    window.ts            the PiP window, bounds, tray, theme
    agent/               Claude Code / Codex backend
      binaries.ts          find the CLIs (incl. the Codex Store app's bundled codex.exe)
      runner.ts            spawn a turn, stream events, stop
      parsers.ts           CLI JSONL → shared AgentEvent stream
      sessions.ts          list/load existing sessions, models
      ipc.ts               `pip.agent.*` IPC + agent-config.json
    capture/             Circle to Ask overlay window + shake-to-summon detector
    ipc/                 clipboard context, speech bridge, global cursor feed
    speech/client.ts     WebSocket client for speech-service
  src/
    components/          GlassChatPiP shell, AvatarMode, headers, messages, settings
    circle/              the Circle to Ask overlay page (circle.html)
    hooks/               useChats, useAgentConversation, useAgentChat,
                         useSpeechService, useContextMonitoring, useKeyboardShortcuts…
    config/robotPersona.ts
speech-service/          Python STT/TTS service (Deepgram/ElevenLabs, Whisper/Coqui fallback)
```

## Running

```bash
cd glass-pip-chat
npm install
npm run dev
```

Requirements: the `claude` CLI (`npm i -g @anthropic-ai/claude-code`, then run `claude` once to log in) and/or Codex (the Codex desktop app's bundled CLI is found automatically, or `npm i -g @openai/codex`). Set CLI paths, the default working folder, permissions and the robot MCP URL in **Settings → Agents**.

Voice: start `speech-service` (`speech-service/start.ps1`), then toggle voice mode in the overlay.

## How a turn works

1. The chat's agent and working folder are shown under the input; the first message starts a new agent session (earlier non-agent turns are handed over as a transcript).
2. `electron/agent/runner.ts` runs `claude -p --output-format stream-json …` or `codex exec --json …`, prompt over stdin, follow-ups via `--resume` / `exec resume`.
3. The parser turns the JSONL stream into text / thinking / tool events, rendered live as inline tool pills.
4. Permissions map to `--permission-mode` (Claude) and the sandbox mode (Codex): read-only, can edit, or full access.

## Development

```bash
npm run typecheck   # tsc over src + electron
npm run test:run    # vitest (chat store, stream parsers, shake detector, orb)
npm run build       # renderer + electron + installer
```
