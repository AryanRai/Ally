# Phone assistant listening cutoff

2026-10-19. The phone power-button assistant activated successfully but could finish before a complete spoken request.

The automatic recorder used the same fixed energy threshold and 1.5-second endpoint as the watch. A synthetic regression reproduces the old endpoint during a natural pause. Synthetic 16 kHz PCM also demonstrates that quiet speech can fall below the former threshold and never establish a request.

The phone now allows eight seconds to start speaking and four seconds of silence after speech. Its onset threshold is 0.025 and continuation threshold 0.018 on the existing RMS-times-five level scale. A sustained onset of at least 160 ms establishes speech; isolated clicks cannot add up across silent gaps. The lower continuation threshold keeps quieter endings within the same recording.

Watch defaults stay at five seconds / 1.5 seconds and their original threshold. Both retain the existing 60-second recording limit. Silent activation does not transcribe or send. Dismissal, cancellation, microphone permission, mute, native chat identity, request idempotency, screen-context ownership, choices, and genuine approvals are unchanged. No UI or OS assistant-role setting is modified.

Tests cover the old premature endpoint, continuation across a three-second thinking pause, quiet PCM and softer endings, a delayed start, isolated clicks, continuous speech, and the original watch policy. Phone and watch unit suites, the phone APK, and phone lint validate the shared code. Physical voice/earbud behavior is a separate user check; no private microphone recording, new screen capture, or model message is used for validation.

For replacement installation, preserve app data and verify the selected assistant's actual service binding afterwards. If Android loses that binding, recover through the normal OS assistant picker rather than ADB role/security writes. Watch installation remains deferred. Build/install results are recorded in the collaboration log and the isolated `.ally-phone-listening-20261019` artifact directory.
