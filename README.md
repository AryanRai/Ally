# Ally – Unified Robot Cognitive Overlay

**Ally** is a **glassmorphic, picture-in-picture desktop overlay** that provides advanced access to local and remote LLMs, comprehensive tool calling framework, and seamless integration with the **Comms v4.0 Unified Robot Cognitive Overlay Platform**.

It runs as a floating, always-on-top Electron app with Apple-style glass UI, animated interactions, and seamless integration with **Ollama (local models like gpt-oss-20b)** and the **Chyappy v4.0 Unified Protocol**. All chats are logged to a **Vercel-hosted API** with an exposed external domain, enabling persistent conversation history, analytics, and direct robot control through the unified tool calling framework. The API uses Supabase for database storage and integrates with the Comms v4.0 platform for real-time robot cognitive processing.

---

## About

Ally is designed as both a **personal AI assistant** and a **robot control console**:
- **As a desktop overlay:** quick access to AI chat, search, and task automation without switching windows.
- **As part of DroidCore:** acts as the human-facing “head” of the robot, providing vision, language, and speech interfaces.

It is ideal for:
- Rapid natural-language queries and responses via local LLMs.
- On-the-fly actions (file lookup, system commands, IoT triggers).
- Sending structured “robot intents” to the DroidCore LowLvl control stack.

---

## Core Features

### Glass PiP Overlay
- **Apple-style glassmorphism:** frosted blur, subtle gradients, rounded corners, hairline borders.
- **Motion-rich interactions:** drag, snap to corners, elastic resize, collapse into a pill, animated open/close.
- **Keyboard accessible:** focus ring, `Esc` to close, `Cmd/Ctrl+Shift+C` to toggle.
- **Persistent layout:** remembers position/size between sessions.

### AI Integration
- **Local Models:** Connects to Ollama (`http://localhost:11434`) for low-latency inference. Default: `llama3.2`.
- **Cloud Models:** OpenRouter integration for access to GPT-4, Claude 3.5, Gemini Pro, and 100+ other models.
- **Dual Provider Support:** Seamlessly switch between local Ollama and cloud OpenRouter models.
- **Streaming output:** tokens rendered in real-time with smooth animations.
- **Custom prompts & system personas:** switchable in settings.

### Chat Logging
- **Vercel API:** all messages are sent to a Vercel free site/API, which routes to Supabase for storage and can proxy to the PC LLM via public IP.
- **Storage:** Supabase (PostgreSQL) for persistence.
- **Secure:** API key authentication, HTTPS enforced, optional IP allowlist.
- **Retrieval:** pull past chats for context or analysis.

### Speech Integration
- **Speech-to-Text:** OpenAI Whisper for accurate voice recognition with real-time processing.
- **Text-to-Speech:** Coqui TTS for natural speech synthesis with multiple voice options.
- **ggwave Communication:** Audio-based data transmission for robot communication protocols.
- **WebSocket Service:** Separate Python service for speech processing with GPU acceleration.
- **Voice Commands:** Hands-free interaction with Ally and LLM conversations.

### Tool Calling Framework
- **Complete Tool System:** Built-in TypeScript tool calling framework with validation
- **Tool Registry:** Dynamic tool registration and discovery system
- **Tool Execution:** Async tool execution with timeout and error handling
- **Tool Manager:** Centralized tool lifecycle management
- **Schema Validation:** JSON schema validation for all tool definitions and executions
- **Integration Testing:** Comprehensive test suite for tool execution workflows

### Unified Robot Integration (Comms v4.0)
- **Tool Calling Framework:** Direct integration with Comms v4.0 tool execution system
- **Chyappy v4.0 Protocol:** Seamless communication through unified protocol
- **Cognitive Processing:** AI-driven decision making and intent recognition
- **Real-time Control:** Send structured tool calls and robot commands
- **Multi-modal Coordination:** Combine vision, speech, and LLM reasoning for complex tasks
- **Memory Management:** Persistent conversation and decision history
- **Physics Integration:** Real-time physics simulation data and control

---

## Architecture Overview

```

            +-----------------------+
            |    Ally Overlay UI    |
            |  (Electron + React)   |
            |   Tool Framework      |
            +----------+------------+
                       |
              Preload IPC (safe)
                       |
     +-----------------+----------------+
     |                                  |
Local Ollama (LLM)               Vercel web (via Public IP)
[http://localhost:11434]             [https://api.example.vercel.app]
(gpt-oss:20b, etc.)               
|                                       |
+------v-------+                        v
|  LLM Output  |               Supabase (store/retrieve logs) and functions
+------+-------+                        ^
|                                       |
v                                       |
Comms v4.0 Stream Handler        PC LLM (local integration)
(Tool Calling, Physics, Ally)           |
|                                       |
v                                       |
Unified Robot Platform           Back to Vercel/Supabase
(Hardware, Physics, Cognitive)

```

---

## Repository Structure

```

├── electron/          # Electron main & preload scripts
├── src/               # React + Tailwind UI
│   ├── components/    # GlassChatPiP & related UI
│   ├── lib/           # ollamaClient, chatLogApi
│   └── styles/        # Tailwind config & global CSS
├── speech-service/    # Python speech processing service
│   ├── speech_service.py    # WebSocket-based STT/TTS/ggwave service
│   ├── start_service.py     # Service startup script
│   ├── requirements.txt     # Python dependencies
│   └── start.bat/sh/ps1     # Platform-specific startup scripts
├── tool-calling-framework/ # TypeScript tool calling framework
│   ├── src/
│   │   ├── types/           # TypeScript type definitions
│   │   ├── registry/        # Tool registry system
│   │   ├── executor/        # Tool execution engine
│   │   ├── manager/         # Tool lifecycle management
│   │   └── schemas/         # JSON schemas for validation
│   └── __tests__/           # Comprehensive test suite
├── HighLvl/           # DroidCore AI & perception modules (future)
│   ├── Vision/        # SLAM, object detection, face recognition
│   ├── Language/      # LLM reasoning, prompt building
│   ├── Speech/        # Whisper STT, Piper TTS
│   └── Sound/         # ggwave synthesis
├── LowLvl/            # Direct hardware control
│   ├── Motor/         # Drivers & FOC control
│   ├── Radar/         # Sensor interface
│   ├── Fans/          # Cooling control
│   ├── Bluetooth/     # Communication interface
│   └── Base/          # Core firmware drivers
└── README.md          # This file

```

---

## Core Technologies

**Desktop UI**
- Electron (Node + Chromium)
- React + TypeScript + Tailwind CSS
- Framer Motion (animations)
- Radix UI primitives, Lucide icons

**AI & Perception**
- Ollama (local LLM serving)
- gpt-oss-20b (default model)
- Whisper (STT), Piper (TTS)
- YOLO (object detection), OpenFace/MediaPipe (face recognition)
- Kinect v2 via libfreenect2

**Robot Control**
- ROS (planned middleware)
- Field-Oriented Control (motor)
- ggwave (audio data transmission)
- Bluetooth / Lora communications

**Backend**
- Vercel free site
- Express.js or FastAPI for API logic
- Supabase (PostgreSQL) as api 

---

## Roadmap

- [X] **M0 – UI Prototype** (v0): glass PiP component with animations.
- [X] **M1 – Electron Shell**: window vibrancy, bounds persistence, shortcut toggle.
- [X] **M2 – Ollama Integration**: local LLM streaming.
- [X] **M3 – Speech Integration**: STT (Whisper), TTS, and ggwave communication via WebSocket service.
- [X] **M4 – Tool Calling Framework**: complete TypeScript tool execution system with validation.
- [X] **M5 – Comms v4.0 Integration**: seamless integration with unified robot platform.
- [ ] **M6 – Vercel/Supabase Chat API**: log storage & retrieval.
- [ ] **M7 – Multi-modal**: merge vision, speech, and LLM reasoning for autonomous tasks.
- [ ] **M8 – Packaging**: cross-platform builds, code signing, autoupdate.

---

## Quick Start

### Local Usage

1. **Start the Speech Service:**
   ```bash
   cd Ally/speech-service
   # Windows
   start.bat
   # macOS/Linux
   ./start.sh
   # PowerShell (cross-platform)
   pwsh start.ps1
   ```

2. **Launch Ally:**
   ```bash
   cd Ally/glass-pip-chat
   npm install
   npm run dev
   ```

3. **Enable Speech Controls:**
   - Press `Ctrl+Shift+V` (or `Cmd+Shift+V` on macOS) to toggle speech controls
   - Click "Connect" to link with the speech service
   - Start voice recognition and begin talking to Ally

### Remote Control Setup

1. **Deploy Remote Service:**
   ```bash
   cd Ally/ally-remote-service
   ./deploy.sh
   ```

2. **Configure Local System:**
   ```bash
   cd Ally/glass-pip-chat
   ./setup-remote.sh
   ```

3. **Enable Remote Mode:**
   - Open your local Ally system
   - Go to Settings and enable "Remote Mode"
   - Sign in with your account
   - Access your AI from anywhere at your Vercel URL

See [REMOTE_INTEGRATION_GUIDE.md](REMOTE_INTEGRATION_GUIDE.md) for detailed setup instructions.

---

## License
[Apache-2.0 License](LICENSE)

---

## Credits
Developed as part of the **DroidCore** robotics platform, extending Ally into a real-world AI-driven assistant.