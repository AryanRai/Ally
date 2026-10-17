# Realtime agent (perception sessions)

Ally can sit in on a meeting, a lecture, or your normal work. It listens and watches, decides what matters, and brings in **one chat you pick** when it can help.

## Using it

1. Click **Realtime** above the composer and pick a Codex or Claude Code chat.
2. Choose a mode:
   - **Meeting:** recalls past decisions when they come up.
   - **Lecture:** connects new material to your project.
   - **General:** mostly quiet.
3. Choose what Ally may use: **Computer audio**, **Microphone**, **Screen**.
4. Notes appear as cards over the chat:
   - Click a card to expand it, then **Explain in full** to ask for more.
   - **×** dismisses a card, and Ally raises that topic less afterwards.
   - Low-priority notes collect under "earlier notes".
   - Important ones also raise a desktop notification when Ally isn't focused.
5. **Circle to Ask** during a session includes the last 30 seconds of audio and screen text.

Ally's notes are added to the selected chat as normal turns, so you see them in Codex or Claude Code too. **Fork** (⋯ menu, Codex only) makes a separate copy to work in instead. Ally never forks on its own.

Proactive turns run **read-only**. The relevance gate decides whether to *look*, never whether to *act*.

## Pipeline

```
mic / computer audio ──VAD──▶ Google Chirp (per utterance) ─┐
screen thumbnail ─change?─▶ snapshot ─▶ Windows OCR ────────┼─▶ timeline (10 min)
foreground window ──────────────────────────────────────────┘        │
                                                                     ▼
                                       relevance gate: Jev (or basic heuristics) + policy
                                                                     │ triggers
                                                                     ▼
                         turn queue (one at a time; your asks first) ─▶ startAgentRun (selected chat)
                                                                     │
                                                                     ▼
                                     cards (priority, quiet mode, dedupe, dismiss cooldown)
```

| Piece | File | Notes |
|---|---|---|
| Contracts | `electron/perception/types.ts` | Observations, decisions, turns, cards. The renderer re-exports them from `src/types/perception.ts`. |
| Timeline | `timeline.ts` | Monotonic order plus wall-clock stamps. `window(ms)` answers "the last N seconds". |
| Screen | `screen.ts`, `screenHash.ts` | 192×108 thumbnail every 1.5 s. A dHash plus a pixel-difference check, and a change must hold still for a second frame (cursors and animations don't count). Only then a native-resolution snapshot (≤2560 px) and OCR. |
| Windows helper | `winHelper.ts` | One PowerShell process for the foreground window and built-in Windows OCR (about 0.1–0.2 s each). |
| Audio | `src/lib/perceptionAudio.ts`, `audio.ts` | Separate mic and loopback streams. Energy VAD with an adaptive noise floor, 300 ms lead-in, and utterances of 25 s at most. Each utterance is one `recognizeLive` call (Codex's speech module). Mic text that repeats the speakers is dropped. |
| Relevance | `jev.ts`, `relevance.ts` | Jev asks typed questions (relevant, question, new topic, can help, proactive, interrupt, urgency, category). The deterministic policy covers thresholds, mode offset, topic cooldown, rate limit and batching. Without Jev, the basic heuristics are used and shown as degraded. |
| Turns | `orchestrator.ts` | Serialized. Your asks cut in and cancel a proactive turn. Waiting proactive triggers merge. Turns time out after 3 min (proactive) or 10 min (asked). |
| Cards | `cards.ts` | Priority from the outcome. Quiet mode caps it. Duplicates are dropped for 10 min. Dismissing cools a topic for 15 min. |
| Engine and IPC | `engine.ts`, `ipc.ts`, `settings.ts`, `scope.ts` | The session is saved and returns *paused* after a restart. The chat scope is built once from the chat's own history. |
| UI | `src/components/perception/*`, `src/hooks/usePerception.ts` | Realtime bar, session picker, cards, diagnostics (pipeline, timeline, decisions, turns, settings). |

## Jev

Add a TypeSafe API key in **Realtime ⋯ → Diagnostics → Settings** (or set `TYPESAFE_API_KEY`). The key is stored in `perception-settings.json` in Ally's user data, used only by the main process, and never sent to the renderer. Without a key, Ally uses basic heuristics and labels the bar "basic relevance (no Jev)". It never pretends Jev answered.

## Verified (2026-10-17, isolated Ally instance)

- **Screen:** snapshot and OCR at 2560×1440 read browser tabs and window text cleanly.
- **Audio:** speech played through the speakers was captured by loopback, split into two utterances, and transcribed exactly by Chirp.
- **Gate:** basic relevance triggered.
- **Turn:** a read-only Claude turn on the selected chat produced a grounded note ("From earlier: …"), shown as a desktop card.
- **Restart:** the session came back paused.
- **Tests:** timeline, change detection, relevance (recorded timelines; Jev success and failure), turn queue and cards. The whole suite passes.

## Rich cards (done)

A note can carry a small structured view: an `ally-ui` JSON block with **facts**, **list**, **table**, **callout**, **code**, **progress** or **actions** (follow-up questions as buttons). `electron/perception/cardUi.ts` validates and caps it in the main process, and `CardUi.tsx` renders it as text only. Unknown or malformed blocks are dropped, and buttons only ever send a follow-up question.

## Linux and macOS (done, untested on those systems)

`platformHelper.ts` picks the backend:

- **Windows:** the PowerShell helper (tested).
- **Linux:** `xdotool`/`xprop` for the active window (X11; on Wayland it's unavailable) and `tesseract` for OCR.
- **macOS:** `osascript` (window titles need the Accessibility permission) and `tesseract`.

Computer audio on Linux uses the PipeWire/PulseAudio "Monitor of …" input. On macOS it needs a loopback driver such as BlackHole. Missing tools show up as "unavailable" in diagnostics.

## Assigned to Codex (see docs/agent-collaboration.md)

- **Phone and watch delivery of cards:** via `onAssistCard` / `dismissAssistCard`. Until then, phone/watch priorities fall back to desktop notifications.
- **Phone and watch control tools:** via `registerDeviceTool` on the ally_chats server, with on-device confirmation.
- **Speaker diarization:** an optional `speaker` on `recognizeLive` transcripts.

## Still open

- **Jev with a real key:** untested, since no key was available. The client follows the documented `POST /v1/systemone` contract and is tested against a mocked response.
- **Linux/macOS backends:** written but not run on those systems.
