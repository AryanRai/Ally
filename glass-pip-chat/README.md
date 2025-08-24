# Glass PiP Chat – DroidCore UI Bridge

Apple-style glassmorphic, picture-in-picture chat window (Electron + React/Tailwind + Framer Motion), wired to **Ollama (gpt-oss‑20b)** locally and a **DigitalOcean (DO) chat-log service** for storage.

## Stack
- **Shell:** Electron (Node/TS) – fast iteration. (Later optional: Tauri for lean builds)
- **UI:** React + TypeScript + Tailwind + Framer Motion (or Motion Primitives), Radix UI, Lucide.
- **LLM Local:** Ollama @ `http://localhost:11434` targeting `gpt-oss:20b` (adjust model tag as needed).
- **Storage:** DO droplet (Ubuntu) running a lightweight API (FastAPI or Express) + Postgres (or SQLite + Litestream). Exposed via domain + HTTPS.

## Features

- 🪟 **Frameless, transparent window** with cross-platform blur support (macOS vibrancy, Windows Acrylic, Linux compositor blur)
- 🎯 **Always-on-top PiP mode** visible on all workspaces
- 🔄 **Drag to move, snap to corners** with smooth animations
- 📏 **Three sizes (S/M/L)** with collapse/expand states
- ⌨️ **Global shortcut** (Cmd/Ctrl+Shift+C) to toggle visibility
- 💾 **Persistent state** for window position and size
- 🎨 **Glassmorphic design** with adaptive blur effects:
  - Auto-detects compositor capabilities on Linux
  - Optimized for KWin, Picom, Compiz, and Mutter
  - CSS backdrop-filter fallback for maximum compatibility

## High-Level Flow

```
Renderer (PiP UI)  <->  Preload IPC  <->  Main (Electron)
                                             |
                                             +-- HTTP -> Ollama (local)  [stream]
                                             |
                                             +-- HTTPS -> DO chat API    [store logs]
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm/pnpm
- Ollama installed locally (for M2/M3 milestone)
- macOS, Windows, or Linux

#### Linux-Specific Requirements

For optimal blur effects on Linux, ensure you have a compositor that supports blur:

- **KDE Plasma**: KWin compositor (built-in blur support)
- **GNOME**: Mutter with blur extensions
- **i3/bspwm/etc.**: Picom compositor with blur enabled
- **Compiz**: Built-in blur plugin

**Picom Configuration Example** (for tiling window managers):
```bash
# ~/.config/picom/picom.conf
blur: {
  method = "dual_kawase";
  strength = 8;
  background = false;
  background-frame = false;
  background-fixed = false;
}

blur-background-exclude = [
  "window_type = 'dock'",
  "window_type = 'desktop'",
  "_GTK_FRAME_EXTENTS@:c"
];
```

**Quick Setup**: Run the Linux blur setup helper:
```bash
./scripts/setup-linux-blur.sh
```

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/glass-pip-chat.git
cd glass-pip-chat

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Build for Production

```bash
# Build for current platform
npm run build

# Build for specific platform
npm run build:mac
npm run build:win
npm run build:linux
```

**Linux Build Outputs:**
- AppImage (portable, runs on most distributions)
- DEB package (Debian/Ubuntu)

The Linux builds include automatic blur detection and compositor-specific optimizations.

## Development

### Project Structure

```
glass-pip-chat/
├── electron/           # Electron main process
│   ├── main.ts        # Window management, IPC handlers
│   └── preload.ts     # Secure bridge to renderer
├── src/               # React application
│   ├── components/    # UI components
│   ├── lib/           # Utilities and API clients
│   └── styles/        # CSS and Tailwind styles
├── scripts/           # Build scripts
└── assets/            # Icons and resources
```

### Key Commands

- **`npm run dev`** – Start development server with hot reload
- **`npm run build`** – Build production app
- **`npm run lint`** – Run ESLint and TypeScript checks
- **`npm run typecheck`** – Type checking only

### Testing Linux Blur Support

To test blur functionality in development:

```javascript
// In browser console
import('./src/utils/linuxBlur.test.js').then(m => m.testLinuxBlur());
```

Or run the Linux setup helper:
```bash
./scripts/setup-linux-blur.sh
```

## Milestones

### ✅ M0 – UI Prototype (v0)
- Glass PiP component: drag/resize/snap, collapse pill, light/dark, animations.
- Local state persisted (size/position).
- No backend calls yet.

### ✅ M1 – Electron Shell (Current)
- Frameless, transparent window, always-on-top, cross-platform blur effects:
  - **macOS**: Native vibrancy effects (`under-window`, `under-page`)
  - **Windows**: Acrylic background material with fallback to Mica
  - **Linux**: Compositor-aware blur (KWin, Picom, Compiz) with CSS backdrop-filter fallback
- Global shortcut toggle.
- Bounds persistence in `userData`.
- Preload exposes safe IPC for show/hide/toggle.

### 🚧 M2 – Ollama Integration
- `ollamaClient.ts` with **streaming** generation:
  - POST `http://localhost:11434/api/generate` (or `/api/chat` if using chat endpoint).
  - Stream tokens to the UI (renderer) via IPC or direct fetch with ReadableStream.
- Model default: `gpt-oss:20b`. Allow override via settings.

### 📋 M3 – Chat Log Service (DigitalOcean)
- **Server (Express or FastAPI)**:
  - `POST /v1/chats` → create chat (metadata)
  - `POST /v1/chats/:id/messages` → append message(s)
  - `GET /v1/chats/:id` → fetch conversation
  - Auth: simple **API key** + rate-limit; HTTPS via Caddy or Nginx + certbot.
- **Renderer** posts each user/assistant message with timestamps, model, tokens used.
- Optional: WebSocket to stream + store in parallel.

### 🤖 M4 – Robot Hooks (DroidCore)
- Add action channel: if message includes structured "robot-intent", emit to a local ROS2 bridge or your LowLvl service.
- Mirror repo layout under `HighLvl/Language` and `LowLvl/*` as your DroidCore evolves.

## Ollama Client (basic)

```typescript
// src/lib/ollamaClient.ts
export async function* streamOllama(opts: { model: string; prompt: string; system?: string }) {
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: opts.model, prompt: opts.prompt, stream: true, system: opts.system })
  });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue;
      const json = JSON.parse(line);
      if (json.response) yield json.response;
    }
  }
}
```

## Posting Logs to DO

```typescript
// src/lib/chatLogApi.ts
const API_BASE = import.meta.env.VITE_DO_API_BASE;
const API_KEY = import.meta.env.VITE_DO_API_KEY;

export async function postMessage(chatId: string, role: 'user'|'assistant', text: string) {
  await fetch(`${API_BASE}/v1/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${API_KEY}` },
    body: JSON.stringify({ role, text, ts: Date.now() })
  });
}
```

## Wiring Renderer

On Send:
1. `postMessage(chatId,'user',input)`
2. call `streamOllama({ model: currentModel, prompt: buildPrompt(history) })`
3. stream tokens to UI, buffer assistant text
4. `postMessage(chatId,'assistant',finalText)`

## Environment Variables

Create a `.env.local` file:

```env
VITE_DO_API_BASE=https://api.yourdomain.com
VITE_DO_API_KEY=your-api-key-here
VITE_DEFAULT_MODEL=gpt-oss:20b
```

## Security Checklist

- **Electron**: `contextIsolation: true`, no `nodeIntegration`, validate all IPC, strict CSP.
- **DO API**: HTTPS only, API keys rotated, IP allowlist optional, Postgres auth separate user.
- Don't store secrets in renderer; use preload to read from secure store later.

## Next Steps

- Replace temp message list with a virtualized list (e.g., `react-virtuoso`).
- Add settings panel: model, temperature, system prompt, DO endpoint.
- Robot intents: JSON block in assistant output → emit to local process (ROS2 bridge).

## Bonus: Tiny "hook" to stream in the component

Inside `GlassChatPiP.tsx`, you can later wire:

```tsx
import { streamOllama } from '../lib/ollamaClient';
import { postMessage } from '../lib/chatLogApi';
// ...
async function onSend(text: string) {
  const chatId = 'default'; // TODO
  await postMessage(chatId,'user',text);
  let full = '';
  for await (const token of streamOllama({ model: import.meta.env.VITE_DEFAULT_MODEL || 'gpt-oss:20b', prompt: text })) {
    full += token;
    // set state to render streaming
  }
  await postMessage(chatId,'assistant',full);
}
```

## License

MIT