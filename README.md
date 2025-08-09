
# Ally – DroidCore Desktop Overlay

**Ally** is a **glassmorphic, picture-in-picture desktop overlay** that provides advanced access to local and remote LLMs, convenience tools for instant actions, and a bridge to the **DroidCore** robotic platform.

It runs as a floating, always-on-top Electron app with Apple-style glass UI, animated interactions, and seamless integration with **Ollama (local models like gpt-oss-20b)**. All chats are logged to a **DigitalOcean-hosted API** with an exposed external domain, enabling persistent conversation history, analytics, and remote control signals for the robot.

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
- **Local Models:** Connects to Ollama (`http://localhost:11434`) for low-latency inference. Default: `gpt-oss:20b`.
- **Remote Models (future):** Optional API bridge to cloud LLMs.
- **Streaming output:** tokens rendered in real-time with smooth animations.
- **Custom prompts & system personas:** switchable in settings.

### Chat Logging
- **DigitalOcean API:** all messages are sent to a dedicated DO droplet.
- **Storage:** PostgreSQL or SQLite+Litestream for persistence.
- **Secure:** API key authentication, HTTPS enforced, optional IP allowlist.
- **Retrieval:** pull past chats for context or analysis.

### Robot Hooks (DroidCore)
- **HighLvl integration:** Ally can send structured commands to the DroidCore robot.
- **Vision/Speech:** hooks for Kinect v2 (via libfreenect2), Whisper STT, Piper TTS, YOLO object detection.
- **Actuation:** transmit movement commands to LowLvl (motor control, FOC, sensor polling).
- **Multi-modal coordination:** combine vision, speech, and LLM reasoning for complex tasks.

---

## Architecture Overview

```

```
            +-----------------------+
            |    Ally Overlay UI    |
            |  (Electron + React)   |
            +----------+------------+
                       |
              Preload IPC (safe)
                       |
     +-----------------+----------------+
     |                                  |
```

Local Ollama (LLM)               DigitalOcean Chat API
[http://localhost:11434](http://localhost:11434)             [https://api.example.com](https://api.example.com)
(gpt-oss:20b, etc.)                (store/retrieve logs)
|
+------v-------+
\|  LLM Output  |
+------+-------+
|
v
DroidCore HighLvl Modules
(Vision, Language, Speech, Sound)
|
v
DroidCore LowLvl Modules
(Motor, FOC, Radar, Fans, Bluetooth)

```

---

## Repository Structure

```

├── electron/          # Electron main & preload scripts
├── src/               # React + Tailwind UI
│   ├── components/    # GlassChatPiP & related UI
│   ├── lib/           # ollamaClient, chatLogApi
│   └── styles/        # Tailwind config & global CSS
├── HighLvl/           # DroidCore AI & perception modules
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
- DigitalOcean droplet (API server)
- Express.js or FastAPI for chat logging
- PostgreSQL or SQLite+Litestream

---

## Roadmap

- [ ] **M0 – UI Prototype** (v0): glass PiP component with animations.
- [ ] **M1 – Electron Shell**: window vibrancy, bounds persistence, shortcut toggle.
- [ ] **M2 – Ollama Integration**: local LLM streaming.
- [ ] **M3 – DO Chat API**: log storage & retrieval.
- [ ] **M4 – Robot Hooks**: send structured commands to DroidCore LowLvl.
- [ ] **M5 – Multi-modal**: merge vision, speech, and LLM reasoning for autonomous tasks.
- [ ] **M6 – Packaging**: cross-platform builds, code signing, autoupdate.

---

## License
[Apache-2.0 License](LICENSE)

---

## Credits
Developed as part of the **DroidCore** robotics platform, extending Ally into a real-world AI-driven assistant.
