# Phone design and window glow

The phone now uses Ally desktop's neutral surfaces, Geist body text, Geist Mono labels, Tanker wordmark and orb/pill composer. Navigation lives in a drawer; conversations are grouped by working folder with flat rows and a current-chat marker. Replies support selectable text, headings, emphasis, links and horizontally scrolling code. Settings, inbox and notification entry points share this UI. Earlier-history pagination keeps the reader's position.

References inspected: the running Ally desktop; `src/styles/index.css`, `ChatInput.tsx`, `EnergyOrb.tsx` and the look store; prxptn.com; Orbit-Frontend/dashboard's Mary `animated-panel-glow-web.tsx` and presets; the Ally watch picker and live watch surface. The phone adapts the desktop hierarchy to touch targets and an Android keyboard.

## Glow repair

The inward port had reduced both width and opacity with the intensity dial, heavily blurred thin rings against the window clip, discarded transparent preset stops, rotated once per frame rather than elapsed time, and applied reverse rotation twice. The halo now straddles the edge and clips inward, with blur following its animated width. A ResizeObserver caps width against the shorter window dimension. Transparent gaps and full-circle gradient continuity are retained. Fade reversals continue from the current opacity; idle, hidden and settled reduced-motion states stop scheduling frames.

The desktop's layout, palette selection and saved appearance remain unchanged. The phone's transport/model, exact-chat IDs, retries, Stop and permission handling are unchanged. Device decisions still go through DeviceLink's approval, expiry and connection checks. Watch notifications retain their existing activity and launch behavior.

## Verification on 17 October 2026

- 217 desktop tests pass, including seven new glow lifecycle regressions; TypeScript passes.
- Clean committed source builds with Vite and Electron in an isolated directory.
- 18 Android unit tests pass; phone and watch debug APKs build; phone lint has no errors (existing dependency/deprecation warnings remain).
- Pixel 7: home, drawer, conversation list/search, keyboard, existing conversation formatting, error display, inbox and settings visually checked. Notification destination intents open the new inbox/settings. No model test messages or approval decisions were submitted.
- Watch5: app layout checked and connection resumed after APK replacement.
- Real desktop renderer: typing/clear, expanded/collapsed sizes and all six presets visually checked. Native Windows UI capture became unreliable after activation; interactive rendering checks used the browser renderer.
- Both APKs installed with `adb install -r`; authenticated device_list confirms phone and watch. Local and cloud bridge status report connected and speech ready.
- Initially launched `%LOCALAPPDATA%/Ally/builds/phone-design-20261017/glass-pip-chat`. Concurrent work subsequently rebuilt/relaunched the shared checkout; its renderer hash matches the verified isolated renderer. The isolated build remains available.

Concurrent Claude session-folder fixes are outside this change. The pre-existing Vercel configuration pointing at the missing ally-remote-service root is outside scope; this release deploys the local desktop and Android companions.
