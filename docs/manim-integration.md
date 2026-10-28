# Manim Community in Ally

Ally uses Manim Community0.22.0 with Typst0.15.0, installed in `.local/manim/.venv`. Setup: run `glass-pip-chat/scripts/manim/setup.ps1` from the project. The runtime can be overridden with `ALLY_MANIM_PYTHON`. The fixed generator rejects a different Manim version. No system LaTeX is needed for supported Typst math expressions.

This adds a background renderer to the existing Study board. It does not replace native annotations, intercept voice, change the selected chat or edit native marks. Native2D objects can be imported as a rendered copy with semantic IDs retained. Rendered videos are not themselves editable vector layers.

## Agent API

Read `native_study_reference(topic: manim)`. Call `study_manim` with the current `boardId`:

- `action:start, requestId, spec` creates a queued job. The same requestId/data returns that job; conflicting reuse fails. Spec has title, preset (`fourier`, `phasor`, `bridge`, `mechanism`, `scene`), optional terms/amplitude/frequency/phase, and sections with unique id, exact spoken cue, duration and actions.
- `action:read, jobId` returns status and retained specification, without local paths/media bearer URLs.
- `action:wait, jobId` waits asynchronously up to15seconds for a terminal render state. It does not block the Electron UI thread or manufacture playback completion.
- `action:cancel, jobId` cancels queued work or stops the owned renderer process tree. Board close cancels its pending jobs and revokes playback URLs.
- `action:followup, jobId, expectedRevision, requestId, sections` appends a new narrated edit. Optional `parameters:{terms,amplitude,frequency,phase}` changes preset parameters. The prior sections replay without output, then only new section clips are displayed. A successful child scene prevents branching another active child from the stale parent. Read the latest job first.

All operations require the current selected Study board/session. Known caller IDs must match that session. Jobs also bind to its immutable board/session identity; later navigation cannot redirect output. Jobs/readback are runtime-scoped. Scene input and generated artifacts remain in the local render cache, but process-restart recovery of job handles is not implemented.

## Scenes and edits

Custom objects: rect/circle/dot/line/arrow/text/math/polygon/box/sphere, each with a stable unique id. Geometry uses a centered coordinate system, y up; ordinary view x roughly ±6, y ±3.4. Groups explicitly list object IDs. Limits:80objects,32groups,256points per polyline,8sections/60seconds,80actions per section. A section's actions run sequentially across its duration.

Actions: move/shift with a2D/3D value; scale; rotate in degrees; recolor; text; hide/show. Text edits morph a text/math object. Math uses mathematical Typst syntax such as `e^(i theta)` or `sum_(n=0)^(N-1) x_n`; strings, imports, markup directives and raw Python are not accepted. The renderer runs only the bundled generator against validated JSON.

Presets:

- Fourier: odd-harmonic epicycles build a square wave; terms1–12, amplitude0.1–2, frequency0.25–4, phase-180°to180°.
- Phasor: rotating vector projected onto a sine wave, with the same parameter controls.
- Bridge: deck/towers/cable plus `car` group containing body, wheels, weight arrow and label; targeted actions preserve the bridge.
- Mechanism: 3D slider-crank with a constant-length connecting rod. Camera title stays fixed in frame. Tracker-driven preset geometry accepts recolour/hide/show; use a custom scene for free geometry edits.

For native import supply `nativeScene`, `width`, `height` and a spec with title/sections. The observed native scene must be complete and have at most80objects; rect/circle/dot/line/arrow/text/poly supported. Native transforms are applied during pixel-to-scene conversion; group and mark names survive. Native scene ownership/revision is retained as source provenance, not permission to mutate the native board.

## Presentation and responsiveness

One background Python renderer, at most8pending jobs,3minute render timeout, bounded lesson complexity. Preview854×480 at15fps. Cache keys include the generator, validated specification, start-section, quality and pinned engine version. The Electron/renderer processes never perform frame generation. Movies are delivered by opaque localhost capability URLs with byte-range seeking; requests cannot nominate files. URLs are revoked on board close. The HTML card sandbox/CSP is unchanged.

Study cards show actual queued/rendering/error/cancelled state and a Cancel button. Once ready they provide muted native-video playback, pause/seek and0.5–2×speed. Inactive/hidden cards pause playback. Clips stage under exact existing native caption cues and respect manual step review. For a planned animation explanation, speak brief progress, start/wait for ready, then speak the section cues. Cue synchronization controls reveal/start; it does not stretch native speech to the rendered clip duration or establish word-level audiovisual timing. Users can pause/review steps.

## Validation

Actual Manim renders:10second Fourier (initial~9.8seconds, repeated fresh run~7.6seconds on this PC), cached equivalent13ms;2second phasor/bridge/mechanism; bridge follow-up retaining named group; Euler-to-Fourier equation morph in2sections. Node20ms timer maximum gap~36ms during the separate render process; this is not physical notch hover latency. Chrome decoded the capability-served854×480 video,10second duration, no media error; seek/range protocol also tested. Synthetic frames were visually inspected. These are generated fixtures, never private screen capture/model/microphone tests.

Native scene editing was independently confirmed installed after the prior restart (main18504, nativecaption connection true). Old selected-chat backup differs from current navigation, so it was not restored. Manim implementation requires a new source-matching desktop build/idle activation. Physical Study audio/caption playback, mixed monitors and phone/watch media parity remain acceptance work; no claim that all devices are supported by this desktop slice.

Sources: [ManimCommunity](https://github.com/ManimCommunity/manim), [section output](https://docs.manim.community/en/stable/tutorials/output_and_config.html), [Typst support](https://docs.manim.community/en/stable/guides/using_text.html). ManimGL remains a separate possible native interactive integration, not included in this implementation.

### Study playback/reveal correction (28 October)
The tutor page now explicitly allows blob video media. Its restricted preload loads only registered ready clips on the current board (64 MiB limit), and the renderer revokes blob URLs when leaving a clip. Playback failures offer Retry without resubmitting a render. A new explicit Study turn rearms live presentation; dismissal and manual review remain respected during that turn. Caption history covers late rendering, and dismissing a rich card does not bring the desktop out of notch mode.
Validation: 38 focused tests and TypeScript pass. A separate Electron process loaded the actual frozen tutor renderer/preload with synthetic bridge media: file origin + sandbox, decoded readyState4, seek, absent-main cue reveal, dismiss/new-turn behavior, manual review, wrong-board rejection. This replaces the earlier Chrome-only playback evidence; physical native narration remains a user acceptance check. Evidence: .local/study-playback-fix/fixture-result.json.

### Native captions and stable presentation follow-up
The initial playback fix reached the user but did not cover real native caption JSON or feedback from mixed-DPI geometry. CaptionChanged sends header/text/chips JSON; forward bounded32KiB, parse text before cue matching, and keep authenticated transport capacity sufficient for encoded payloads. First requested rich card now reveals render progress automatically; later steps still follow narration and respect dismissal/manual review. Anchored width comes from user/default intent rather than observed panel width divided by a slightly different native display width. Explicit play on visible source/visibility transition prevents loaded-hidden clips waiting for manual play; intrinsic video sizing is constrained within the card.
41focusedtests and TS pass; native helper compiled separately without touching running files. Actual frozen Electron renderer test: native JSON, main absent, first-card reveal, hidden-loaded clip automatic playback,30mixed-DPI anchor samples all760px, seek/manualreview/dismiss/ownership pass (.local/study-stability/fixture-result.json). Physical user acceptance remains pending.

### Cursor display and agent playback
Rich media uses separate presentation bounds selected from the cursor monitor on first reveal of each Study turn; source crop bounds/physical geometry remain unchanged. Native marks, user sketches, sketch mode and frozen captures retain their source display. Media does not continuously chase the cursor. Explicit playback requests may reveal an animation on the current cursor display.
Agent API: study_playback with boardId, optional stepId (from visual_tutor_read), action play/pause/replay/read, and unique requestId. replay reuses the video; no render. Tool waits up to8s for a real player receipt (paused,ended,currentTime,duration). Retries return the original result, conflicting requestId data fails, wrong board/chat fails, and read does not show a hidden player. Manual playback selects the requested step and suspends caption-following until the next explicit Study turn.
Validation:22focusedtests+TS pass,7controltests rerun after callback stability changes; actual frozenElectron fixture on two real displays confirms cursor-target window bounds (native1DIP rounding), unchanged source geometry, actual pause/play/replay/read, retry does not replay, wrong-owner rejection and singleplayer. No real model/screen/mic tests. Evidence .local/study-media-controls/fixture-result.json.
