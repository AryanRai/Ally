# Unified Ally selection, drawing and Meeting UI

Implemented on `feat/unified-ally-ui`, based on PR30 (`afbf006`).

## Interaction

- Circle from the existing pill/composer, shake, and Ctrl+Shift+Space share one selection surface. The Ally toolbar anchors to the previous chat/pill position on the selected display, clamps within its edges, and offers Freehand and Rectangle. The question panel follows the selection. Escape/cancel restores Ally without changing its bounds, chat or expanded/collapsed state; leaving the selection window abandons it.
- Every submitted selection attaches the original crop to the current chat and grants a finite drawing capability. There is no separate Draw action. Codex/Claude may use the existing `visual_tutor_read` / `visual_tutor_draw` tools when useful. The drawing window stays hidden until the first drawing and opens on the original frozen snapshot. Back to chat hides it; later tool updates respect that choice. View drawings reopens the same board without another capture.
- Meeting uses the currently selected native chat in both the expanded UI and collapsed pill. Setup has only source choices and Start. An unsent new chat must acquire a native session before starting. Running meetings expose capture state, sources, pause/resume and End. Navigating elsewhere leaves capture bound to its original chat and offers a return link. Meeting replies, cards and selected-screen context are scoped to that provider/session. The engine rejects replacement of an ongoing meeting until it ends.
- Provider tuning, quiet notes and diagnostics are under Settings → Meeting settings & diagnostics. The redundant chat picker and top-level Lecture/General controls were removed; backend compatibility for saved sessions remains.

## Boundaries retained

The frozen handoff is single-use, expires after 60 seconds and is bound to the chat that opened selection. Display changes invalidate drawing setup. Only the crop is attached; the full frozen screen stays local. Coordinates use the display's dimensions rather than mixed-DPI window rounding. Drawing tools cannot capture, create a session or revive a closed board. Both selection and drawing windows use restricted sandboxed preloads and top-level sender checks. No new model loop, microphone trigger, approval shortcut, phone/watch transport or pairing change was added.

## Verification

- Isolated PR30 + integration snapshot: **417 tests across 85 files passed**. This includes the existing queue, approvals/questions, unread, voice, device and capture suites, plus new selection geometry and meeting ownership tests.
- TypeScript, Vite production renderer and Electron builds passed. Final focused meeting tests cover the last settings/copy cleanup.
- `scripts/check-circle-draw.mjs`: real Electron windows, restricted preload, IPC and authenticated test MCP, using synthetic screen pixels. Both selection shapes, exact bitmap crop reuse, one capture, wrong-chat rejection, expired/reused token rejection, hidden-until-drawn behavior, actual frozen-image/mark painting, return-to-chat retention, reopening, revocation, Escape, placement and meeting replacement refusal passed.
- `scripts/check-unified-meeting.mjs`: production React controls in Electron at 320/360/640 CSS pixels; explicit setup, source choices, original-chat binding after navigation, pause, End and no horizontal overflow passed. Screenshots were visually inspected.
- No live model prompts, microphone recording, real approval decisions, failed-message replay or production restart were used.

Validation build: `%LOCALAPPDATA%/Ally/builds/unified-ui-20261018/glass-pip-chat`. Test-only source snapshot: `Exo/.ally-unified-ui-validation/glass-pip-chat`. AppData virtualization prevented the first isolated Vitest attempt from progressing; the workspace-local snapshot completed the full suite. Shared `dist` was not touched.

The separate message-readability chat began editing during this task. Its work, including the additive `responseSegments` prop, remains in the shared checkout but is excluded from this tested commit/build until its owner finishes validation. The first shared-suite run encountered those in-progress changes; the clean isolated suite above is authoritative for this integration.

## Runtime

The existing `claude-resume-20261018` desktop (PID6884 when checked) was preserved. This integration has **not been deployed**, and no restart helper is armed. Coordinate any future activation with active chats and other ready changes. Phone/watch APKs, pairing and assistant routing are unchanged. The pre-existing Vercel Root Directory issue is unrelated and untouched.
