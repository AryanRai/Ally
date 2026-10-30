# LiveKit fit for Ally (assessment, not installed)

LiveKit Agents is useful as an OPTIONAL realtime voice-session service: endpointing/turn detection, interruptible streamed audio, consistent STT/LLM/TTS integration, WebRTC clients and session lifecycle. These address the earlier public/noisy-setting listening and interruption concerns. They do not fix UI image layout or chronological chat rendering.

Recommended pilot: a backend voice adapter with one phone client first. Keep Codex/Claude chats, task routing, approval broker, native drawing and existing speech fallback in Ally. The adapter forwards committed user transcripts through the existing task bridge and speaks streamed public output; it must not reinterpret private reasoning or bypass model plan/session ownership. Test against the present direct Gemini speech path before changing defaults. Keep press-to-talk and manual Send; compare speech-end-to-send latency, false music triggers, interrupted speech, reconnect behavior and phone/watch battery impact.

Google/Vertex: use LiveKit's Google provider plugin for direct Vertex AI project billing (Orbit project), not LiveKit Inference billing. Verify model/project/region/credentials compatibility and actual credit eligibility in a pilot. No credential migration or billing changes were made. The Gemini phone app itself is not the API integration.

Costs/constraints: a LiveKit room/media server or Cloud service plus an agent worker is additional infrastructure; realtime sessions and model usage are not free just because the framework is open source. Enhanced noise cancellation is documented as a LiveKit Cloud feature. Watch transport should be evaluated separately for network/battery/lifecycle constraints, potentially through a phone gateway; do not assume a desktop SDK ports unchanged to Wear OS.

Official sources read:
- https://github.com/livekit/agents (framework, STT/LLM/TTS providers, WebRTC, MCP, server-side workers)
- https://docs.livekit.io/agents/logic/turns/ (semantic endpointing, VAD, interruptions, Cloud noise cancellation)
- https://docs.livekit.io/agents/models/realtime/gemini/ (Google plugin, Vertex AI vs LiveKit Inference billing)