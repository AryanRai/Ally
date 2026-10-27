# Unified Ally: native notch and floating pill

26 October 2026. This is the implementation and feature inventory, not a claim of completed native runtime QA.

Current implementation and runtime acceptance evidence is tracked in [the parity checklist](unified-ally-parity.md). The tables below describe the original integration inventory; dated checks at the end are historical. Full feature parity is still incomplete.

## One project

The canonical project is `Active/Exo/Ally`:

| Location | Contents |
| --- | --- |
| `ally-study/` | Native UI adapter, connector, embedded chat, scripts and private runtime |
| `ally-study/client/` | Private runtime bytes, including matching `AllyStudy.exe` / `AllyStudy.pri` |
| `ally-study/profile/` | Private native identity and saved Study context; ignored by Git |
| `ally-study/tools/` | Offline metadata/drawing tools and local Cecil dependency |
| `glass-pip-chat/` | Existing Ally pill, full chat, agents, Circle, drawing, approvals, device bridge |
| `speech-service/` | Existing Ally local speech service |
| `.local/builds/` | Versioned desktop candidates; no overwriting of running builds |
| `build-ally.ps1`, `start-ally.ps1` | Unified preparation and next-launch entry points |

The former prototype was copied, including runtime files behind its installed-app junctions, into independent private files. No installed binary was changed. One locked WebView cookie database could not be copied; the remaining app identity and profile were copied. The previous folder remains available while its already-running backend owns that profile. It contains a pointer to this repository. Profiles are snapshots, not a two-way live migration; close the old runtime before switching. On the first unified launch, the launcher backs up the new private profile and copies the latest non-WebView profile data from the closed former runtime once. It then records completion so later starts cannot overwrite new Ally history. Older frozen Ally candidates are retained for rollback.

## Interaction

The native compositor remains responsible for the notch silhouette, hover expansion, voice controls and original screen presentation. The chat tab embeds the existing Ally chat components. The existing Electron window stays warm in the background.

Drag the middle of the native top strip past a 14 DIP threshold to detach into Ally's collapsed pill. The strip's outer buttons, chat contents and file-drop gestures keep their original input. The desktop converts physical native coordinates to DIP, positions the pill on the pointer's monitor, waits for its renderer to acknowledge painting, then transfers the held drag through Windows' normal window movement. Releasing an actual pill/window drag within 32 DIP of a display's top edge returns to the notch on that display. Programmatic moves and resizes cannot dock it.

An authenticated, per-run named pipe coordinates visibility. There is no per-frame HTTP polling or new process per mouse movement. The mouse hook inspects down/up events and only decodes movement during a candidate notch drag. Native UI reflection is confined to its UI-thread message callback. The original compositor and voice triggers remain installed.

Circle to Search keeps `Ctrl+Shift+Space` and its text question workflow. Before screen capture, it waits for the notch's hide acknowledgement and a compositor settling delay, then uses the existing exact crop handoff. Cancel returns to the prior surface; submitting makes the existing Ally window available to continue the selected chat. Native `Ctrl+Alt` remains registered by Study.

## Feature decisions

“Staged” means code/build checks, with native interaction still to be tested. “Keep” is the chosen implementation for integration. No existing Ally feature has been removed.

| Feature | Study / native strength | Existing Ally strength | Decision and current integration |
| --- | --- | --- | --- |
| Top notch, hover and expansion | Polished native composition | No native notch | **Keep Study.** Original chrome retained. Live check 26 Oct: hover opens AgentPeek (536×138 px) and collapses on exit; dock arrives expanded with the greeting. |
| Floating collapsed pill | Not available | Existing pill, quick input and controls | **Keep Ally.** Native-to-pill drag adapter staged. |
| Expanded floating chat | Native chat tab | Existing full Ally chat | **Keep Ally's window.** Drag its top region back to dock; staged. |
| Chat tab in the notch | Native tab placement | Sidebar, messages and composer components | **Combine.** Reuses Ally components inside native WebView. |
| Shared selected chat | Native study conversation | Real linked agent sessions | **Keep Ally's session authority.** Linked chats sync both ways; empty/unlinked chats still need the first session link. |
| Codex / Claude | Native own-provider protocol | Existing authenticated agent integrations | **Keep Ally.** Same real session, folder and permissions; no automatic fork. |
| Recent chats / older pages | Native recent view | Native session discovery | **Keep Ally.** Updated ordering, paginated desktop discovery, and notch Load more. Notch discovery failure handling still needs parity with desktop. |
| Ctrl+Alt screen explanation | Refined native trigger and screen capture | Separate Circle workflow | **Keep Study trigger.** Correct primary screenshot/image delivery staged and tested synthetically. |
| Circle / text about an area | Different native workflow | Existing Circle overlay and exact crop ownership | **Keep Ally.** Native hide/restore integrated; shared selection must finish opening before capture. |
| Screen and multiple images | Native screen/environment payload | Agent image input | **Combine.** Captures are read from `turn` (where the native client writes them) and forwarded as files; image data URLs are removed from prompt text. |
| Streaming voice / drawing response | Original native presentation | Existing agent events | **Combine.** One authenticated SSE connection relays native programs as they arrive, without waiting for the full answer or polling history. |
| Ordinary text answers | Native drawing/speech program | Markdown chat | **Keep both presentations.** Plain prose is safely quoted into native speech; chat uses Ally's renderer. |
| Speech input/output | Native voice interaction | Configured Google speech and local service | **Use Ally's configured Google speech in Study.** Native mic timing/playback QA pending; local speech fallback in Study is not yet integrated. |
| Paste images / drop files / attach | Native capture controls | Existing attachment transport | **Introduce Ally transport into notch.** Paste/drop/picker and downloads staged; failed sends keep drafts/files in the current WebView. File drafts do not survive process restart. |
| Streaming chat text | Native presentation | Existing live text | **Keep Ally.** Notch chat renders live text before completion; the docked notch itself mirrors the pill's running reply as a native text response, then returns to idle after a reading delay. |
| Greeting | Static | Model-written greeting | **Keep Ally's.** Same text in the pill, the notch on dock and the notch chat composer. |
| Settings | Native Settings window | Ally Settings | **Combine in Ally Settings → Notch & pill.** Ally notch toggles plus native voice, speed, highlight, cursor, drawing-sound and capture preferences applied live through the surface pipe. Account/billing stay native. |
| Approvals / stop / queued input | Native job surfaces | Real agent approval and input ownership | **Keep Ally.** Notch approval cards, exact-turn Stop and supported queue routes retained. Native voice can wait while Chat handles an approval. |
| Draft recovery | Native composer behavior | Quota-safe drafts in latest Ally | **Keep Ally's desktop fixes.** Notch text uses guarded session storage; cross-surface draft sharing still pending. |
| 2D annotations / spoken steps | Native drawing engine | Visual tutor board | **Keep Study native presentation.** Offline engine fixture covers circle, arrow, text and speech. Broader primitive/animation QA pending. |
| Interactive diagrams / sketching / resize | Native visual presentation | Existing sandboxed board and eight resize handles | **Keep Ally capability.** Existing board retained; a common drawing session across both surfaces is not yet implemented. |
| Multi-monitor notch | Native monitor/DPI placement | Display-aware Circle and floating window | **Combine.** Cursor-monitor correction, DIP handoff and per-display top docking staged. Physical mixed-DPI QA pending. |
| Web search / image search | Native specialized surfaces | Agent tools | **Pending protocol adapter.** Agent tool availability does not establish native UI parity. |
| Integrations | Native service integration screens | Agent MCP servers | **Keep Ally agent integrations; native screens pending.** No substitute account/session token is fabricated. |
| Delegated jobs / task dock | Polished native job cards | Agent runs and activity | **Pending native protocol mapping.** Existing Ally activity remains available. |
| Routines / proactive workflows | Native routine UI | Existing perception features | **Keep existing features for now.** Their controls and consent models have not been unified. |
| Context compaction | Native fold protocol | Agent-owned context management | **Pending adapter.** Current native compact response is a placeholder and does not compact an agent session. |
| Native 3D drawing | Original drawing engine capabilities | Interactive HTML diagrams | **Pending broader protocol/fixture coverage.** No claim of 3D parity. |
| Extra chat context | Native study history | Ally chat search/read/forward | **Keep Ally agent tools.** Legacy context panel snapshots remain available; file/artifact context is not automatically copied from every referenced chat. |
| Phone / watch / assistant | Separate native surfaces | Existing linked Android and Wear apps | **Keep Ally.** Existing bridge and device functionality retained; no device update was performed. |
| Appearance / robot / meeting tools | Native notch appearance | Existing Ally controls | **Retain Ally capabilities.** Notch control placement and full appearance parity pending. |

## Retirement list

After native gesture and feature QA, the separate prototype launch location and duplicate context-selection setup page are candidates for retirement. A second custom notch chrome, second floating pill, provider loop and replacement Circle overlay are unnecessary: the current implementation reuses the existing surfaces and agent routes. Existing Ally features remain present until the corresponding native integration is verified and this comparison has been reviewed. Specialized native jobs, search, routines and compaction must not be silently marked complete.

## Smoothness and checks

The changes preserve native hover/animation ownership, warm both surfaces, wait for the floating renderer to paint, avoid disk writes on unchanged selection, and stream selected native replies from the actual agent run. Synthetic tests cover negative monitor coordinates, physical-to-DIP conversion, top docking, authentication, stale acknowledgements, capture hiding, cancellation, fragmented UTF-8 SSE, early program delivery and no program replay. These establish routing and state behavior, not a frame-rate or speech latency benchmark.

Before declaring parity, measure native hover/expand/collapse and drag continuity against the original client on the same displays; verify mixed-DPI edges, rapid detach/dock/cancel, native microphone interruption, first spoken/drawn output, approval waits, shared drafts and visual sessions. No native process was launched for this work, and no real model, microphone, screen capture or speech request was made.

Validation for this candidate: 51 focused desktop tests and 29 standalone connector tests pass; desktop TypeScript, embedded TypeScript, production renderer, Electron and embedded builds pass. Static native inspection checks 15,977 methods with zero invalid branch targets, one adapter initializer, preserved assembly identity/resources, a listed helper runtime dependency and matching resource-index alias. The helper loads in .NET without attaching any UI hook during verification. All 745 private client files are independent of installed hardlinks/junctions. PowerShell 5 and 7 produce the same source hash; 399 desktop source/asset files match the frozen candidate. The unchanged build-tool warnings concern large bundled syntax-highlighter chunks and Vite's CJS API.

## Next normal start

`build-ally.ps1` prepares a fresh desktop candidate, embedded assets and private native adapters without launching. `start-ally.ps1` verifies the source hash, checks for occupied runtime ports, starts the prepared Ally desktop, waits for its shared selection API, then starts the native client and connector. It refuses to stop an existing desktop/backend. Close old instances normally before choosing this launcher. Directly opening the executable skips the required environment and connector setup.
