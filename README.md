# Ally – Unified Robot Cognitive Overlay

**Ally** is a **glassmorphic, picture-in-picture desktop overlay** that provides advanced access to local and remote LLMs, a comprehensive tool calling framework, MCP/ACP agent coordination, and seamless integration with the **Comms v4.0 Unified Robot Cognitive Overlay Platform**.

<img width="481" height="214" alt="image" src="https://github.com/user-attachments/assets/f2e88fcf-58c6-447f-b384-19a7c1efbbb1" />

It runs as a floating, always-on-top Electron app with Apple-style glass UI, animated interactions, and support for **three AI providers**: local Ollama models, cloud models via OpenRouter, and Google Gemini. All chats are logged to **Supabase** (PostgreSQL), enabling persistent conversation history, analytics, and direct robot control through the unified tool calling framework. A companion **Next.js web service** (`ally-remote-service`) provides remote access from any browser or Discord.

<img width="867" height="704" alt="image" src="https://github.com/user-attachments/assets/1479ae38-7df5-4682-a35f-0e46c729a64d" />

---

## About

Ally is designed as both a **personal AI assistant** and a **robot control console**:
- **As a desktop overlay:** quick access to AI chat, search, and task automation without switching windows.
- **As part of DroidCore:** acts as the human-facing "head" of the robot, providing vision, language, and speech interfaces.

<img width="480" height="450" alt="image" src="https://github.com/user-attachments/assets/85a65d19-8c13-430a-9b9e-6b38c196af9b" />

It is ideal for:
- Rapid natural-language queries and responses via local or cloud LLMs.
- On-the-fly tool execution (filesystem operations, browser control, system commands).
- Sending structured tool calls and robot intents to the DroidCore control stack.
- Remote AI access from a web browser or Discord bot.

---

## Core Features

### Glass PiP Overlay
- **Apple-style glassmorphism:** frosted blur, subtle gradients, rounded corners, hairline borders.
- **Motion-rich interactions:** drag, snap to corners, elastic resize, collapse into a pill, animated open/close.
- **Keyboard accessible:** focus ring, `Esc` to close, `Ctrl+Shift+C` / `Cmd+Shift+C` to toggle.
- **Persistent layout:** remembers window position, size, and theme between sessions via Electron `userData`.
- **System tray:** minimize to tray with right-click menu for quick access.
- **Dark/light theme:** persisted theme preference.

<img width="397" height="622" alt="image" src="https://github.com/user-attachments/assets/701ac206-1e5d-4148-a32b-4ba484079020" />

### AI Integration — Triple Provider Support
- **Ollama (local):** Connects to `http://localhost:11434` for fully offline, low-latency inference. Default model: `llama3.2`.
- **OpenRouter (cloud):** Access to 100+ models including Claude, GPT-4, Gemini, Mistral, and more. Default: `anthropic/claude-3.5-sonnet`.
- **Google Gemini:** Native integration via `@google/genai`. Default: `gemini-2.0-flash`.
- **Seamless switching:** Change provider and model at runtime from the settings panel.
- **Streaming output:** tokens rendered in real-time with smooth animations.
- **Thinking process display:** real-time thinking/reasoning visualization during inference.
- **Custom system prompts:** switchable personas via the System Prompts Editor.
- **Provider config persistence:** provider settings are saved across restarts.

<img width="401" height="625" alt="image" src="https://github.com/user-attachments/assets/3f9eb11b-9d17-4eff-a549-76e4f5cc45db" />

### Chat Logging & Remote Sync
- **Supabase backend:** all messages are stored in Supabase (PostgreSQL) for persistence, retrieval, and analytics.
- **Real-time subscriptions:** Supabase Realtime for live message delivery between desktop and web.
- **Remote message polling:** desktop Ally polls Supabase for messages sent from the remote web service.
- **Session management:** full chat session CRUD with history retrieval.
- **Secure:** Supabase RLS policies, HTTPS enforced.

### Speech Integration
- **Speech-to-Text:** OpenAI Whisper with Voice Activity Detection (VAD) for accurate, real-time voice recognition.
- **Text-to-Speech:** Coqui TTS (`tts_models/en/jenny/jenny`) for natural speech synthesis.
- **ggwave Communication:** audio-based data transmission protocol for robot communication.
- **WebSocket Service:** separate Python service (`ws://localhost:8765`) for GPU-accelerated speech processing.
- **Voice Commands:** hands-free interaction — press `Ctrl+Shift+V` to toggle.

### Tool Calling Framework
- **TypeScript Framework** (`tool-calling-framework/`): standalone package (`@droidcore/tool-calling-framework`) for registering, validating, and orchestrating tools.
- **Tool Registry:** dynamic registration with metadata, security levels, and capability discovery.
- **Tool Executor:** async execution with configurable timeouts, retry policies (linear/exponential/fixed backoff), and error recovery.
- **Tool Manager:** multi-tool workflow orchestration with dependency resolution, context passing, and audit logging.
- **Schema Validation:** JSON schema validation for all tool definitions and execution requests.
- **Agentic Loop:** `agenticToolService` enables the AI to call multiple tools sequentially until the task is complete, with inline status pills in the UI.
- **PTC Executor:** Programmatic Tool Calling — the LLM writes a JS script that calls all needed tools in a sandboxed `AsyncFunction`, reducing multi-tool tasks to just 2 LLM calls instead of N+1.

<img width="394" height="633" alt="image" src="https://github.com/user-attachments/assets/e5cd9523-410e-4890-ba52-8c7c68870871" />

### MCP & ACP Agent Integration
- **MCP Client:** Model Context Protocol client (`mcpClient.ts`) that discovers and calls tools from any MCP-compatible server process (spawned via stdio).
- **MCP Integration Service:** manages MCP server lifecycle, tool discovery, and routing of tool calls to the correct server.
- **ACP Integration:** Agent Coordination Protocol (`acpIntegrationService.ts`) enables multi-agent coordination — register external agents with endpoints, query them with context, and aggregate results.
- **Unified Tool Integration:** `unifiedToolIntegrationService.ts` combines local tools, MCP tools, and ACP agents into a single interface for the chat UI.
- **MCP/ACP Dashboard:** built-in `MCPACPDashboard` component for live status, tool discovery, and manual test calls.

### Browser Bridge & Filesystem Tools
- **Browser Bridge Server:** WebSocket server (`browserBridgeServer.ts`) that allows the Electron main process to send tool calls to a browser extension for web automation.
- **Filesystem Tools:** MCP-compatible tools for `list_directory`, `read_file`, `write_file`, `create_directory`, `delete_file`, and more — all routed safely through Electron IPC.
- **Clipboard Monitoring:** Electron main process monitors clipboard changes and surfaces context to the AI.

### Remote Web Service (`ally-remote-service`)
- **Next.js 14 web app:** hosted on Vercel, provides a browser-based chat interface to your local Ally system.
- **Supabase Auth:** email/password authentication with server-side SSR.
- **Message routing:** web messages are stored in Supabase; the local Ally system polls and processes them, then stores the response.
- **Discord bot integration:** `/api/discord` endpoint for slash commands; Discord users can chat with Ally directly.
- **Device pairing:** `/pair` pages for linking new local systems to a Vercel deployment.
- **System monitoring:** `/api/systems` for heartbeat-based online/offline status of connected local systems.

### Accessibility & Context Monitoring
- **Accessibility Service:** exposes screen reader and UI automation hooks.
- **Context Monitor:** `AccessibilityContextMonitor` component tracks active application context and surfaces it to the AI.
- **Grammarly conflict fix:** automatic detection and suppression of browser extension attribute conflicts.
- **Error Recovery:** `unified-error-recovery.ts` auto-detects and recovers from auth issues, extension conflicts, network errors, and stream failures.

### Shared Services
- **`shared-config.js`:** unified configuration object compatible with both Next.js (`process.env`) and Vite (`import.meta.env`).
- **`shared-types.ts`:** cross-service TypeScript interfaces — `UnifiedMessage`, `UnifiedChatSession`, `UnifiedAuthState`, `UnifiedLocalSystem`, and legacy-format converters.
- **`unified-auth-service.ts`:** singleton Supabase auth service with local system registration, heartbeat, and observable auth state.
- **`unified-message-service.ts`:** message send/receive, real-time Supabase subscriptions, session management, and legacy format conversion.
- **`unified-error-recovery.ts`:** automatic error detection (auth, network, stream, extension conflicts) with recovery strategies.

---

## Architecture Overview

```
+------------------------------------------------------------------+
|                   Desktop User (Local)                           |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|               glass-pip-chat  (Electron + React)                 |
|  +------------------+  +---------------+  +------------------+  |
|  | Glassmorphic     |  | AI Providers  |  | Tool Calling     |  |
|  | PiP Overlay UI   |  | - Ollama      |  | - Agentic Loop   |  |
|  | (React/Framer)   |  | - OpenRouter  |  | - PTC Executor   |  |
|  +--------+---------+  | - Gemini      |  | - MCP Client     |  |
|           |            +---------------+  | - ACP Agents     |  |
|           |                              | - FS Tools        |  |
|           |            +---------------+  +------------------+  |
|           |            | Speech Svc    |                         |
|           |            | (WebSocket)   |                         |
|           |            +---------------+                         |
+-----------|------------------------------------------------------+
            | Electron IPC (preload bridge)
            v
+------------------------------------------------------------------+
|                    Electron Main Process                         |
| - Window/tray management       - Clipboard monitoring           |
| - Provider config persistence  - Browser Bridge WebSocket       |
| - Filesystem IPC handlers      - Global shortcuts               |
+----------------------------------+-------------------------------+
                                   |
                    +--------------v--------------+
                    |    Supabase Backend         |
                    |  - PostgreSQL DB            |
                    |  - Auth / RLS               |
                    |  - Realtime subscriptions   |
                    +--------------+--------------+
                                   |
                    +--------------v-----------------------------+
                    |  ally-remote-service (Next.js / Vercel)   |
                    |  - Web chat UI                            |
                    |  - Supabase SSR auth                      |
                    |  - Message routing API                    |
                    |  - Discord bot endpoint                   |
                    |  - System pairing & monitoring            |
                    +-------------------------------------------+
                                   |
                    +--------------v--------------+
                    |  Web / Discord Users        |
                    +-----------------------------+
```

---

## Repository Structure

```
Ally/
+-- glass-pip-chat/               # Electron desktop overlay
|   +-- electron/
|   |   +-- main.ts               # Main process (window, tray, IPC, shortcuts)
|   |   +-- preload.ts            # Secure IPC bridge to renderer
|   +-- src/
|   |   +-- App.tsx               # Root React component
|   |   +-- components/           # UI components
|   |   |   +-- GlassChatPiP.tsx  # Main overlay component
|   |   |   +-- UnifiedChatInterface.tsx
|   |   |   +-- Enhanced3DOrb.tsx
|   |   |   +-- ProviderSettings.tsx
|   |   |   +-- SpeechControls.tsx
|   |   |   +-- RemoteControlPanel.tsx
|   |   |   +-- chat/             # Chat sub-components (input, headers, tool status)
|   |   |   +-- ...               # Auth, accessibility, settings components
|   |   +-- services/             # Business logic
|   |   |   +-- ollamaService.ts       # Ollama + OpenRouter + Gemini client
|   |   |   +-- agenticToolService.ts  # Agentic tool-use loop
|   |   |   +-- ptcExecutor.ts         # Programmatic Tool Calling (2-call pattern)
|   |   |   +-- mcpClient.ts           # MCP protocol client
|   |   |   +-- mcpIntegrationService.ts
|   |   |   +-- acpIntegrationService.ts  # ACP multi-agent coordination
|   |   |   +-- filesystemTools.ts     # MCP-compatible FS operations
|   |   |   +-- browserBridgeServer.ts # Browser automation WebSocket
|   |   |   +-- speechService.ts       # Speech WebSocket client
|   |   |   +-- remoteMessagePoller.ts # Supabase message polling
|   |   |   +-- supabaseChatSync.ts    # Chat history sync
|   |   |   +-- allyRemoteClient.ts    # Remote service connector
|   |   |   +-- ...                    # More services
|   |   +-- hooks/                # React custom hooks
|   |   +-- stores/               # Zustand state management
|   |   +-- types/                # TypeScript definitions
|   |   +-- utils/                # Utilities (platform detection, etc.)
|   |   +-- styles/               # Tailwind CSS / global styles
|   +-- .env.example              # Environment variable template
|   +-- vite.config.ts            # Vite dev config
|   +-- electron-builder.json     # Desktop packaging config
|   +-- package.json
|
+-- ally-remote-service/          # Next.js web service (deploy to Vercel)
|   +-- src/app/
|       +-- page.tsx              # Home page
|       +-- chat/page.tsx         # Browser chat interface
|       +-- pair/                 # Device pairing UI
|       |   +-- discord/          # Discord OAuth flow
|       +-- api/
|           +-- messages/route.ts    # Message CRUD
|           +-- sessions/route.ts    # Session management
|           +-- systems/route.ts     # Connected system monitoring
|           +-- auth/callback/       # Supabase auth redirect
|           +-- discord/route.ts     # Discord slash commands
|           +-- discord/deliver/     # Push message to Discord
|           +-- link/route.ts        # Link local system
|
+-- speech-service/               # Python WebSocket STT/TTS service
|   +-- speech_service.py         # Main service (Whisper + Coqui TTS + ggwave)
|   +-- requirements.txt          # Python dependencies
|   +-- start.bat / start.sh / start.ps1
|
+-- tool-calling-framework/       # Standalone TypeScript tool framework
|   +-- src/
|       +-- index.ts              # Factory: createToolCallingFramework()
|       +-- types/                # ToolDefinition, ExecutionRequest, WorkflowPlan
|       +-- registry/             # ToolRegistry
|       +-- executor/             # ToolExecutor (retry, timeout, validation)
|       +-- manager/              # ToolManager (workflow orchestration)
|       +-- schemas/              # JSON schemas
|       +-- utils/validation.ts
|       +-- __tests__/
|
+-- docs/
|   +-- REMOTE_INTEGRATION_GUIDE.md
|   +-- Anthropic_PTC.md
|   +-- Open_PTC.md
|
+-- shared-config.js              # Cross-service config (Next.js + Vite compatible)
+-- shared-types.ts               # Cross-service TypeScript interfaces
+-- unified-auth-service.ts       # Singleton Supabase auth + local system heartbeat
+-- unified-message-service.ts    # Message send/receive + Realtime subscriptions
+-- unified-error-recovery.ts     # Auto error detection and recovery
```

---

## Core Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Desktop runtime** | Electron 31 | Native app, system tray, global shortcuts |
| **UI framework** | React 18 + TypeScript | Component model |
| **Web framework** | Next.js 14 | Remote service + API routes |
| **Styling** | Tailwind CSS + Framer Motion | Glassmorphic UI + animations |
| **Local LLM** | Ollama (`llama3.2` default) | Fully offline inference |
| **Cloud LLM** | OpenRouter (`claude-3.5-sonnet` default) | 100+ cloud models |
| **Cloud LLM** | Google Gemini (`gemini-2.0-flash` default) | Gemini model family |
| **Speech STT** | OpenAI Whisper | Offline speech-to-text |
| **Speech TTS** | Coqui TTS (jenny) | Neural text-to-speech |
| **Audio protocol** | ggwave | Audio-based data transmission |
| **Agent protocol** | MCP (Model Context Protocol) | Tool discovery from external servers |
| **Agent protocol** | ACP (Agent Coordination Protocol) | Multi-agent query routing |
| **Tool execution** | PTC (Programmatic Tool Calling) | 2-call multi-tool pattern |
| **Database** | Supabase (PostgreSQL) | Persistence + Realtime |
| **Authentication** | Supabase Auth | Email/password, SSR |
| **Builds** | Vite, tsc, electron-builder | Dev + production builds |
| **Tests** | Vitest | Unit + integration tests |

---

## Roadmap

- [X] **M0 – UI Prototype**: glass PiP component with animations.
- [X] **M1 – Electron Shell**: window vibrancy, bounds persistence, shortcut toggle, system tray.
- [X] **M2 – Ollama Integration**: local LLM streaming with real-time thinking display.
- [X] **M3 – Speech Integration**: STT (Whisper), TTS (Coqui), and ggwave via Python WebSocket service.
- [X] **M4 – Tool Calling Framework**: complete TypeScript tool execution system with validation, retry, and workflow orchestration.
- [X] **M5 – ACP/MCP Integration**: multi-agent coordination via ACP and tool discovery via MCP protocol.
- [X] **M6 – Remote Service & Chat API**: Next.js web app with Supabase storage, real-time sync, and Discord bot.
- [X] **M7 – Multi-provider AI**: Ollama + OpenRouter + Gemini with runtime switching and persistent config.
- [X] **M8 – PTC Executor**: Programmatic Tool Calling — N tools in 2 LLM calls via sandboxed JS execution.
- [ ] **M9 – Browser Automation**: full browser control via Browser Bridge extension integration.
- [ ] **M10 – Packaging**: cross-platform builds, code signing, autoupdate via electron-builder.

---

## Quick Start

### Prerequisites
- Node.js 18+
- [Ollama](https://ollama.ai) installed and running (for local models)
- Python 3.9+ with GPU support (optional, for speech service)
- A [Supabase](https://supabase.com) project (optional, for remote sync)

### 1. Launch the Desktop Overlay

```bash
cd glass-pip-chat
cp .env.example .env        # Fill in your Supabase credentials (optional)
npm install
npm run dev
```

This starts both the Vite dev server and the Electron shell. The overlay will appear as a floating window.

**Keyboard shortcuts:**
- `Ctrl+Shift+C` / `Cmd+Shift+C` — toggle overlay
- `Esc` — hide overlay
- `Ctrl+Shift+V` — toggle speech controls
- `Ctrl+Shift+I` — open integration test panel *(dev)*
- `Ctrl+Shift+P` — open provider test panel *(dev)*

### 2. (Optional) Start the Speech Service

```bash
cd speech-service
# Windows
start.bat
# macOS/Linux
./start.sh
# PowerShell (cross-platform)
pwsh start.ps1
```

Then in the overlay, press `Ctrl+Shift+V` and click **Connect** to link with the speech service at `ws://localhost:8765`.

### 3. (Optional) Deploy the Remote Web Service

```bash
cd ally-remote-service
cp .env.example .env        # Fill in Supabase + Discord credentials
npm install
npm run dev                 # Local dev at http://localhost:3000
```

For production, deploy to Vercel and set the environment variables in the Vercel dashboard.

### 4. (Optional) Build the Tool Calling Framework

```bash
cd tool-calling-framework
npm install
npm run build               # Compiles TypeScript to dist/
npm run test                # Run Vitest test suite
```

See [docs/REMOTE_INTEGRATION_GUIDE.md](docs/REMOTE_INTEGRATION_GUIDE.md) for full remote setup instructions.

---

## Environment Variables

### `glass-pip-chat/.env`
```bash
# Supabase (required for remote sync)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_SUPABASE_SECRET_KEY=your_service_key

# Local system identity
VITE_LOCAL_SYSTEM_ID=ally-desktop-system
VITE_LOCAL_SYSTEM_NAME=Ally Desktop System

# Remote service URL (your Vercel deployment)
VITE_REMOTE_SERVICE_URL=https://your-ally-remote.vercel.app
VITE_ENABLE_REMOTE=true

# LLM endpoints
VITE_OLLAMA_BASE_URL=http://localhost:11434
VITE_SPEECH_SERVICE_URL=ws://localhost:8765
VITE_STREAM_HANDLER_URL=ws://localhost:8766

# Feature flags
VITE_ENABLE_SPEECH=true
VITE_ENABLE_TOOLS=true
VITE_TOOL_CALLING_ENABLED=true
VITE_UNIFIED_INTEGRATION_ENABLED=true

# Tool limits
VITE_MAX_TOOL_CALLS=5
VITE_TOOL_CALL_TIMEOUT=30000
```

### `ally-remote-service/.env`
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_anon_key
SUPABASE_SECRET_KEY=your_service_key

# Discord bot (optional)
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_APPLICATION_ID=your_app_id
DISCORD_PUBLIC_KEY=your_public_key

# Next.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret
NEXT_PUBLIC_DOMAIN=your-ally-domain.vercel.app
```

---

## License
[Apache-2.0 License](LICENSE)

---

## Credits
Developed as part of the **DroidCore** robotics platform, extending Ally into a real-world AI-driven assistant.
