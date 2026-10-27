# Ally performance continuation

The user explicitly requested a new chat: “keep optimizing performance of this whole thing and keep restarting it so its in usable state.” Continue implementation and verification, not just planning. Keep this as an ongoing goal in the new chat. This handoff supersedes older runtime/PID/build information in earlier handoff documents.

## Workspace and coordination

- Saved project is Exo, cwd `C:\Users\buzza\Desktop\Projects\Active\Exo`; repository is its `Ally` subdirectory. Use that explicit workdir for root commands.
- Read `CLAUDE.md` and the tail of `docs/agent-collaboration.md`; claim exact files before editing. Coordinate other chats only through that ledger, as the user requested. No unsolicited messages or subagents.
- There are many intentional dirty/untracked files from earlier features. Preserve them. No reset, cleanup, Git publication or existing frozen artifact edits.
- Preserve the current UI, new compact notch Home, full Chats switcher, live Study speech/drawing, rich diagrams, browser/computer agent access, adaptive reasoning and all working gestures/features. Do not achieve speed by dropping history, disabling effects or replacing tools.
- Original selected native Codex chat is `01a008e7-14f8-7e32-9ea5-1609a614ca45`, **Continue MECH5720 Lab 1**. Never fork/replay/send test prompts to it. Preserve current selection and draft rather than resetting either to a remembered ID.

## Current usable runtime — revalidate before acting

Observed alive immediately before handoff:

- Electron main PID 41216.
- Private native `ally-study/client/AllyStudy.exe` PID 6960.
- Connector `ally-study/ally-server.mjs` PID 28280, `http://127.0.0.1:18783/health`, active turns 0.
- `.local/unified-build.json` points to `.local/builds/unified-20261026-013337-e572f3e5/glass-pip-chat`.
- Source hash `d94dcc9018fdcd0c6b8050f40db80ea165143c2fa8dcabf73c80818cf6492266`, version 2.
- Last detailed readback: selected native hash and local chat preserved, 7-character draft preserved, main topmost, shared Study preload present, native connected with actual caption subscription, adaptive low/medium/high routing unchanged. Source and manifest matched. Native Home and full Chat HTML returned HTTP 200.
- `nativeRuntimeValidated:false` is deliberate: physical native interaction/audio QA is incomplete.
- Inspector 9229 was closed. Temporary browser fixtures/servers were closed.

Do not restart merely because a polling call times out. Check process identity and active work first. Keep the healthy runtime running while preparing the next candidate.

## Most recent changes, now live

1. Home and Chat WebViews are retained and reparented across native Peek recreation. Chat navigates once, preserving renderer/draft state. Previous focus handlers are removed before rebinding. Native Loaded/Unloaded and surface-hide callbacks signal visibility to the pages.
2. Dedicated `notch-ui/home.html` + `home-entry.tsx` loads the compact preview without the full chat interface. Initial static JS dropped from 1,819,558 to 796,995 bytes (56.2%). This is a code-size measurement, not a measured hover-latency improvement.
3. Hidden preview polling stops. Hidden full-chat read requests wait for explicit native visibility. Unchanged streamed/history text keeps the existing Markdown subtree mounted.
4. Added an audio mixer restart guard. Windows .NET crash evidence showed `XAudio2.CreateSourceVoice` from `SoundPlayer.MixLoop`; native app had already crashed before this work. Source audit found `StartIfNeeded` could launch a new thread while the prior one was still tearing down shared XAudio resources. The guard defers/coalesces restart until that thread ends. Spoken replies and drawing logic were retained. No claim that every possible audio crash is solved.

Key files:

- `ally-study/native/AllySurface.cs`: warm WebViews, source-checked native Chat action, visibility notifications, sound restart guard and existing surface/Study pipe.
- `ally-study/apply-ally-surface.ps1`: narrow serialized native Chat ctor and Drawing.SoundPlayer.StartIfNeeded integration; private Drawing DLL is replaced atomically, original installed DLL hash unchanged.
- `ally-study/build-ally-notch.mjs`: multiple HTML entries.
- `ally-study/notch-ui/{home.html,home-entry.tsx,home.tsx,surfaceVisibility.ts,main.tsx,tsconfig.json}`.
- `glass-pip-chat/src/components/chat/{NotchHomePreview,ChatMessage,CompactUserMessage}.tsx`: memo boundaries.
- `src/lib/{notchHomePreview,studyPresentation,messageDisplay}.ts`: presentation-only projections; never rewrite stored prompts or executable drawing programs.
- Focused tests: `NotchHomePreview.test.tsx`, `notchHomePreview.test.ts`, `notchVisibility.test.ts`, `ChatMessage.test.tsx`, `studyPresentation.test.ts`.

## Evidence and limits

- 14 latest focused UI/model/visibility checks passed, plus desktop and embedded TypeScript and fresh renderer/main/native-page builds.
- `.local/notch-lag/NativeFixture.cs` and `FakeWinUI.cs` compile the real helper: 40 simulated Home/Chat mounts use exactly 2 WebViews and 2 navigations; focus/visibility/capability/action guards hold; 20 attempted overlapping sound starts coalesce until prior teardown finishes.
- `.local/notch-lag/audit-native.ps1` audited 15,977 app and 2,114 Drawing methods. Relative to the prior runtime, only the Chat ctor and sound StartIfNeeded differ; branch targets, identity and resources were preserved.
- `.local/notch-lag/{bundle-before.json,bundle-after.json,build.log,activation.log,live-verification.json}` contain the recent evidence.
- Computer Use repeatedly exposes only a minimized native root, most recently 55251340; one restore/rebind did not expose the actual notch in prior turns. Do not keep repeating that failed approach. Use isolated browser/native fixtures where possible and disclose the physical-QA gap.
- Native `ally-surface.log` logs one startup null reference during early caption binding, then binds successfully; this predates the last changes. Investigate if meaningful; do not conflate it with a new Home error.
- Broader feature/QA gaps are in `docs/unified-ally-parity.md`. Older `docs/ui-performance-handoff.md` and `performance-debugger-handoff.md` have useful performance history but obsolete runtimes.

## Continue optimizing the whole application

Profile repeatable scenarios before choosing the next changes: cold/warm notch hover, Home/Chats switches, pill expansion and docking, long saved chats, growing Study programs and live replies, diagrams, native/renderer idle work and provider history reads. Keep source-code, synthetic fixture and physical runtime evidence distinct.

Useful remaining investigations, not assumed diagnoses:

- First cold WebView initialization still occurs on the native UI thread; caching improves subsequent mounts but does not prove cold-open speed.
- Long cumulative Study programs are reparsed by Acorn for display; measure large streamed replies for repeated parsing/render work.
- Full native Chat polls selection/running/history and can repeatedly materialize native histories. Measure actual costs, coalesce duplicate requests and preserve current exact-chat routing, errors, approvals and cancellation.
- Inspect native animation/layout/region work, renderer long tasks, retained-view memory and lifecycle cleanup. Measure with realistic fixtures; the full app also includes desktop, connector, voice/drawing and existing device paths.
- Audit the sound restart guard under actual native audio/device lifecycle if accessible. Do not mute speech or disable features to avoid testing it.

## Safe build and activation

1. `powershell.exe -NoProfile -File build-ally.ps1 -StageOnly` prepares a new frozen candidate and builds new native-page assets. It does not switch the active desktop manifest. Do not edit an existing candidate or original installed native app.
2. Adapt `.local/notch-lag/activate.ps1` for the new exact candidate. It contains an OLD hardcoded candidate path; never run it blindly.
3. Guard connector active0, managed runs/decisions/capture/perception idle and current draft durability. Save/close a visible tutor only through the existing guarded helper. Never interrupt active work just to make deployment convenient.
4. Inspector helpers: verify exact main PID/path, then `node -e "process._debugProcess(PID)"`. `.local/debug-eval.cjs` evaluates a saved JS expression in main. Inspect `exceptionDetails`: exit code0 alone does not mean success.
5. `.local/native-study-validation/pre-restart.js` makes a fresh guarded backup; `.local/parity-validation/save-tutor-for-rebuild.js` handles an idle tutor. `.local/native-study-validation/quit-desktop.js` checks the backup/selection/draft and gracefully quits.
6. Close only the exact private native process when idle. A genuinely crashed/absent native process is allowed by the latest activation script. Stop only the exact owned idle connector after matching PID, command and listening port.
7. Recheck source hash, atomically activate candidate manifest and run `start-ally.ps1`. The launcher prepares private native adapters, starts desktop, connector and native app. Keep the app usable after each tested slice instead of leaving all changes staged.
8. Adapt `.local/notch-lag/verify-live.js` and read back current chat/draft/topmost, native connection/captions, endpoints and source hash. Close your inspector using `.local/identity-build/close-inspector.js`. Do not replay an actual user request to test a restart.

The preceding chat has released all implementation/rebuild scopes. The new chat owns the next slice and should continue work now.

## Latest continuation checkpoint (same chat, 26 October 2026)
Read the final ledger entries for the live richer-card/natural-speech slice and pending PDF-control guidance. Live desktop32376/native42328/connector18148 run unified-20261026-022441-1c03e6fb; verify current identities before acting. Performance caches, natural user-facing sentence speech, longer active-work timeout, larger interactive cards and explicit local image assets are deployed and verified as detailed in .local/study-performance. Current tested pending candidate is unified-20261026-023424-718e8c5d/sourceHashd53c56dd707dceea0ac1166e58eb206e4bc0328323fc36373ad6fc9112737e8e. It adds browser/Study guidance for separately installed Windows Computer Use when browser-tab automation is unsupported and desktop interaction is permitted. No security restrictions or explicit denials may be bypassed. User's actual lecture PDF is already onpage24; do not replay old22→23navigation. The native turn was active atcheckpoint, so do not force a restart. Scratchactivate.ps1 is exactpendingcandidate+main32376 and checks native playback completion, connector/managed/capture/perception idle and durable draft. Revalidate, reopen inspector onlywhenneeded, activate whenidle, verify-live.js/verify-tools.js, closeinspector. No inspector leftopen. The app goal currently reports paused; all scopes remain owned by this chat and the current explicit fixes remain authorized.


