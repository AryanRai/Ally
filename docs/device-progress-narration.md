# Phone and watch progress narration

Ally sends public commentary as ordered, stable-ID progress rows separately from the final answer. Partial commentary is visible immediately and becomes speakable at the next public item, tool-start or completion boundary. Only literal completed Study say calls are projected into Study progress; model code is never evaluated. Native external chat history exposes public commentary under the exact user-turn ID.

Both device apps show recent progress with their Markdown renderers. The assistant sheet uses the latest progress text while waiting for answer text. A selected visible conversation queues newly completed updates once. Muted, hidden, recording and explicitly stopped turns do not accumulate catch-up speech. Stop cancels every queued successor. Watch playback retains its media service and screen-off audio lifetime; phone playback stops when its visible app/assistant is hidden.

The shared speech engine serializes progress and final-answer playback, with the existing local voice fallback, byte-bounded cloud audio buffer and no automatic replay of partially spoken audio. Study prefixes already queued are removed from final narration only on an exact prefix match. Watch final-answer auto-read retains its existing preference. Phone final narration follows the live public updates for the visible selected turn.

Validation: 96 phone and 42 watch JVM tests, both APK builds, 17 desktop progress/bridge tests, presentation tests and desktop TypeScript checks pass. Device updates installed preserving app data. Physical spoken end-to-end progress/final playback is not yet verified. Desktop feed activation status is tracked in .local/progress-narration/activation-status.json.
