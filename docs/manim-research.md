# Manim fit for Ally — 27 October 2026

Research only. No installation, benchmark, renderer prototype, restart or model/capture/audio test performed for this slice. The earlier local Python check found no `manim` package in that interpreter; `uv` is available.

## Verified capabilities

- Two projects must be distinguished: [Manim Community](https://github.com/ManimCommunity/manim) and [3b1b/ManimGL](https://github.com/3b1b/manim). The original repository explicitly warns against mixing their installation instructions/packages. ManimGL opens an animation window and documents an interactive authoring workflow; Community also exposes `Scene.interactive_embed`. Neither statement establishes an Ally/browser embedding API.
- [VGroup](https://docs.manim.community/en/stable/reference/manim.mobject.types.vectorized_mobject.VGroup.html) groups vector objects for movement/scaling, matching the logical car+wheels+arrow+label example.
- [ValueTracker](https://docs.manim.community/en/stable/reference/manim.mobject.value_tracker.ValueTracker.html) can drive object updaters, useful for frequency/phase, force vectors and moving diagram components. This is not by itself an HTML slider or phone-control integration.
- [ThreeDScene](https://docs.manim.community/en/stable/reference/manim.scene.three_d_scene.ThreeDScene.html) adds camera/scene functionality for 3D explanations.
- [Output settings](https://docs.manim.community/en/stable/tutorials/output_and_config.html) document `next_section` + `--save_sections`: individual clips plus a JSON index with duration/frame data. Low-quality preview is 854×480 at15fps; other quality levels are available. These settings do not establish render latency on this PC, or guarantee clips are playable before the complete render finishes.
- [Local installation](https://docs.manim.community/en/stable/installation/uv.html) supports isolated project environments on Windows. LaTeX is optional for plain text; formula typesetting has additional dependencies. Do not install a full TeX stack merely to try basic geometry.

## Proposed first integration (not implemented)

Use Manim Community as an optional background renderer for polished explanations. Keep native Study authoritative for immediate annotations, selections, follow-up edits and speech. Examples: Fourier epicycles resolving into a wave, an animated phasor/complex plane derivation, a bridge free-body diagram with a moving load, or a 3D explanation with camera motion.

Agent requests a render through the existing tool architecture. A separate worker creates a low-resolution preview and lesson sections; Ally presents actual queued/rendering/ready/error/cancelled state. Completed clips receive existing lesson/step/caption identity. Run only one bounded render initially and cache by scene specification/version/quality. No work in the Electron main thread or notch animation loop. Continue native feedback while rendering. Integration still needs actual preview-latency and responsiveness measurements before promising fast playback.

Retain an editable semantic scene specification and stable object names. Translate that specification into Manim objects/groups while mapping to native IDs; do not try to recover editable objects from video pixels. Native and Manim coordinates/styles differ, so conversion needs explicit scaling and y-axis mapping. A follow-up edit changes the specification and schedules affected output; the rendered video itself does not provide native editable layers. This translation is future implementation, not supplied automatically by Manim.

A generated Python script is an agent action outside the existing DOM/network-free native drawing interpreter. A renderer subprocess is process separation, not proof of sandboxing; execution must remain within existing chat permissions and tool policy.

## Acceptance before shipping

Render a synthetic10second wave/phasor lesson, measure cold/warm first-preview and complete-render times, cancel mid-render, change a named group and rerender, map native marks correctly, verify narration/section timing and pause/seek, and measure notch responsiveness during a render. Verify controls/device playback through the actual Ally media path rather than assuming a local movie is supported by an HTML diagram sandbox. Neither Manim edition is integrated or performance-validated yet.

Restart status during this research: the native-editing helper stopped on source changes during the combined build. It did not close Ally. No new restart helper was armed while Claude's implementation remained active.
