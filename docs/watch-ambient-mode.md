# Watch always-on (ambient) mode

When Ally is open on the watch and the wrist drops or the screen times out, Wear OS keeps Ally on screen in ambient mode instead of returning to the watch face, as media apps like Spotify do.

- `MainActivity` registers `androidx.wear.ambient.AmbientLifecycleObserver` (`androidx.wear:wear:1.3.0`, `WAKE_LOCK`, optional `com.google.android.wearable` library). `AmbientController` tracks ambient, burn-in, low-bit and a tick that advances on each ambient update (about once a minute).
- `AmbientHost` keeps the interactive `WatchApp` composed, so its saved screen state survives, but caps its lifecycle at CREATED while ambient. That pauses its polling loops, lifecycle-aware flows and orb animation. The always-on screen covers it.
- `AmbientScreen` shows the ALLY wordmark, the time, then the running chats (up to three) with a short public status for each. A thin halo ring follows the user's orb palette: palette colour while working, amber when an agent needs input, dim grey when idle and dashed when reconnecting. While work is running, a Claude-style asterisk spinner and a whimsical verb ("Pondering…", "Brewing…") sit above an uppercase count ("2 AGENTS RUNNING").
- Data comes only from observed activity. Rows come from the existing desktop `agent_activity` socket feed, which `SurfaceStatus` stores and announces with `SURFACE_CHANGED`. The watch's own turn contributes its currently running step. A status is the desktop `detail` when it is specific, otherwise the latest sentence of the public prose preview, otherwise "Working". The verb is the only decorative text. Logic lives in `AmbientPresenceModel` (`AmbientPresenceTest`).
- Ambient constraints: black background, outline-only halo, no gradients, white-only colours on low-bit displays, a pixel walk of up to 3dp per tick when burn-in protection is required, and feed changes coalesced to at most one redraw per 5 s. Spinner, halo arc and verb move once per ambient tick. Raising the wrist exits ambient and the full-colour animated UI resumes.

## Validation (27 October 2026, SM-R915F)

- `:app:testDebugUnitTest` passes (36 tests, 7 new) and `:app:assembleDebug` builds. Installed with `adb -s <watch> install -r`, preserving data and endpoint prefs.
- Off the charger: Ally opened, `KEYCODE_SLEEP` put the watch into Dozing, and the always-on screen showed the time, two real running chats with their public status, the spinner/verb and the palette halo instead of the watch face. No crash was logged.
- On a wireless charger, Samsung replaces any dozing app with its charging screen and returns home. This is system behaviour.
- Not yet observed: how long Samsung keeps an ambient app before its own return-to-watch-face timer. An Ongoing Activity would let users get back from the watch face. It touches the live notification pipeline, which another session owns, so it is a follow-up.
