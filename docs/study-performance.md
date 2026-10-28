# Study response latency

Read-only inspection of the existing MECH5720 “Read study/STUDY_PRACTICE_HANDOFF.md…” session on 28 October found recent completed runs lasting 76–153 seconds. A “No.” acknowledgement used high effort and took 79 seconds without a tool call. Most neighbouring ordinary teaching turns used medium effort. This is agent-run duration from recorded task events, not measured time to first token or speech; persisted assistant messages are written near completion.

The existing authenticated SSE transport already forwards text before done, and the native relay emits completed speech sentences and drawing lines incrementally. Its eight connector regressions cover this; there is no full-response buffering to remove here. No real test prompt was submitted, and no observed speedup is claimed.

Changes:

- Adaptive routing handles explicit short acknowledgements/repeat/read requests before considering selected maths. Actual derivation, solving, debugging, verification and multi-step analysis still choose high effort. Subject nouns and ordinary “why” questions retain medium. Only the current highlight can escalate a deictic maths explanation; serialized old scene data and prior narration cannot. Selected model stays unchanged.
- A shorter Study envelope retains browser restrictions, permissions, crop mapping and drawing API. It requests short initial speech and concise quiz follow-ups, using native primitives directly and reserving optional renders for useful cases.
- Content-free `[Study timing ms]` diagnostics report relative history-ready, board-ready, provider-accepted, first nonempty streamed text and completion times. They contain no question, image, path or session ID. These start at bridge dispatch, exclude earlier upload/transcription, and do not measure actual audible onset. Queue waiting, if present, is included in history-ready.

Remaining latency may come from provider reasoning, long resumed history, image processing or speech startup. Real next-turn timings are needed to distinguish these; changing the selected model or rewriting existing history was not authorized as a latency shortcut. No speech/drawing playback speedup has been measured.
