# Ally visual tutor

The desktop Visual tutor lets the current Claude Code or Codex chat teach with diagrams over the screen. It uses the existing agent and speech pipeline, screen capture and authenticated `ally_chats` MCP server. It adds no model provider or reasoning loop.

Open **Circle** from the pill/composer, use **Ctrl+Shift+Space**, or use the existing shake gesture. Circle the area to explain, optionally type a question, then choose **Draw to explain** beside Ask/Search/Explain. Ally reuses that frozen screenshot and shares only the selected crop with the current conversation. The drawing layer opens on the same display with the selection's original screen coordinates. There is no separate Visual tutor launch button. Active drawings show only Circle another area and End controls beside the chat; follow-up chat and voice stay in the same conversation.

The capture handoff is valid once, for the chat selected when Circle opened, and expires after 60 seconds. Changing chats or display bounds cannot reroute it. Full-screen freeze keeps the original display image locally; it does not attach the surrounding screen to the agent. Beginning another Circle ends the previous drawing overlay so its annotations are not captured into the next lesson. No microphone starts automatically.

The agent calls `visual_tutor_read` and `visual_tutor_draw`. Drawing updates appear immediately; steps can be revisited with Previous/Next. Browsing an older step pauses following, and Latest resumes it. Sketch adds amber pen strokes that the agent can inspect on the next question. Ask Ally returns to the existing chat; its existing voice controls work for follow-ups. Ending the overlay revokes its drawing capability. Switching chats closes it rather than routing context to a different conversation.

By default the desktop stays clickable through the annotations. Freeze shows the actual shared snapshot and blocks clicks to the underlying apps; turn it off to interact again. These are annotations on a captured screen, not a continuous visual stream: refresh from Ally after scrolling, switching pages or moving content. A display removal or coordinate-changing display configuration ends the overlay rather than drawing at the wrong location. No wake-word detection or synchronized real-time speech model was added.

## Implementation

- `electron/visualTutor`: bounded scene model, validation, user-initiated capture/window lifecycle, IPC, restricted overlay preload, two MCP tools.
- `src/visualTutor`: safe React/SVG renderer, step controls, snapshot/live modes and pointer sketching. No generated HTML, arbitrary SVG, scripts, external images or browser navigation.
- `useVisualTutor` and `VisualTutorControls`: same-chat capture/send handoff, voice/text prompt context and visible errors.
- The capture implementation is reused from Circle to Ask. Tutor crop images use a separate temporary directory with a maximum of 20 files, pruned after 24 hours on the next capture; raw audio is not recorded by this feature. Normal agent image handling is unchanged.
- Each board has an unpredictable ID issued only by a user-opened lesson. Tools cannot open/capture a screen, revive a closed board or interact with the desktop. The overlay preload cannot invoke agent/device/file APIs. IPC verifies the sending top-level window.
- Coordinates use 0–1000 across the full display, independent of monitor pixel density and negative desktop origins. `board.focus` describes the selected crop in those coordinates, and the prompt explains how to map crop points onto the display. Screen marks include arrows, lines, rectangles, ellipses, polylines and plain labels. Draw upserts a complete teaching step atomically. Limits: 16 steps, 80 marks and 4,000 points per step, 256 points per stroke, 40 user sketches.

## Validation

Focused tests cover geometry/schema rejection, scene complexity limits, incremental updates, reader navigation, session revocation, user sketches, safe text rendering, explicit capture, same-chat handoff and switching chats during capture. Native Electron capture, overlay preload and MCP integration are checked separately in an isolated test instance; see the collaboration log for actual results and deployment status. After building, run `electron scripts/check-visual-tutor.mjs` with the local Electron binary. This uses real OS screen capture and the production drawing tools with deterministic test scenes; it makes no model requests or production restarts. It saves only a synthetic overlay preview and removes its captured desktop image.

The connected agent must have the updated MCP tool list available. Drawing only changes Ally's reversible overlay, but a backend configured to permit only a fixed read-only tool list may require its normal tool approval. If the tools are unavailable the prompt explicitly asks the agent to report that limitation instead of claiming to have drawn anything.

Circle integration validation: 36 focused tests pass, isolated TypeScript/Vite/Electron builds pass, and `node node_modules/electron/cli.js scripts/check-circle-draw.mjs` exercises the real Circle UI and native capture handoff without a model send. It confirms exactly one OS capture, identical selected bitmap pixels, crop-only attachment, screen focus geometry, wrong-chat rejection, one-time consumption and restricted drawing preload. Temporary captured images are deleted by the test.

