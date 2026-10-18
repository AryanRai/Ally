# Next task: make Circle, drawing and meetings feel native to Ally

## User's requested outcome

The existing features work but feel bolted onto Ally. Integrate their interaction and appearance into the existing Ally chat and collapsed pill. Implement this as the next task after the completed cross-device work is published and merged.

- When shake/keyboard/Circle is invoked, Ally should visibly transform into a coherent selection state anchored to the current pill/chat. Avoid presenting an unrelated-looking application. Preserve sensible placement across expanded and collapsed views, cancellation, focus and return to the previous state. A dedicated technical capture window may remain if necessary, but the experience must feel like Ally.
- Use one screen-selection tool with freehand and rectangle selection options. Selecting an area and asking about it should be one flow; do not require a separate drawing session or repeated capture.
- Drawing is an explanation capability available to the existing Codex/Claude chat. The agent can choose to draw when useful; the user should not have to press a separate Draw to explain action before it can help. Reuse the existing drawing/read tools and selected capture. Preserve screen/crop coordinate alignment and exact chat binding.
- Offer one clear Meeting mode using the currently selected Ally chat. Remove the redundant second chat selector and competing top-level meeting/lecture/explanation modes. Keep only controls that help the user: start, pause/resume, end, capture status and simple source choices when needed. Put diagnostics/provider tuning in settings. A running session must stay bound to its original chat if the user navigates elsewhere; do not silently redirect ongoing capture or replies.
- Match Ally's typography, spacing, surfaces, activity indicators and compact pill behavior. Keep current chat selection, queue, approvals/questions, unread markers, attachments, voice and phone/watch functionality intact.

## Starting points

- `glass-pip-chat/src/components/GlassChatPiP.tsx`: composer/pill wiring, current selected chat, Circle handoff, tutor and meeting controls.
- `glass-pip-chat/src/circle/CircleOverlay.tsx`, `src/circle/actions.ts`, `electron/capture/circle.ts`, `circleHandoff.ts`: capture, selection and existing one-capture handoff.
- `glass-pip-chat/src/hooks/useVisualTutor.ts`, `src/components/visualTutor/`, `src/visualTutor/`, `electron/visualTutor/`: drawing lifecycle, overlay, scope checks and tools. MCP tools are exposed through `electron/chatsMcp/`.
- `glass-pip-chat/src/components/perception/PerceptionBar.tsx`, `SessionPicker.tsx`, `modes.ts`, `src/components/chat/CollapsedMeetingControls.tsx`, `src/hooks/usePerception.ts`, `electron/perception/`: meeting controls, capture/relevance and same-session routing.
- Relevant existing docs: `visual-tutor.md`, `realtime-agent.md`, `message-queue.md`, `chat-interactions.md`, `inbox-alerts.md`, `unread-chats.md`.

## Coordination and current delivery

Read `docs/agent-collaboration.md` first and reserve the files/restart slot before shared changes. Do not discard other chats' work or start competing installers/helpers. The user's latest request authorizes publishing all completed work and creating the next chat; earlier no-Git notes were superseded for that publication.

The latest verified desktop runtime is `%LOCALAPPDATA%/Ally/builds/claude-resume-20261018/glass-pip-chat`, deployment complete, PID6884 at verification. Its previous combined build is `message-queue-20261018`. Do not relaunch older Inbox/queue idle helpers: those were superseded. Check live process and deployment JSON before acting; PID is historical context, not permission to stop an unrelated process.

Phone/watch already have the combined queue, assistant, Inbox, reconnect, approval/question and unread APKs. Preserve pairing/settings and selected assistant. Samsung assistant-hold route is `googlevoiceassistant/googlevoiceassistant`. `wear-app/verify-assistant.ps1` repairs only an already-selected Ally service after APK replacement. Physical power-button/locked-device behavior still needs user verification; system ASSIST showed the session without recording.

The Claude hi bro original session is `60ce8fdb-d410-4e20-8e53-6a80107d3625`. Its transcript remains in the Exo-Ally Claude store while latest working folder is `glass-pip-chat`. `claudeResume.ts` starts UUID resume from that matching ancestor and supplies working-folder context. Failed startup results no longer relink the chat to a temporary CLI ID. Do not fork, copy/rewrite its transcript, or automatically resend a failed user message.

No live model test prompts, recording or real approval clicks were used to verify this batch. Use synthetic focused tests and native UI harnesses where possible. Capture and decisions must retain existing consent and immutable target boundaries. Avoid restarting active replies merely to show UI changes.

## Verification at consolidation

- Full desktop suite: **407 tests across 82 files passed**; TypeScript passed; diff whitespace check passed.
- Android: phone/watch unit tests, both debug APKs and phone lint passed. Windows build environment: `JAVA_HOME=C:\Program Files\Java\jdk-23`, `ANDROID_HOME=C:\Users\buzza\AppData\Local\Android\Sdk`.
- Recent isolated Electron build and read-only native resolver QA passed; earlier Circle/tutor/queue native harnesses are in `glass-pip-chat/scripts/check-*.mjs`.
- Keep shared source `dist` separate from installed production runtime. Validate new UI using an isolated build before any coordinated deployment.

The local `.ally/settings/mcp.json.bak` and nested third-party `open-ptc-agent/` checkout are not part of Ally's source publication. Preserve them locally.
