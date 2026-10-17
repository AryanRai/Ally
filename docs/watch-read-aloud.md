# Watch Read aloud control

The oversized bright button used to interrupt a structured reply between its introduction and its detailed cards. It now sits below the whole answer as a centered dark control: a 32dp visual pill inside a touch target at least 48dp tall, with Play/Stop icon and readable label. The top-level Stop audio control uses the same style. Muting and recording still prevent new playback; Stop remains usable during playback.

Manual Read aloud and existing opt-in Auto-read now include card titles, bodies, checklist items and relevant progress/timer values in answer order. Link labels are spoken without their long Markdown URL targets; follow-up labels are spoken without sending or reading their action instructions. No timer/action is executed by reading a reply. Playback still uses the existing segmented foreground speech player and cancellation behavior.

Watch unit tests (21) and debug APK build pass, including ordered research-card speech, link labels and card-only replies. No microphone recording, actual speech playback or model prompt was used for validation. The desktop and phone do not need another update for this change.

Installed on Watch5 over secure wireless ADB with pairing retained. The actual research reply was scrolled to its end and the new footer visually verified: dark centered pill beneath the last card, followed by usage and the swipe-back hint. UI automation reports a 238×102 pixel touch area (approximately 112×48dp), larger than the visible pill. The device reconnected to the desktop.
