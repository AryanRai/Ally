# Drawing from ordinary Ally chats

All chats use the shared Ally MCP drawing tools, regardless of whether a message originates on phone/watch, pill, full chat or notch. The desktop must be running. `study_open` opens a blank desktop overlay without a shortcut or screen capture, then returns a boardId. The agent must call the drawing tool and check its result before claiming the diagram was displayed.

`study_open` is bound to the authenticated originating chat (explicit provider:sessionId fallback when caller context is absent). It reuses that chat's current board, refuses another chat's active board, serializes opening, and deduplicates retries by requestId. A dismissed board cannot be resurrected with a retry. It never changes chat selection or sends another model turn.

Screen context is optional: capture:true returns a single desktop PNG when requested. No background screen feed. A blank board has capturedAt=0 and is labelled Desktop board. Display removal/geometry changes invalidate the overlay as before. Captured boards retain the snapshot timestamp.

- `visual_tutor_draw`: screen annotations or self-contained diagram cards.
- `study_diagram`: interactive HTML/SVG, image assets, wave/Fourier presets; immediate display on ordinary boards. Existing native Study boards retain spoken cue behavior.
- `study_manim` / playback / lesson tools: existing bounded lesson pipeline, now also accepts originating ordinary boards.
- `visual_tutor_read`: inspect current steps and user sketches; no capture.

Optional diagram runtime `three` supplies window.THREE and window.OrbitControls. `mermaid` renders pre.mermaid blocks automatically. Libraries are pinned, bundled locally, and lazy loaded. Diagram scripts run inside the existing opaque-origin iframe: no network, files, tools, navigation, popups or parent privileges. No CDN imports. Event handlers use addEventListener. Existing Ctrl+Alt and Circle Study entry points remain available.

Validation: 92 drawing/Study/provider routing tests and TypeScript passed. Live isolated renderer checks passed for Three.js (WebGL scene and orbit controls) and Mermaid (rendered SVG). Library scripts use nonce-authorized local data URLs to avoid HTML parser confusion in bundled code without relaxing CSP. Check .local/drawing-build.log and .local/drawing-activation.json for build/activation status. New MCP tool discovery may require a new/reopened agent session; tool availability must be checked before claiming it is available in an already running turn.