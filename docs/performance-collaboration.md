# Ally performance collaboration

Updated: 26 October 2026 (Australia/Sydney).

## Goal and boundaries

The user reports severe lag and excessive computer resource use. Make the Glass Chat collapsed pill and expanded window consistently smooth. Investigate the whole relevant codebase and keep improving measured bottlenecks, rather than stopping after one small fix.

Preserve every feature, visible UI, animation, interaction and existing chat/draft/history. Do not achieve lower usage by removing functionality, changing appearance, disabling effects or making interactions less responsive.

## Working lanes

| Owner | Work | Coordination |
| --- | --- | --- |
| New Codex performance chat | Profiling, CPU/GPU/memory and responsiveness improvements in `glass-pip-chat`, plus backend hot paths when measurements justify them | Claim exact files in `agent-collaboration.md` before editing; record results here |
| Claude | Concurrent feature work | Keep feature ownership; record exact files in the shared ledger. Coordinate overlaps before editing |
| This handoff chat | Collaboration documents and dispatch only | No further application edits planned |

`agent-collaboration.md` remains the shared ownership ledger. This document is the short performance brief and results log. Read its latest claims and inspect the dirty tree before work; do not overwrite or revert peer changes. Record overlap requests and agree on an owner before touching a claimed file. Avoid whole-file rewrites in shared integration files. Release claims when finished. Do not assume a historical claim or process ID is current.

## Investigation and completion

1. Identify the actual running build and all Ally-owned processes. Measure the live app before changing it; distinguish Ally cost from agent subprocesses and unrelated apps.
2. Establish comparable baselines for idle collapsed pill, idle expanded chat, typing, opening/closing, chat switching, long history and synthetic streaming. Record CPU, memory, main/renderer stalls and frame timing where available. Include hidden/notch mode when relevant.
3. Follow the profiles through renders, animations, timers/listeners, IPC, persistence, history loading and background discovery. Investigate leaks and duplicate work. Keep expensive profiling bounded so it does not itself sustain high load.
4. Make measured changes in small batches. Use meaningful regression tests, production builds and the same before/after scenarios. Verify UI and behavior parity; report measurements honestly and separate automated checks from unverified real interaction.
5. Continue through remaining significant bottlenecks. Keep a short results table below, including residual risks and next findings. Do not claim all performance problems are fixed from unit tests alone.

Build isolated candidates. Preserve active turns and unsaved drafts; activate only when safe and idle. Do not overwrite frozen running artifacts or installed/native files. No Git publication, real model messages, microphone recording or private screen-context sends are needed for performance fixtures.

## Current integration notes

- Canonical home is this Ally repository; desktop is `glass-pip-chat/`, native notch/connector is `ally-study/`.
- `.local/unified-build.json` identifies the saved launch candidate. Inspect running process paths separately: the live desktop may contain in-memory fixes from earlier debugging.
- Preserve the latest docking correction in `electron/surface/` and model/provider pairing in `electron/agent/codexRun.ts`, plus all prior draft, history, drawing, selection and Circle fixes.
- Read `CLAUDE.md` for repository rules. Use this brief to start; consult dated history only when relevant.

## Results

| Scenario / bottleneck | Before | Change | After / verification | Owner / status |
| --- | --- | --- | --- | --- |
| Hidden live desktop, repeated unsupported local rollout reads | 878,558,532 characters from one alias rollout in 8 s (3 full reads) | Stream JSONL, reject unsupported headers before the body, cache rejection by file revision | Same 8 s probe after live method replacement: zero rollout whole-file reads; only 86,174 index characters | Codex performance; equivalent read method live in PID40676, no restart |
| Expanded saved history during typing, synthetic Chromium | 1,125.7 ms total / 71.3 ms max for 24 updates | Memoize saved message view with field snapshots and stable dispatch to latest handlers | 13.7 ms total / 1.1 ms max (80 saved messages, including tool groups) | Codex performance; candidate verification in progress |
| Expanded history during streaming-parent updates, same fixture | 811.6 ms total / 44.7 ms max for 24 updates | Same saved-view boundary | 12.3 ms total / 1.0 ms max | Codex performance; this measures unchanged history, not model latency |
| Repeated Codex lifecycle scans, synthetic128-file pool | Warm polls189.9/184.4 ms;128 opens /4,827,058 bytes each | Small revision-keyed metadata cache, recompute staleness each call | Warm45.3/35.6 ms; zero opens/body bytes; exact status hashes match; CPU109/125 ms→16/16 ms | Codex performance; source/candidate, next main launch |
| Fully invisible robot behind the orb | Avatar continues SVG animation/layout while parent opacity is0; live profile564 self samples in getScreenCTM | Preserve the full500ms fade, then remove only its invisible layout; keep custom element/state mounted | Native Chromium lifecycle confirms zero hidden getScreenCTM calls, visible animation resumes, intermediate fade remains visible and element identity remains connected | Codex performance; source ready for Claude's next integrated build |

### Measurement notes, 26 October 2026

Actual Electron40676 owns ports18765/18767 and runs `.local/builds/unified-20261025-140049-3a04c8aa/glass-pip-chat`, with the prior equivalent docking/model corrections in memory. Native45944 remains active. Do not infer the loaded app from the launch manifest alone.

Bounded Node/Chromium CPU profiles are in `.local/performance-20261026`. `scripts/profile-glass-performance.cjs` collects function/stack metadata, window visibility, dimensions, node/canvas counts and process memory without chat bodies or model/input calls. The initial main profile was dominated by `CodexLocalHistory.load` and string decoding. Both disappeared from the repeat profile after replacing only that class's future-read method with compiled, tested source linked to the exact existing dependency URLs. No frozen artifact, main process, native process or renderer was replaced in that step. The live file-read probe was restored in `finally` after eight seconds.

Initial 12-second process samples (one-core CPU percentages, not Task Manager's all-core normalization): main73.70%, renderer20.31%, GPU54.17%; main working/private1060/1422 MiB. Later main19.40% and GPU0% were observed, but the selected renderer had expanded from137 to84,433 DOM nodes and reached287.37% CPU while rebuilding history, so these are **not comparable whole-app before/after measurements**. Main V8 heap639.9 MB then203.0 MB was observed in profile snapshots, with uncontrolled GC. No general memory or GPU reduction is claimed from those samples.

The synthetic renderer harness uses the real production `ChatMessage`, tool/reasoning/Markdown trees, collapsed reader and animated field in a separate profile without preload/backend access. Both sides receive fresh parent handlers as the real layout does. Native Chromium before/after timings above are one paired run under concurrent machine load. Hidden-window animation frames were throttled to about1Hz, so this run establishes render-work savings, **not visible frame rate**. Further parity and repeated timing results follow below.

Regression checks so far:22 focused tests pass. They cover full long histories, early rejection of a64MiB unsupported file, negative-cache invalidation, incomplete appends, Unicode/cross-file deduplication, lifecycle freshness and file replacement/deletion, unchanged saved-view work, in-place message edits, current action callbacks, and retained unsent inline edits. Shared `GlassChatPiP.tsx`, discovery, native history and feature files remain untouched by performance edits. Concurrent Settings source will be included in the next frozen candidate; active native Settings changes remain staged by their owner.

### Final verification and activation

- Full desktop suite:618 passed, four opt-in profiles skipped. Final isolated candidate48 affected/Settings checks pass; TypeScript and production Vite/main/preload builds pass. Existing large-chunk advisory remains. Subsequent invisible-avatar refinement adds27 affected checks passing (including two new fade/reversal/timer regressions), updated TypeScript and a separate production Chromium fixture passing. The full618 run predates that last narrow refinement and Claude's new notch-preview work.
- Native offscreen Chromium repeat:24 expanded typing updates1689.6→35.4 ms (median63.7→0.6 ms); unchanged-history streaming-parent updates1430.5→11.5 ms (median57.1→0.4 ms). Both collapsed and expanded normalized DOM match, and before/after screenshot PNG bytes match exactly. Static parity freezes the animated field; frame callbacks in this fixture do not establish end-to-end visible animation performance.
- `scripts/profile-lifecycle.mjs` creates only synthetic JSONL files. All128 lifecycle results, including exact turn IDs/status/staleness/time, have matching canonical hashes before/after. Cold after185.2 ms still does128 opens and4.83 MB of reads; improvement comes from subsequent unchanged polls. All files remain reachable; no scan/history cap or slower polling was introduced.
- `scripts/profile-avatar-visibility.mjs` runs the real custom avatar and its ResizeObserver in offscreen Chromium. It verifies actual layout-query counts, visible animation, a250ms intermediate fade and settled hiding without disconnecting the element. Only the fully transparent robot loses layout, after the existing morph; visible motion, hover/morph, cursor handling, actions and custom-element state are retained. Vendor package files were not modified.
- Frozen `.local/builds/performance-20261026/glass-pip-chat` contains the six initial production/test changes and FINAL Settings providerUsage/runner/bridge source, plus recorded native usage assets/settings-ready bytes under sibling `native-settings`. The original manifest and all older builds remain untouched. This candidate was activated as a renderer only, after hidden/idle, all-managed-turn/selected-turn, decision, voice/perception, drawing, modal, inline-editor and durable-draft guards passed. Selected chat,10-character draft and saved window state were verified identical immediately afterward. Main40676/native45944/speech and native agents were retained.
- A subsequent user navigation/visibility change was observed and preserved. A later8-second visible-pill sample (132 nodes) had403 frame callbacks,33.4 ms p95,185.7 ms maximum interval and zero observed long tasks; CPU/GPU usage was still substantial. This is uncontrolled user activity, not a matched before/after or a claim of universal60fps. That sample motivated the extra invisible-avatar correction above. Mixed-DPI dragging, full expand/collapse compositor timing and active streaming under real model load remain manual/uncontrolled validation limits.
- Claude started new notch-preview/settings/parity feature edits while this candidate finalized. The source/hash check detected those new files and deliberately refused to replace the launch manifest. Claude owns the next fresh integrated build/full restart and manifest slot, with all performance source released for inclusion. The lifecycle cache and final invisible-avatar fix require that integrated main/renderer build; no performance restart/updater is armed. Do not overwrite this now-live frozen renderer.

Artifacts: `.local/performance-20261026/{baseline,after-history,live-visible,renderer-final,renderer-parity,lifecycle-profile,avatar}` plus full/focused test/build logs and private local activation/draft backups. No Git operations, model sends, private screen capture, microphone test, phone/watch install or native restart were used by this work.

### Pill to expanded chat transitions — 26 October 2026

Status: **implemented/tested in independent modules and an isolated integrated candidate, NOT activated**. User explicitly chose coordination through this ledger rather than direct chat messages. Claude still owns the shared GlassChatPiP.tsx notch call and runtime rebuild slot. The source layout has deliberately not been edited; its narrow integration is reviewable in `.local/performance-20261026/transitions/GlassChatPiP.integration.{before,after}.tsx`. After acknowledging the ledger request, the layout owner may run `.local/performance-20261026/transitions/apply-transition-layout.cjs`; it refuses to overwrite a source layout with any newer bytes. No build/reload/restart/manifest action is embedded in that helper.

Measured causes: expanded content was unmounted on every collapse (including all saved Markdown, math, tools, controls and conversation scroll state); expansion waited an additional50ms before the resize IPC, while both transition buttons ignored clicks during resize. New ExpandedChatSurface retains **one selected chat view**, freezes parent updates while collapsed and uses React Activity to clean up hidden effects after the existing200ms exit fade. A changed selected-chat key releases the previous view. The window/header/composer commit first; two animation frames precede the transcript's interruptible reveal, so long first mounts cannot prevent initial feedback. useWindowSizing grows immediately, keeps the200ms collapse fade and cancels stale timers on reversal. Header expand/collapse buttons now accept reversals; the size-preset guard remains.

Final paired native offscreen Chromium fixture,8 and160 synthetic saved messages, three repeated expand/collapse cycles (`scripts/profile-window-transitions.mjs`, `transitions/final3/results.json`):

|160-message scenario|Before|After|
|---|---|---|
|Urgent renderer commit|575/628/773ms|1.8/1.7/2.1ms|
|First two paint frames after expand|642/751/884ms|32/22/28ms|
|Main process receives resize request|642/751/885ms|2/2/2ms|
|Full retained transcript laid out and two paint frames|669/769/901ms|243/227/300ms|
|Cold first feedback|792ms|33ms|
|Cold full history ready|819ms|1016ms|

These are synthetic component/native-window measurements under concurrent machine load, **not a live whole-app latency or60fps claim**. The first full history mount is still expensive; it is moved behind usable window/composer feedback, not eliminated. For the short8-message case, first feedback35–50ms becomes29–32ms; full transcript65–82ms becomes79–83ms because it waits for the shell's paint. Native mixed-DPI setSize rounding differed by one DIP in this fixture; only the final screenshot capture was normalized to a fixed448x560 CSS box, after all timing/gesture measurements. Both8/160 settled normalized DOM and PNG bytes match exactly. All160 messages remain mounted/reachable, identical saved-message node identity and manual scrollTop300 survive reopening, latest parent updates appear, and rapid reversals end in the requested expanded dimensions.

Tradeoff: caching one view retains its DOM/state in collapsed mode. After explicit fixture-only GC,160-message collapsed V8 heap9.4MiB becomes23.6MiB (about14MiB extra); short chat7.7→7.9MiB. This is **not a memory reduction**. No transcript is built for an unopened pill; cache lifetime is bounded to the selected chat, and effects/queue polling disconnect while hidden. No history cap, dropped actions, or vendor changes.

Validation:28 focused tests pass;18 affected cases rerun after final frame scheduling change pass. They cover unopened/transcript laziness, retained unsent edits/current handlers, full exit fade, effect cleanup/reconnection, rapid direction changes, key-based cache eviction, independent manual sizes and source header buttons accepting reversal. Updated isolated integration TypeScript and production Vite pass; its Electron build also passed (no main/preload source changed in this transition batch). Existing large-chunk warning remains. Separate **full production GlassChatPiP** offscreen/no-preload smoke uses only80 synthetic local messages and a private draft, blocks network and denies media permissions; it verifies all messages, same message nodes, exact composer draft, hidden transcript and no console errors. Those timings include fixture settling waits and are behavior checks, not controlled A/B evidence.

Candidate: `.local/builds/performance-transitions-20261026/glass-pip-chat`; it is a compile/behavior integration snapshot and must not replace Claude's newer native/startup/greeting feature build wholesale. Use the source modules + narrow layout diff in a fresh coordinated build. Existing live/frozen artifacts and launch manifest were not changed by this batch. No real model, microphone, screen capture, user navigation, Git publication or forced restart was used. The remaining integration dependency is recorded in agent-collaboration.md.
