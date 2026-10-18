# Debugger performance and exact chat restoration

2026-10-19. Preserve the existing UI, layout, styling, animation, history, native ownership, drafts, decisions and device configuration. Changes are limited to selection persistence, startup restoration and cooperative native history projection. No model messages, microphone recording, private screenshot capture, transcript deletion or device installation was used.

## Measurements

Attached Chromium's local `webContents.debugger` CPU profiler to an isolated synthetic renderer, and Node's in-process inspector CPU profiler to a separate read-only Electron history diagnostic. Neither opens a network debugger port. Profiles contain function/stack metadata; raw chat content is not saved in diagnostic artifacts.

The Chromium fixture has 20 chats / 1,600 messages, about 1.6 MB of persisted JSON. Previously each selection serialized and rewrote every transcript. Twenty-four switches cost 225.6 ms total, with an 11.6 ms maximum individual switch. The independent selection record reduced this to 1.2–1.5 ms total / 0.2 ms maximum. The unchanged-history synchronization case stayed in the 15–19 ms range; no improvement is claimed for it. Real Chromium also verified selection across renderer reload and a different frozen-build file path with the same isolated user-data directory.

Real inherited study history still uses the full native API, never its compressed suffix. The initial diagnostic returned all 973 messages in 22.67 s with a 6,467.6 ms maximum main-loop delay; synchronous thumbnail conversion was a CPU hotspot. Yielding between turns reduced the maximum to 1,391.5 ms. The final generator yields between native items after an 8 ms cooperative work budget, preserving parser and tool state across each yield.

A final before/after pair returned all 973 messages with the same SHA-256 hash of the complete message arrays, including images and tool data:

| Metric | Previous source | Final source |
| --- | ---: | ---: |
| Maximum main event-loop delay | 10,158.6 ms | 259.7 ms |
| p99 event-loop delay | 18.6 ms | 50.3 ms |
| Cold full history load | 31,454.6 ms | 22,017.0 ms |
| Unchanged refresh | 654.5 ms | 640.1 ms |
| Messages | 973 | 973 |

These are individual local diagnostics under variable machine load, including concurrent build/test activity. They demonstrate removal of accumulated synchronous history conversion, not a guaranteed cold-load speedup, an 8 ms maximum task time, a general p99 improvement or a frame-rate result. Individual image decode, file read and native RPC parsing remain synchronous; native pagination remains substantial. No image, turn, unread or history cap was added or changed.

## Restoration

The small selection record is written synchronously on selection and before transcript saves. It stores local chat ID, title, exact provider/session, migration alias and working folder, without embedding history. Existing persisted selection remains compatible. If a transcript exceeds storage quota, the selected chat's exact ID and agent linkage can be recovered immediately and hydrated by the ordinary read-only session synchronizer. Missing native history leaves that selected chat in place; there is no fallback to a different chat. Same-provider migration aliases resolve to their existing local row. Drafts remain in the existing separate store.

Startup chooses the selected chat's provider when a saved composer model belongs to another provider. History hydration never selects a chat after awaiting native IO; subsequent user navigation wins. A restored selection cannot acknowledge unread merely by starting/focusing the application; normal visible/focused-reader receipts resume after interaction or explicit selection. No read receipts are removed.

The collapsed reader stores a small per-local-chat bookmark: selected older reply, scroll offset, expanded state and follow state. Restoration waits for a referenced historical reply to arrive. A new prompt starts normal live following. Browser scroll offsets may clamp when content/viewport changes; expanded transcript scroll restoration is not added, because its existing smooth stick-to-bottom controller needs separate lifecycle work. No display markup, class, animation or spacing changed.

## Verification and artifacts

- Full desktop suite: 573 passed, four opt-in reply profiles skipped. Final affected suite: 40 passed after reader and receipt refinements. TypeScript and isolated Electron/Vite production builds pass. Existing Vite large-chunk advisory remains.
- Regression coverage includes legacy selection, exact provider identity, migration aliases, transcript quota failure, draft retention, delayed hydration/navigation, startup receipt suppression followed by real reader engagement, and older-reply/scroll restoration after delayed history.
- Native synthetic Chromium QA compares the old frozen reader with the current reader using the production CSS pipeline: default DOM and screenshot PNG bytes match exactly. Older-reply restoration across renderer reload passes. This is component-level software QA, not full-desktop compositor or physical gesture verification.
- Repeatable harnesses: `scripts/profile-chat-persistence.mjs`, `scripts/profile-native-history.mjs`, `scripts/check-reader-preservation.mjs`. Run through Electron with `ELECTRON_RUN_AS_NODE` unset. The native-history harness requires an explicit exact session ID, output directory and optional built agent directory; it never resumes or writes a session.
- Raw diagnostic logs, CPU profiles, synthetic screenshots and a new isolated build are under `Exo/.ally-debugger-performance-20261019`. Existing candidates remain intact. Shared repository dist is not used for deployment. Phone assistant binding, pairing, speech and phone/watch packages remain unchanged; watch installation stays deferred.

Activation uses an exact-process/artifact-verified idle helper that waits for every response, decision, recording and drawing board. The candidate's `deployment.json` is authoritative for whether the merged build is live or still waiting.
