# Watch always-on (ambient) mode

When Ally is open on the watch and the wrist drops or the screen times out, Wear OS keeps Ally on screen in ambient mode instead of returning to the watch face, as media apps like Spotify do.

- `MainActivity` registers `androidx.wear.ambient.AmbientLifecycleObserver` (`androidx.wear:wear:1.3.0`, `WAKE_LOCK`, optional `com.google.android.wearable` library). `AmbientController` tracks ambient, burn-in, low-bit and a tick that advances on each ambient update (about once a minute).
- `AmbientHost` keeps the interactive `WatchApp` composed, so its saved screen state survives, but caps its lifecycle at CREATED while ambient. That pauses its polling loops, lifecycle-aware flows and orb animation. The always-on screen covers it.
- `AmbientScreen` shows the ALLY wordmark, the time, then the running chats (up to three) with a short public status for each. A thin halo ring follows the user's orb palette: palette colour while working, amber when an agent needs input, dim grey when idle and dashed when reconnecting. While work is running, a Claude-style asterisk spinner and a whimsical verb ("Pondering…", "Brewing…") sit above an uppercase count ("2 AGENTS RUNNING").
- Data comes only from observed activity. Rows come from the existing desktop `agent_activity` socket feed, which `SurfaceStatus` stores and announces with `SURFACE_CHANGED`. The watch's own turn contributes its currently running step. A status is the desktop `detail` when it is specific, otherwise the latest sentence of the public prose preview, otherwise "Working". The verb is the only decorative text. Logic lives in `AmbientPresenceModel` (`AmbientPresenceTest`).
- Ambient constraints: black background, outline-only halo, no gradients, white-only colours on low-bit displays, a pixel walk of up to 3dp per tick when burn-in protection is required, and feed changes coalesced to at most one redraw per 5 s. Spinner, halo arc and verb move once per ambient tick. Raising the wrist exits ambient and the full-colour animated UI resumes.
- Samsung/Wear OS return an ambient app to the watch face about 60 s after the last interaction unless it holds an Ongoing Activity (how Spotify stays up). `AmbientOngoing` (`androidx.wear:wear-ongoing:1.0.0`) posts a silent, low-importance `ally-always-on` marker (ID 31) in `onStart` and cancels it in `onStop`, so it exists only while Ally is on screen. Live progress still belongs to the shared device notification (ID 24).

## Validation (27 October 2026, SM-R915F)

- `:app:testDebugUnitTest` passes (36 tests, 7 new) and `:app:assembleDebug` builds. Installed with `adb -s <watch> install -r`, preserving data and endpoint prefs.
- Off the charger: Ally opened, `KEYCODE_SLEEP` put the watch into Dozing, and the always-on screen showed the time, two real running chats with their public status, the spinner/verb and the palette halo instead of the watch face. No crash was logged.
- On a wireless charger, Samsung replaces any dozing app with its charging screen and returns home. This is system behaviour.
- Restyled screen, off the charger: after a natural 15 s screen timeout Ally showed the wordmark, the 12-hour time, the spinner and verb, "2 AGENTS RUNNING" and live statuses. Without the Ongoing Activity, Samsung's `AmbientTaskStackManager` returned to the watch face at 60 s. With it, Ally was still the top activity, showing the ambient screen, at 100 s. Waking restored the interactive UI. Leaving Ally with Home removed the marker, and no crash was logged.

## Reply audio across ambient transitions (27 October 2026)
The activity no longer stops an active read in onStop. Requested playback has a separate mediaPlayback foreground service with a silent Stop audio notification (ID32) and a partial CPU wake lock held only during speech, bounded to10minutes. This does not keep the display awake or disable ambient UI gating. Completion, cancellation, error, new recording, chat switch, mute and explicit Stop release audio resources; stale completion cannot release a replacement read. New readings still require foreground user interaction. Watch JVM tests/build pass; installed-device transition validation pending watch reconnect.


Installed on SM-R915F via192.168.1.48:41701 using install-r (data kept),27Oct02:14:48.39watchJVMtests pass. Physical spoken playback across wrist lowering remains to be tried by the user.


Orb recording now sets view.keepScreenOn in both the main watch window (outside the ambient lifecycle gate) and assistant sheet. It clears on recording end/cancel/sheet pause/disposal; no screen-timeout or rotation preference is changed. This keeps the release target visible during capture while allowing normal ambient behaviour after capture.


## Complete long-reply playback (27 October)
The former 64-frame cloud PCM queue could overflow when synthesis sends many small frames ahead of playback. ReplyAudioBuffer now bounds queued PCM by bytes (4.8MB) and keeps frame order, with tests for500rapidframes includinglastframe, prematureclose and memoryreclamation. Socket close requires explicit complete; missing complete is an interruption, never success. Long reads renew the existing boundedservicewatchdog per600character segment; no wholeanswer10minute cutoff. Individual cloud/local sections remain bounded90s; no partiallyspoken replay onfailure.42watchtests/buildPASS, updatedAPKinstalled-r onSM-R915F192.168.1.48:41701. Physical fullreplyplayback remains unverified.

