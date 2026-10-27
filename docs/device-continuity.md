# Phone-to-desktop continuity

Ally can bring phone screen context and explicitly shared files into a desktop conversation. A screenshot is a view of an app, not a copy of its document, video or account data.

## Hold-close handoff

1. Open Ally settings on the phone and choose **Hold-close handoff**. Enable the proximity and local screen-review options you want to use.
2. Allow Nearby devices and notifications through Android's normal dialogs. Enable Ally control in Accessibility settings if needed. Keep the paired desktop connected, with Bluetooth available on both devices.
3. Calibrate the nearby signal in the phone settings. Bluetooth signal strength is approximate; there is no guaranteed physical distance or touch detection.
4. Turn on hold-close, leave Ally for the app you want to share, unlock the phone, and hold it close to the paired PC for three continuous seconds. Moving away cancels the hold. Move away before trying another handoff.
5. Review the local draft. Remove unwanted screenshots/files or discard it. Choose the destination conversation and use the explicit Send button or supported swipe-up Send gesture.

The latest phone implementation uses a persistent on/off preference, with an ongoing notification and Stop action, rather than an elapsed proximity-session timeout. Android can still stop the service; this is not a guarantee of operation after reboot or force-stop. Enabling proximity does not authorize continuous screenshots, agent actions or automatic uploads. Secure, locked, system and Ally-owned surfaces remain excluded.

The manual fallback is to open Ally with the phone's assistant/power-button action, make a request, and choose **Review phone context on PC** when screen context is available. If Android has left Ally selected but unbound after an update, reselect it in Android's default-assistant settings. Assistant binding and Accessibility are separate.

## What is transferred

| Content | Behavior |
| --- | --- |
| Screen image | An opted-in snapshot is imported into a local review draft. Sending remains explicit. It contains only the captured view. |
| Screen text | The manual assistant path can include text supplied by Android. Availability depends on the source app and invocation. |
| Structured context | Versioned metadata records each field's availability and provenance, or explains why it is missing. |
| Original document or file | Attach through Android Share or the review's system file picker. Only readable, explicitly granted source files are imported. |
| PDF details | Supported shared PDFs can report name, MIME type, byte size, SHA256 and page count. Current page must be supplied explicitly unless a supported source provides it. |
| Web address | A URL can accompany an explicit share or supported browser snapshot. A screenshot or title does not establish the original URL. |
| Media | Supported browser snapshots may expose visible HTML media source and position. General phone now-playing metadata, transcripts and playback continuation remain incomplete. |

For example, the reviewed context received during this documentation update identified the Android launcher and GitHub app and reported a screen image available. It correctly marked original URL, document URI, original document, current page, media title, playback position and transcript unavailable. No URL or document was inferred from the screenshot. The supplied image and private paths are not copied into the repository.

To hand off an entire PDF, share or pick the actual PDF. A screenshot of page26 in a44-page PDF does not attach the other43 pages, the original file or its annotations. Existing attachments retain the20MB-per-file limit.

## Local phone viewer and control

The optional scrcpy viewer opens a separate desktop window over an already authorized ADB connection. It requires its own approval, is read-only, and disables audio and clipboard synchronization. Raw live video does not inherit Ally's screen-by-screen control filtering. Frames are not automatically attached to the agent conversation.

Proximity, phone control and viewing have separate lifetimes. Leaving hold-close enabled does not extend the existing15-minute phone-control or live-view approvals. The phone execution choice remains unavailable until a supported Android agent runtime exists.

See [viewer setup](scrcpy-viewer.md), [execution location](device-execution-routing.md) and [physical handoff engineering notes](physical-tap-handoff.md).

## Availability and remaining work

Latest recorded deployment on27 October2026: the persistent-toggle and structured-context Android updates were installed. Desktop candidate190922-abda1a61 contains the embedded notch/pill feedback, receipt-aware Send and browser context changes, but was staged rather than activated at that checkpoint; active desktop was180747. Check the latest deployment notes before assuming those desktop changes are live. Native permissions, calibration, rendering and physical handoff acceptance require user-device checks; a successful build is not evidence of a complete physical transfer.

Still outstanding: general media-session metadata and transcripts, YouTube/Spotify playback handoff, resumable transfers over20MB, restart-safe receipt reconciliation, original-file export from unsupported browser viewers, embedded phone video/native streaming without ADB, and the Android agent runtime. NFC target registration is also not implemented. See the [current backlog](device-continuity-backlog.md) for the detailed status.

Private source content remains untrusted data. Review the destination and attachments before Send. Never treat proximity, animation or an upload receipt as proof that an agent completed a request.
