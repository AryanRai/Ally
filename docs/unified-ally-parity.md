# Ally parity acceptance checklist

Updated 26 October 2026. Study is the primary annotation flow; rich diagram capabilities are retained, and legacy boards remain compatible. Implemented, built, and physically verified are separate states. This checklist extends [the integration inventory](unified-ally.md).

## Current live build and staged changes

The running candidate is `.local/builds/unified-20261025-180330-fbd475ae/glass-pip-chat`, source hash `290779790809e494848f20712e9c318bac729b026378800ab0a0afaeb50f06a1`. Activation verified selected desktop chat, native selection file hash, composer draft, topmost window, adaptive Study effort and both effort-restoration paths. The visible, non-sketching old tutor board was saved locally before a normal close for the first rebuild. No user message was replayed.

The first compact prompt reduced the pasted example from 5,091 to 1,483 characters (71%). The current prompt explicitly allows agent tools for requested actions and advertises the on-demand advanced drawing reference; the same sample is now 2,019 characters (60% smaller). Images, screen dimensions and highlighted text remain. Obsolete jobs/plan/browser instructions, duplicated metadata and image paths stay removed. This measures prompt size, not model latency.

The following changes are **built and live**:

- An on-demand `native_study_reference` tool provides native graph, timeline, scene3d, figure animation and diagram-card signatures. Detailed APIs are returned only when requested.
- Native stream extraction accepts tool commentary before drawing and multiple JavaScript fences as one progressive program. The first beat is delivered before completion; previously emitted drawing is not replayed.
- `GlassChatPiP.tsx` now integrates the previously reviewed retained transcript and immediate expansion sizing. The guarded patch matched the original source; notch preview and peer changes are preserved.
- Selected local chats without a real session are shared with Study. The first returned session is adopted into the same local chat, without a duplicate chat or a standalone fallback. Navigation remains read-only.
- Study's drawing format no longer disables agent actions. The selected and standalone prompts distinguish agent tools from the isolated drawing interpreter, which still has no DOM/network/imports. Existing chat permission and approval behavior remains unchanged.

The follow-up recents partial-failure retention/pagination and Claude read-only access to the static drawing reference are also live. Activation waited for a real native turn to finish. `build-ally.ps1 -StageOnly` now prepares candidates without native installation or replacing the active manifest. No updater remains pending.

## Real agent action verification

An isolated request went through the actual rebuilt Study bridge under `readonly` permissions. The agent used `cua_repl.js` three times to open a local QA page, type a unique marker, click its button, and inspect the result. A server-side local proof recorded that exact marker. The run completed in 22,389 ms, returned a fenced two-cue spoken Study program, and preserved the original selected MECH5720 chat. No original conversation was replayed or sent a test request. The generated test session was archived afterward through the supported app tool.

The actual agent reply included commentary before its fenced program. Relaying it in 17-character chunks produced one valid program; the bundled engine extracted both speech cues without replay. This verifies action execution and native-program compatibility, not physical native audio playback. The separate direct browser check has a screenshot in `.local/parity-validation/browser-actions.png`; it is not mislabelled as a screenshot from the agent's own ephemeral tab.

## Original tutorial acceptance source

The bundled `onboarding-intro-v2-windows.mp4` is a 117.76-second talking-head introduction. The actionable drawing tour is `HeyClicky.App.Onboarding.TourStepNotes.DrawStepNote` in the private UI assembly. Its instructions require the following, beyond basic primitive fixtures:

| Original interaction | Implementation evidence | Physical acceptance remaining |
| --- | --- | --- |
| Ring a real title/control | Native pieces `ring()` | Actual target placement and mixed DPI |
| Trace an actual panel | Native pieces `trace()` | Actual panel coordinates and stroke reveal |
| Point at and connect real controls | Native pieces `point()` / `connect()` | Pointer timing and target accuracy |
| Highlight actual text | Native engine/pieces `highlight()` | Accurate line bounds and legibility |
| Wipe drawings on a spoken beat | Native `startOver()` | Reverse erasure synchronized with speech |
| Three rich diagram cards | Native `paper()` and inner drawing area | Drag, close, resize and continuity across surfaces |
| Working 20–40-part 3D scene | Native `figure()`, materials, groups and `tick()` | Actual 3D playback, labels, camera and interaction |
| Screen-specific spoken beats | Native `step()` / `say()` | First audio/mark timing, interruption and screen changes |
| Open notch / pop integration apps | Original `showNotch()` and native showcase handlers | Execute against actual integrated controls |
| Fade scene and notch at completion | Original `fadeAway()` handler | Observe completion, input and visibility recovery |
| Suggested follow-up pills | Original `nextQuestions()` handler | Selection continues the same real chat |
| Tutorial job cards and tuck into dock | Original `tourJob()` / `tuckJobs()` | Real job/activity mapping; demonstration cards alone are insufficient |

The retained engine also exposes photos, links, buttons, handoffs, walkthrough waits, sound cues, live edits, camera changes and readouts. Presence of an engine function does not establish working backend behavior.

Offline interoperability uses the actual bundled engine 1.6 **and native pieces**. Six cases pass: graph, timeline, illustrated 3D, animated mechanical figure, card, and the original tutorial's drawing capabilities. The combined case produces 102 marks, five speech cues, 35 3D parts and a live animation callback, with no engine warnings. Incremental 137-character chunks produce the same mark count without replay. These checks do not claim physical native playback or specialized show/task/search parity. See `ally-study/tools/ally-advanced-drawing-smoke.cjs`.

## Complete feature inventory

| Capability | Implemented / staged | Runtime verified | Remaining acceptance or implementation |
| --- | --- | --- | --- |
| Native notch / hover expansion | Original compositor retained | User confirms both hover expansion and exit collapse work smoothly after rebuild | Automated physical hover, rapid entry/exit and frame timing |
| Detach/dock / shortcut | Native pipe, acknowledged handoff; Ctrl+Shift+C toggle | Prior actual toggle passed | Held drag, rapid reversal, edge docking, monitor transitions |
| Floating pill remains above apps | Windows-compatible level and lifecycle repair live | Actual topmost readback and prior cleanup call passed | Repeat focus/overlay/movement interaction |
| Smooth pill/chat resize | Reviewed retained transcript/sizing integration live | Synthetic prior renderer timings; live source verified | Actual repeated floating expansion/collapse |
| Shared selected real chat | Versioned navigation live | Exact selected ID preserved on reload | Rapid navigation during async history loading |
| New-chat session linkage | Local adoption fix live | Synthetic same-local-chat adoption; real isolated native bridge send | First send from each physical surface, same identity afterward |
| Discovery / recents / pagination | Existing discovery and partial-failure retention live | Prior original history read; provider-failure regression | Actual complete lists and stable navigation |
| Browser / computer agent actions | Drawing-only restriction removed in both routes; real tools retained | Actual Study bridge typed/clicked/verified isolated Chrome page | Individual tool availability still depends on the agent and connected app |
| Text drafts and attachments | Desktop durable drafts; native session storage and file transport | Existing draft preserved; attachment byte routing tests | Common cross-surface durable draft/file store and conflict handling |
| Ctrl+Alt screenshot teaching | Actual image routing, progressive native code, low reasoning live | Saved real answer renders offline | Isolated physical capture-to-speech-to-drawing timing |
| Circle / text / selected area | Existing crop ownership, context and native suppression | Existing synthetic/native capture evidence | Actual area gestures across both displays |
| Streaming voice / playback / Stop | Existing Google streams and linked cancellation; timeouts fixed | Historical speech loopback; transport regression | Physical mic/playback interruption and measured first output |
| Configured speech fallback | Desktop local transcription retained | Not verified in native Study | Native local speech selection/fallback and recovery |
| Native 2D / cards / edits | Engine retained; on-demand API live | Broad offline fixtures | Actual editing, resize, closure, sound and speech synchronization |
| Native advanced / 3D / animation | Engine retained; reference live | Broad offline fixtures including 35-part mechanism | Physical native 3D/tick/camera acceptance |
| Interactive HTML diagrams / sketching | Shared Study session; HTML/SVG cards follow native captions; stable IDs support progressive updates | Cue/model tests, actual helper fixture and live tool catalog/caption binding | Physical spoken-card timing and controls on both surfaces |
| Multi-monitor / mixed DPI | Cursor-monitor placement, DIP conversion and docking | Synthetic geometry regressions | Physical mixed-DPI moves, negative coordinates and edge crossing |
| Web / image search native presentation | Agent tools and native presentation code retained | Not verified | Authenticated native protocol adapter, photo results and citations |
| Integrations controls | Existing MCP integrations and native screens retained | Usage/settings work previously verified | Real integration metadata/control adapter; no fabricated session tokens |
| Jobs / task dock / activity | Existing Ally runs and activity retained | Existing bridge tests | Native job lifecycle and original dock/show behavior mapping |
| Routines / proactive workflows | Existing perception and original routine UI retained | Not unified | Real schedule/workflow adapters and unified controls |
| Real context compaction | Agent auto-compaction exists; native endpoint placeholder remains | Not verified | Invoke actual supported owning-session compaction and report completion |
| Approvals / queued input / Stop | Existing authenticated exact-turn routes retained | Synthetic transport tests | Isolated actual approval wait, queue, cancel and resumed drawing |
| Chat-context search/read/forward | Existing Ally MCP tools retained | Prior tool tests | Cross-surface context controls; no unauthorized sends |
| Phone / watch | Existing bridge/apps retained | Historical checks only | Regression of pairing, selected session, input/voice and notifications |
| Appearance / robot / meeting | Existing controls retained | Prior fixes/tests retained | Native control placement and cross-surface presentation |
| Combined Settings / usage | Completed prior integration retained | Prior usage checks | Regression during future builds; preserve existing choices |

## QA evidence and interruption

Current checks: all 37 connector tests pass, along with 24 desktop prompt/reference/bridge/new-chat/transition checks and final desktop TypeScript. The follow-up adds six passing recents/runner checks and passing desktop/embedded TypeScript. Do not sum overlapping earlier runs.

Computer Use listed only the native root window (ID 26482122), which reports `window is minimized`, despite the user confirming that the notch is visible. One restore/fresh-binding retry and a fresh observation after the user's action still failed. The native popup was not independently targetable. This prevents a claim of actual hover/drag/native playback QA using this helper.

A prior-turn physical Escape stop was honored. The user's next request explicitly resumed parity/rebuild work. After this rebuild, the helper still exposes only a minimized native owner window (32709122); one restore/fresh-binding retry did not expose the actual notch. The user independently confirmed smooth hover expansion and collapse. Automated physical drag/mixed-DPI and native playback QA remain unverified. Broad parity is **incomplete**; the table identifies the remaining implementations and acceptance checks.

## Performance evidence still required

The prior retained-transcript fixture measured first shell feedback at 22–32 ms versus 642–884 ms, and reopened history at 227–300 ms versus 669–901 ms. It also retained approximately 14 MiB more collapsed fixture heap; first full mount remained costly. These are synthetic fixture results, not new live native benchmarks.

Before claiming original-quality smoothness, record idle CPU/working set and background activity, hover/expand/collapse frame intervals, dock/detach completion, and capture → first text → first spoken cue → first mark, using isolated content. Report model, transport, synthesis and paint time separately. The real browser action test completed in 22.4 seconds; no comparative model-latency speedup is claimed.

Resource sampling was attempted after the follow-up activation. Early CPU samples used an integer overload and are invalid; they are not an idle-performance result. The corrected sampler refused to run when another live native turn was active. No low-idle-resource claim is made from those samples. All resource and browser QA artifacts are ignored local files.

## Browser connection and Ally identity — 26 October 2026

Fixed the actual extension/native-host link. Chrome does not inherit the private Ally process environment; the original host therefore read a stale original-app BrowserBridge endpoint. A private launcher now binds its unchanged protocol worker to this copy's profile. Without that binding the real worker returned ready(selected=false,app=false); with it the real handshake returned selected=true,app=true. The exact stale original host was disconnected only after its endpoint had no listener. Native host origins and extension key/ID/permissions remain unchanged.

The extension is now named Ally and uses the canonical desktop/README blue mascot in its popup, welcome page and normal/offline toolbar icons. OS-specific Mac wording is neutral. Updated private bundled/exported copies and the matching user-exported original data folder, with the latter backed up under private branding-backup/exported-browser-extension. The installed original HeyClickyApp package was not edited. User reloaded the extension; Computer Use observed Ally with its mascot in Chrome's toolbar menu and Ally: connected after the app restart. Subsequent popup input became unavailable while the user was interacting, so no further input was sent; the freshly branded popup itself was not independently opened in final QA.

Native Study's Assets/AppIcon.ico, taskbar icon and private apphost icon resources now use the same mascot. PE code sections are byte-identical across the icon update. Original installed apphost/icon/host still match their private pre-change backups/worker. Existing custom native tray glyph rendering was not changed by this app/taskbar icon update.

Fresh production desktop and embedded builds passed; active candidate unified-20261025-173120-72dff00b, sourceHash925b35e29fe001ed5c103a8cccd8fc9f1ce36d0de76f7b2a7a5fd641ae14f7a1. Main39576/native45020/connector48016. Source hash matches; exact MECH5720 session and desktop local selection, durable draft and topmost verified. Activation was guarded by native/desktop idle checks; no turn replay or model send. Isolated launcher fixture passes profile binding, Windows argument roundtrip, small/large fragmented native frames, immediate flush and EOF cleanup. Installer is idempotent with active private host. Broad feature parity remains incomplete as listed above.


## One Study teaching flow — 26 October 2026

Circle/shake selections now attach an exact crop to the shared Study lesson. Their pill questions/follow-ups use native CompanionSession.SubmitTextAsync and the existing live voice/drawing engine; Ctrl+Alt continues to use that same native session while either pill or notch is active. The old independent agent-annotation tool refuses new Study boards with a clear direction to the native path. Legacy board support remains for compatibility. Normal text chat outside a Study lesson retains its normal presentation.

Interactive HTML/SVG diagrams remain as isolated rich teaching cards through study_diagram. The same lesson ID carries steps and user sketches across native/desktop identities. Stable card IDs update progressively; new IDs represent the next step. A card's exact say() cue is matched against real native CaptionChanged events, so model/tool completion does not advance the teaching display. Manual step review takes priority. Cards survive pill-to-notch docking. Existing sandbox limits remain: local scripts/controls only, no network, filesystem, parent/tool access, forms or navigation. Agent actions stay in the existing agent tool/approval flow.

The finite desktop-to-native record carries the original selected provider/session/permission, exact image and source pixel geometry. Native input and connector records are atomically claimed once, expire, and never resend after uncertain delivery. A newer chat selection cannot redirect an accepted crop/question. Read-only and full permissions are preserved. Crops are mapped back to full-display native pixels rather than treated as a full screenshot.

Forced low effort is removed. Study uses a local pre-turn rule with low for explicit routine requests, medium for ambiguous visual explanation, and high for technical derivation/debugging or multi-step work. It does not run an extra classifier or change the selected model. Both local and desktop Codex restore the prior effort before releasing the turn; tests cover low/medium/high. Standalone Study also uses the same routing policy. This policy is a heuristic over question/current context, not a claim of visual difficulty classification or measured latency improvement. Reasoning protocol guidance was checked against https://developers.openai.com/codex/app-server and https://developers.openai.com/api/docs/guides/reasoning.

Validation: 139 focused desktop checks across 13 files; all 39 connector checks; desktop TypeScript; both production builds; six actual-engine/pieces fixtures. An isolated compiled instance of the real native helper verifies exact question/crop/trigger, native voice/drawing entry point, one caption subscription, accepted receipt and replay rejection. Cecil audit covers 15977 UI methods: only AppHost.WireRealServices changes for real service binding, all 34066 branch targets valid, assembly identity and embedded resources preserved.

Activation also exposed an existing shutdown bug: circle/tutor cleanup sent state after the main window was destroyed. Both now use a tested safe sender. Seventeen focused follow-up checks pass, and an isolated real Electron process exits normally after the same destroyed-window will-quit publications (exit0). The old error dialog was dismissed through Computer Use; no active task was interrupted or forcibly terminated. The separate hung QA fixture was terminated by its verified process identity only.

Final live readback: main33320/native21044/connector18548, current source hash matches manifest, original MECH5720/local selected chat/draft/topmost preserved, Study preload API present, native peer connected and real caption callback bound. Actual MCP tools/list returns study_diagram, native_study_reference and visual_tutor_read. No real user prompt replay, model test send, account/permission change or Git publication. Full physical gesture → native speech → interactive card playback, mixed-monitor placement and first-output timing were not newly exercised in this turn. Broader feature parity remains incomplete as listed in the inventory.
