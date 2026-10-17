# Phone voice, styles and hybrid Codex routing

The watch screenshot from 17 October showed "Open this exact chat in Codex desktop".
Ally now uses the native desktop route for owned Codex chats and the previous
app-server route for confirmed unowned chats or a definitively absent desktop
pipe. It preserves the selected session ID. It never retries a submitted message
through another route, forks, or bypasses a writer conflict. Stop and real
approval decisions follow the selected route.

## Phone

Hold the orb to record; release sends one message. Settings > Voice can instead
place the full transcript in the composer for review. The microphone permission
uses Android's normal prompt. Leaving the app, navigation or Cancel voice cancels
recording. A typed draft prevents starting a recording.

Capture is bounded to five minutes. Sections split during quiet audio after 45
seconds, or at 55 seconds, and try live speech first with local WAV transcription
as fallback. Completed sections join in chronological order before a single
message is submitted. Incomplete transcription never sends a partial message;
captured words remain available for review. Retries retain the persisted request
ID. Phone messages are limited to 12,000 characters. Watch capture remains 60
seconds through aliases to the extracted shared voice implementation.

Styles is available in the navigation drawer and Settings. It provides Energy,
Siri, Cloud wave and Pixel orbs; Sunset, Default, Aurora and Ocean palettes; four
activity glow levels; listening eyes; reduced motion; and the welcome flow
background. Changes preview immediately and persist only on this phone. Reset
appearance leaves connection, permissions and notification preferences intact.
Settings also exposes microphone/app permissions and Android notification
settings alongside existing pairing, background connection, quiet hours and mute.

## Verification

- TypeScript passes. Full desktop suite passed 230 tests; after the final absent
  desktop regression, the 21 routing tests and two transcription tests passed.
- Phone and watch debug builds and unit tests pass; phone lint passes.
- Phone voice tests cover ordered multi-section assembly, transport frame bounds,
  failed fallback preventing partial submission, and cancelled/late callbacks.
- Both APKs installed with preferences retained. The desktop runs the isolated
  phone-voice-hybrid-20261017 build. Cloud status reports speech ready, and both
  devices are registered.
- The deployed authenticated transcription endpoint returned HTTP 200 and the
  exact synthetic sentence: "The Blue Ocean Orb is ready. This is a synthetic
  phone voice test." No microphone or agent turn was used for this test.
- Pixel wireless debugging was verified enabled; secure ADB connected and
  installed the updated APK at its advertised TLS address.
- Styles and Settings were visually inspected on Pixel 7. Selecting Pixel wrote
  the preference successfully; Reset appearance restored Energy/Ocean. The voice
  review switch was toggled and restored off. The existing conversation was
  restored after inspection, without submitting a message.

Automated verification does not substitute for a complete five-minute microphone
recording or a live model turn. Concurrent Claude session-folder and robot-persona
changes remain outside this change.
