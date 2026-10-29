# Coordinated native Study and animation — delivery 1

This extends the existing native speech-paced drawing system. Native ink, writing,
graphs and 3D keep their original renderer. Manim remains generated media, now
with caption-controlled starts, measured playback, and attached teaching marks.
No new model provider or autonomous tool loop is introduced.

## Agent sequence

1. Render with `study_manim`. Read its actual render state; queued is not played.
2. Read `visual_tutor_read` for stable animation step IDs.
3. Stage `study_lesson` before the cue:

```json
{
  "action": "stage",
  "boardId": "<current Study board>",
  "requestId": "bridge-lesson-1",
  "beats": [{
    "id": "car-movement",
    "stepId": "<existing animation step>",
    "cue": "Watch the car move while its weight arrow follows.",
    "mode": "wait",
    "annotations": [
      {"id":"car-pointer","kind":"pointer","x":200,"y":400,"x2":600,"y2":400,"travel":1,"at":0,"until":1.4},
      {"id":"weight","kind":"text","x":200,"y":700,"text":"F = mg","write":true,"at":0.3,"tone":"blue"}
    ]
  }]
}
```

4. Emit only the short cue in the native program:

```javascript
step(1);
say("Watch the car move while its weight arrow follows.");
```

5. For `mode:wait`, call `study_lesson` with `action:wait`, `boardId`, `stepId`
   before generating any subsequent narration. Only `status:ended` confirms the
   clip finished. Calls wait at most 15 seconds. If still playing, wait again;
   respect pause, cancellation, manual review and errors. For `alongside`, the
   native explanation may continue while the clip runs.
6. After completion, continue normal native speech and ink in the next step.

The wait is an agent tool barrier between spoken segments. It does not intercept
or pause audio already queued in the native engine. It cannot guarantee that an
agent which has already emitted its later narration will remain silent.

## Annotations and coordinates

`pointer`, `arrow`, `highlight`, `text` use video-content-relative 0–1000 positions,
excluding letterboxing. Arrow needs `x2,y2`. Highlight needs `width,height` and must
stay inside the content. Pointer optionally uses `x2,y2,travel` for movement.
Optional `text`, palette `tone`, `at`, `until` and `write` control labels and timing.
Writing reveals characters progressively; native handwriting remains available
through the existing native drawing program.

Annotations are a noninteractive layer over the same player. Video time drives
visibility, pointer movement and writing; pause, seek, speed and replay affect
them together. Panel move/resize recomputes the contained video rectangle.
The teaching pointer does not move or click the OS mouse.

Limits: 16 beats, 24 annotations per beat, 300-character labels/cues, clip times
0–65 seconds. Stage updates replace only the supplied beats, leaving other steps
and user sketches intact. Supply the full annotation list for an updated beat;
stable IDs identify its marks. Identical request retries preserve the staged state.

## Actual state and controls

`study_lesson action:read` reports the current beat, video time, duration, paused,
ended, playback rate and measured content bounds in desktop DIP and physical pixels.
`study_playback` controls play/pause/replay/read on the existing player with actual
renderer receipts. Replays reset the observation token so old completion messages
cannot finish the new run. Readback does not capture a new screen.

Board/chat selection is checked before agent operations. Telemetry accepts only the
overlay's main frame with the current board/step/source token. Manual step review
continues to win over caption advancement. New media placement follows the cursor
display while source capture geometry and native sketches remain preserved.

## Verification and remaining plan

42 focused tests plus TypeScript passed. An isolated Electron process used the
actual frozen renderer/preload and native caption JSON on two real displays:
held preview until cue, real pause/play, resize with attached annotations, measured
physical content bounds, actual ended barrier, preserved stage retry, stale replay
token rejection and wrong-owner rejection. Synthetic bridge media only; no real
Study prompt, microphone, private screen capture or model turn was used.
Evidence is in `.local/coordinated-study/fixture-result.json`.

The initial delivery covered stages 1–3. The follow-up below implements the bounded
playback, 2D writeback and review paths for stages 4–6. Source availability and a
verified live deployment are separate; use the collaboration ledger for rollout status.

## Follow-up controls and managed narration

`study_playback` adds `seek` with `time` in seconds, and `rate` with `rate` 0.5–2.
Read `study_lesson` for current video/narration positions, annotation IDs and text
before answering “explain this arrow.” Keep each new request ID stable on retry.
Explicit native Study phrases “pause there”, “replay”, “repeat that part”, “resume
the animation” and “slower” use the existing guarded player directly rather than
starting a model turn, when the current selected board has a ready clip. Ambiguous
teaching requests still reach the selected agent; these phrases do not cancel a
running agent or bypass the client's active-turn admission rules. Buttons on the
review strip control playback independently of agent work.

A staged beat may include `narration` (1–1000 characters). Ally synthesizes that
text before staging using its configured desktop speech engine/voice. Synthesis
failure is reported; it never fabricates a successful audio track or silently
changes providers. It is separate from native speech, so do not repeat the text
in `say()`. Emit only a short native cue, wait for the clip, then continue teaching.
The managed audio pauses, seeks, changes rate and replays with its animation.
If it outlasts the video, the final frame holds and the completion barrier waits
for both. Ordinary native conversation can continue while this track is paused.
The native engine's previously queued mid-utterance audio remains independent.
Audio loading is restricted to the current overlay/board's staged track; it cannot
read arbitrary paths or start synthesis from the renderer. Tracks are bounded to
16 entries of at most 6 MB, and invalidated on board closure.

## Deliberate native/Manim object bridge

Import a complete observed native scene with `study_manim action:start`,
`nativeScene`, `width` and `height`. Existing native mark IDs and flattened semantic
groups become Manim IDs. The source board, revision, coordinate dimensions and
geometry fingerprint are retained. Follow-ups still append actions to that retained
description and render only new sections. The actual renderer now records each
section's final geometry, colours, visibility and text, alongside the video.

To return a supported final frame, call `study_manim action:native_edits` with
`boardId`, `jobId`, `expectedRevision`, `sectionId`, a stable `requestId` of at most
48 characters, and fresh observed `nativeScene`. The result maps IDs and returns
a guarded `sceneEdit` program. This is a plan, **not executed ink**: emit the program
after a short native `step()/say()` cue, then inspect native operation receipts.
Same program/request IDs retry idempotently. No clear, white rectangle, start-over
or unrelated-object replacement is used. Unchanged native marks and user sketches
remain owned by their original canvas.

Supported writeback: imported 2D rectangles, circles/dots, lines/arrows, polygons
and plain text; position, dimensions, points, text, colour and visibility. Text
scaling requires an explicit native font size. Rotated rectangles/text, math glyphs,
3D, unsupported native shapes and built-in preset geometry cannot be converted to
native editable ink. Use retained animation parameters for those. Wrong/stale native
boards, changed source geometry, deleted IDs and incomplete snapshots fail before
a program is returned. After native writeback or other native changes, reimport the
fresh native scene before another cross-renderer writeback. This is an explicit
source handoff rather than concurrent edits to two independent authorities.

## Review strip

The compact strip lists the board's retained card/animation sections and current
selection, with pause, play, replay and slower controls. Selecting an entry restores
that step's stored marks, diagram/annotations and paused video/narration position
and rate. It does not rerender or restart earlier sections. The existing latest/live
button resumes caption following. This is board-lifetime review, not persistent
lesson storage across app restarts. It does not rewind the separate native canvas's
edit history or overwrite later native edits/user sketches.

## Follow-up verification

The actual Manim CE renderer plus bundled native engine fixture moved a five-part
bridge car, changed its label, lengthened its weight arrow and applied the recorded
final geometry to the same native IDs. Unrelated bridge marks were byte-identical;
retried writeback commands were idempotent. No real Study prompt, private screen,
microphone or user drawing was used. Playback/narration/review acceptance is tracked
separately from this geometry fixture and from physical native speech acceptance.

The final frozen Electron fixture passed on two displays with synthetic, muted
audio: managed narration pause/seek/rate/replay, held final frame until longer
narration actually ended, restored paused video/audio bookmarks, retained user
sketches, direct follow-up controls and wrong-chat rejection. It also repeats the
cue/resize/stale-token/barrier tests from delivery 1. Evidence:
`.local/study-followups/fixture-result.json` and `bridge-result.json`.
Two integration defects found during verification were fixed: replay guards now
read the current command rather than a stale closure, and the overlay rejects
late snapshots with older revisions. Frequent media observations access the
current board directly rather than cloning every retained card and sketch.
No real user Study prompt, microphone, audible speech or private capture was used.

## Native pointer appearance
The animation teaching pointer defaults to Ally Study blue (#3380FF). Its 16px rounded equilateral triangle and corner radius follow native CursorClusterRenderer geometry, with a soft blue glow. The extra orange targeting ring was removed. Inverse viewport scaling preserves its silhouette through letterboxing and resizing. Explicit annotation tones remain available. The pointer remains attached to media time; no real mouse movement is generated.
