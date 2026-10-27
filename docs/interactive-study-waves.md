# Interactive Study waves

User-approved first increment: interactive wave/Fourier cards within the existing Study lesson. Native screen drawing and speech remain canonical; this adds local controls in the caption-cued diagram card.

Call `study_diagram` with current `boardId`, stable `id`, `title`, exact spoken `cue`, and `preset: "waves"` or `preset: "fourier"`. Omit `html`. Custom HTML cards retain their existing API. `native_study_reference(topic: "waves")` provides agent-facing guidance.

- Waves: amplitude 0–2, frequency 0.5–4 cycles per arbitrary time unit, phase −180° to 180°.
- Fourier: same controls plus 1–12 terms and square/sawtooth target. Show individual harmonics, sum, target and equation. Square uses odd terms 4A/(πk); sawtooth uses alternating 2A/(πk). Phase shifts the fundamental angle before harmonic multiplication.
- Card appears on matching native speech caption. Stable-id replacement resets controls; use a new id for the next lesson step.
- Changes redraw bounded SVG paths locally, with no model calls, downloads, timers or permanent animation loop. Existing sandbox and network/tool isolation remain unchanged.
- Expand the diagram for controls; Reset restores initial state. Screen-reader labels and keyboard-native sliders/selects are included. Signals are illustrative, not screen measurements.

Validation: executable DOM tests run the actual card after Study sanitization; cover live path/equation updates, zero amplitude, reset, maximum bounds, target selection, numeric Fourier coefficient/phase checks, custom HTML preservation and invalid request rejection. Existing reference, caption-cue and sandbox tests also run. Isolated Chrome preview confirms rendering and keyboard change from 3 to 12 terms. This does not establish physical native speech synchronization or phone playback acceptance. No private capture, microphone, speaker or model test was performed.

This increment does not add a new 3D library or promise editable arbitrary on-screen objects. Richer mechanisms remain a future increment.

Deployment: fresh combined candidate unified-20261027-115655-ddb67fef built successfully (desktop renderer, Electron main, embedded notch), source hash verified. NOT live: read-only main10444 check reports two managed Codex runs; no quit/restart queued or attempted. Active manifest remains090711. Next normal idle-only restart can select this source-matching candidate.13focused tests and TypeScript PASS; browser keyboard input confirmed12terms. No physical native/card speech acceptance claimed.
