# Voice feedback and input during replies

Follow-up to merged PR #23. Deployed to the desktop, Pixel 7 and Galaxy Watch5 on 17 October 2026.

## Behavior

- Phone voice start/release/cancel, accepted messages/input, new approvals and completed replies have tactile feedback. Settings → Touch feedback controls it; Ally mute and Android touch-feedback settings take precedence.
- The phone's live transcript and Cancel voice button overlay a fixed-height area at the bottom of the conversation. They no longer add height below the orb, so a growing transcript does not move the held target.
- Desktop expanded and collapsed composers accept Add input while working. Stop remains a separate button. Recognized desktop speech no longer stops the current turn.
- Phone/watch voice and text can add input to an Ally-owned running conversation. Standard Codex app-server uses `turn/steer` with the exact active `expectedTurnId`. Claude and Codex desktop-owner connections queue input after the response and continue the same session with the same permissions. The UI reports whether input was added or queued. Externally running chats not owned by Ally still need their original client.
- Each network input has a stable request ID. Concurrent retries share one result; uncertain failures are not automatically resent or converted to another turn. Android retains unconfirmed input for retry. If the original response has already ended, the draft stays available rather than silently creating another task.
- Watch Settings → Use Ally as assistant opens Android's digital assistant settings. Samsung exposes the role there but its permission controller rejects direct role requests as "Role is not requestable". The manifest handles ACTION_ASSIST; lifecycle refresh reports the actual RoleManager selection when returning. No always-listening or hotword service is installed.
- If a running reply finishes or is replaced during phone recording, its transcript stays in the composer for review. Text continuations do not reattach images from the original message. Unconfirmed watch input must be retried or dismissed before switching chats.

## Validation and delivery

Desktop typecheck and the full 242-test suite passed. After the attachment regression was added, all 23 focused steering/receipt/Codex tests passed. Both Android unit suites and debug APK builds pass, including three phone delivery tests for active, finished/replaced and review-mode recordings. Phone lint passes. Full watch lint identifies two reports of an existing WearPasswordInput error in device-common/DeviceInboxActivity.kt's pairing-token field (unchanged by this feature); the token remains masked.

Both devices connected through secure wireless ADB and received the APKs with preferences retained. The Pixel Settings screen was visually inspected. Its Test touch feedback button produced a completed DOUBLE_CLICK vibration attributed to dev.ally.phone with TOUCH usage in Android's vibrator service.

Ally was selected through Watch5 system settings as the default digital assistant. Both `cmd role get-role-holders android.app.role.ASSISTANT` and the secure assistant component confirmed dev.ally.watch. The in-app button was corrected after this device-specific check.

After the user's manual close, launched the verified isolated desktop at `%LOCALAPPDATA%/Ally/builds/voice-steering-20261017-verified/glass-pip-chat`. Cloud speech status is ready and both devices reconnected. A request using a nonexistent turn ID confirmed the new input route is deployed without submitting model input. No microphone recording or real model turn was used for verification; sustained hold/release and live steering remain to be exercised in normal use. The native Windows capture helper failed twice, so no forced shutdown or stale UI actions were used.

Do not use install-watch.ps1 for the cloud-paired watch: it resets pairing to ADB localhost. Concurrent sessions.ts, sessions.test.ts and robotPersona.ts changes remain excluded from this PR but included in the desktop build.

## References

- Codex active-turn protocol: https://learn.chatgpt.com/docs/app-server (turn/steer).
- Android assistant eligibility: https://developer.android.com/reference/androidx/core/role/RoleManagerCompat#ROLE_ASSISTANT
- Android user selection: https://developer.android.com/reference/android/app/role/RoleManager
