# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

**Ally** is a unified robot cognitive overlay system consisting of multiple interconnected services:

- **glass-pip-chat/**: Main Electron app providing glassmorphic PiP overlay UI with React frontend
- **ally-remote-service/**: Next.js web service for remote Ally interactions via Supabase backend
- **speech-service/**: Python WebSocket service for STT/TTS/ggwave audio processing
- **tool-calling-framework/**: TypeScript framework for AI tool execution and validation

The system integrates local LLMs (via Ollama), speech processing, and robot control through the Comms v4.0 protocol. All conversations are logged to Supabase for persistence and analytics.

## Common Development Commands

### Glass PiP Chat (Main Electron App)
```bash
cd glass-pip-chat
npm run dev          # Start development server (Vite + Electron)
npm run build        # Full production build
npm run test         # Run test suite with Vitest
npm run lint         # ESLint + TypeScript checking
npm run typecheck    # TypeScript type checking only
```

### Ally Remote Service (Web API)
```bash
cd ally-remote-service
npm run dev          # Start Next.js development server
npm run build        # Production build
npm run lint         # Next.js linting
npm run test         # Test setup
# Supabase database commands
npm run db:push      # Push schema changes to Supabase
npm run db:pull      # Pull schema from Supabase
npm run functions:deploy     # Deploy all Supabase functions
npm run supabase:start       # Start local Supabase instance
```

### Tool Calling Framework
```bash
cd tool-calling-framework
npm run build        # TypeScript compilation
npm run dev          # Watch mode compilation
npm run test         # Vitest test suite
npm run test:coverage # Test coverage report
npm run lint         # ESLint for TypeScript
```

### Speech Service (Python)
```bash
cd speech-service
# Windows
start.bat
# macOS/Linux
./start.sh
# PowerShell (cross-platform)
pwsh start.ps1
```

## Key Integration Points

**LLM Integration**: Uses Ollama client at `http://localhost:11434` with default model `gpt-oss:20b`

**Speech Processing**: WebSocket service on configurable port for real-time STT/TTS/ggwave communication

**Database**: Supabase PostgreSQL backend for conversation logging and system state

**Tool Execution**: JSON schema-validated tool calling system with async execution and timeout handling

**Robot Communication**: Integrates with Comms v4.0 protocol for physical robot control and cognitive processing

## Development Notes

- The system uses TypeScript throughout with strict typing
- All services run independently but communicate via WebSocket/HTTP APIs
- Speech service requires GPU acceleration for optimal Whisper/TTS performance
- Tool calling framework includes comprehensive validation and error handling
- Electron app supports cross-platform builds (Windows/macOS/Linux)

## Testing Strategy

- **glass-pip-chat**: Vitest with React Testing Library
- **tool-calling-framework**: Vitest with coverage reporting
- **ally-remote-service**: Node.js test setup
- Integration tests available in root directory test files

Always run `npm run lint` and `npm run typecheck` before commits in TypeScript projects.