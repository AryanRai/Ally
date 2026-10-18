# Ally UI performance handoff — preserve the UI exactly

User request: Optimize Ally UI performance and clean up internal code. The user LIKES THE CURRENT UI and explicitly says DO NOT MODIFY IT AT ALL. This is a performance task, not a redesign. Carry out the work; do not merely propose a plan.

## Non-negotiable appearance and behavior

Keep existing colors, typography, spacing, dimensions, layout, icons, surfaces, orb/glow, animations, transitions, content, controls, gestures, keyboard behavior and navigation. Keep all features. Do not remove effects/animations, truncate messages, cap chat lists, lower rendering quality, change timing visible to the user, or hide functionality to make it faster. Changes must preserve the visual result and interaction behavior. If a performance technique would alter the UI, do not apply it. Explain the tradeoff separately instead.

## Workspace and approach

Project: C:\Users\buzza\Desktop\Projects\Active\Exo\Ally
Desktop: glass-pip-chat (React/Electron). Android: wear-app/phone and wear-app/app (Wear OS), shared code in wear-app/device-common.
Read applicable AGENTS.md and docs/agent-collaboration.md first; respect concurrent edits and claim exact scope before edits. No Git changes, resets, broad cleanup, dependency migrations or unrelated rewrites. Profile before optimizing; identify measured bottlenecks in UI rendering, streaming markdown/messages, repeated state/list updates, allocations, polling/subscriptions, lifecycle cleanup and unnecessary work. Optimize the biggest verified causes with small targeted internal changes. Compare before/after CPU/render/latency/memory using repeatable scenarios and verify the rendered UI and interactions remain unchanged. Remove only demonstrably unused internal code. Preserve errors, receipts, cancellation, retry and pending drafts. Run relevant tests and builds; report concrete measurements and limitations without inventing results.

## Work just completed — preserve it

- Power/Home/Bixby assistant entry auto-listens once; no speech goes quiet, later orb interaction still works. Semantic routing starts a new topic or offers relevant existing chats with explicit user choice; unfinished voice drafts and accepted receipts survive browsing/retry.
- Compact Android assistant activity monitor shows working/needs-input/unread/terminal status and taps into exact chats. All working/unread conversations stay reachable; no three-chat/six-chat samples.
- Queue panel now matches Ally's neutral near-black/Geist/mono style. Do not restyle it again or alter queue/edit/send/cancel/reorder semantics.
- Phone: agent-status and quick-action home widgets, Quick Settings tile. Wear: agent TileService. Shared cached read-only status refreshes on real connection/device events; manual refresh and honest stale state; no surprise microphone capture. OS widgets/tiles are added through normal system pickers.
- Stable chat order: newest CREATED first across desktop/phone/watch. Opening, reading, renaming, follow-ups, assistant output or unread changes must not promote an existing chat. Native Codex uses created_at pages and original creation times; Claude uses original transcript timing. Live activity timestamps stay separate. New chats/forks start at top.
- Visual tutor explanation card is draggable by header/grip (also keyboard arrows), clamped within viewport and on resize; pointer capture keeps hover/click-through correct. Screenshot and annotations remain fixed to display coordinates. Controls still work independently. Preserve this behavior and styling.

## Deployment and verification state

Combined frozen candidate: C:\Users\buzza\Desktop\Projects\Active\Exo\.ally-assistant-monitor-validation
Read deployment.json there and docs/agent-collaboration.md for authoritative current status. This handoff is dispatched only after that updater reports complete or partial, where partial means the watch was intentionally deferred. Do not modify this frozen candidate or its artifact manifest. For subsequent performance builds use a fresh isolated candidate and preserve unrelated existing changes. Do not restart Ally over running replies/capture or install a second competing runtime. Verify actual port/runtime ownership before any later deployment.

Previous live PID was 37368; it is NOT a reliable current PID after the update. Query current state. Existing helper33188 was armed against that exact predecessor and verifies 444 dist/APK hashes before switching.

User explicitly chose phone/desktop first, WATCH LATER. Do not install the watch APK even if it reconnects without a new user instruction. USB phone serial2C181FDH2000W3, package dev.ally.phone. Watch hardware serialRFAT8170M5N, package dev.ally.watch; old debugging address timed out. Preserve pairing, data, microphone settings, assistant role and existing Samsung googlevoiceassistant power-button route. No permission resets or real test messages/voice capture.

Validation: 81 desktop regressions plus 7 visual tutor checks pass (88 total), isolated TypeScript/Vite/Electron builds pass, phone46/watch29 Android tests pass (75 total), both APK builds and phone lint pass. Full watch lint has two existing WearPasswordInput errors in the untouched shared DeviceInboxActivity manual pairing-token form; do not hide the errors or alter that UI to satisfy unrelated lint. Read-only real native Codex list confirms positive creation times and descending creation order. Physical button/voice behavior and final monitor screenshots still need real-device checks; do not claim those were performed.

Read docs/assistant-activation-routing.md, docs/assistant-agent-monitor.md, docs/android-widgets-and-tiles.md, docs/stable-chat-order.md as relevant. Begin the performance work now, keeping the current UI visually and behaviorally unchanged.
