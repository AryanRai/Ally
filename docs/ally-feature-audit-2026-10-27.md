# Ally feature audit — 27 October 2026

## Latest verified status — supersedes deployment-pending rows below

After the interrupted approval wait, independently verified desktop PID31076 loading exact `unified-20261027-075858-5bc57d55`. Desktop bridge18765 and MCP18767 listen on that PID; Study18783 is reachable, idle and speech-ready. Own-Ally module inspection confirms native connected/captions and account module present. Private inspector closed after the read. No restart or account-setting change performed in this verification.

The running compiled bridge includes the non-destructive `Waiting for an agent update` watchdog and no longer contains the old `This request took too long. Please try again.` stop path. The16 bridge regressions passed, including quiet long tools, no replay, late completion and explicit Stop. The timeout fix is now LIVE; a real five-minute user task was not manufactured to test it.

Claude's coordinated normal restart activated the later pairing/maintenance, native viewer, YouTube, account and native-image crash fixes as part of this combined build. Presence/activation does not establish real account login, QR scan, viewer capture or physical speech acceptance. Claude retains account setup ownership; this audit leaves account settings untouched.

The audit recovery build exited at the native-client-in-use guard after Claude started the runtime. Its follow-on start did not execute. No audit activation helper was armed, so there is no queued second restart. Historical `.local/manual-restart/status.json` is not the status of this audit attempt.

Phone deployment has advanced beyond the earlier hash snapshot: `.local/calibration-recovery/validation.json` and installer ledger record installed/hash-verified APK `7d61fe19f5a31bf246236ee38c7c08457b77315ffd6f7fb9964125f52feb50d7`,155phone/42watch tests and selected/bound assistant. Includes false-proximity gating and revised two-point15sample calibration. Real calibration success remains unverified. Watch was not reinstalled for these phone-only changes.

Still outstanding: the reproduced21MiB transfer finalization failure and unwired production uploader; phone-local agent execution; Spotify/native-media/transcript/general audio handoff; persistent message-receipt reconciliation; real account sign-ins and physical acceptance tests; known hidden-polling/watch-lint failures; README screenshot/PR merge. At final read two managed chats are active (this audit and the dedicated physical-tap/device chat), with zero pending broker decisions; activity alone is not evidence that either is hung.

Snapshot: 18:25 Australia/Sydney. Read-only review of recent Codex and Claude development conversations, collaboration ledger, validation records, current desktop process, connected devices, installed phone APK and live tool inventory. This is an audit of evidence, not a new end-to-end acceptance test. Later activation can supersede the snapshot below.

## What is actually running

- Desktop main PID9960 loaded `unified-20261027-013358-bf4329af`; Study PID43632. Native connection and captions confirmed live. This build was produced at12:34 Sydney and predates several later completed features.
- Both phone and watch are connected to Ally's authenticated device service. Chrome's existing extension profile is connected.
- Pixel7 installed APK was independently pulled and hashed: `3a5ecd91e0015d6b9b742d19f81357fc23817e7ab1877a4ed179ac802b50b53c`, matching the final handoff-polish installation record. Phone assistant is selected and bound, checked without repairing settings.
- Watch's latest installation/hash and assistant verification are recorded in native-device-access validation (`f1a61688…`). Its Ally socket is connected now, but no watch ADB connection is available for a fresh package-hash or physical UI check.
- Only this audit conversation was managed/running when inspected. Zero pending broker decisions. `notLoaded` in Codex's sidebar is not evidence that a chat is hung.

## Features present in the running builds

| Feature | Verification and practical limit |
|---|---|
| Exact existing Codex conversation connection/recovery | Source present in active build and matches current owner-recovery module; historical live checks. No automatic fork or replay. |
| Shared desktop/Study/device chat selection and draft/cache preservation | Earlier live synchronization and cache-recovery checks; current desktop/Study connected. Not all navigation cases repeated today. |
| Rich phone/watch Markdown, Study prose/steps, activity and progress display | Active desktop presentation/progress modules match current source; both installed device builds include them. Actual long narrated progress-to-final sequence remains physically unverified. |
| Phone scroll-to-bottom, image attachments and explicit share destination picker | Installed feature; historical tests/install evidence. No new private attachment send in audit. |
| Assistant chat confirmation/search picker | Installed on phone/watch; selection does not send until explicit Send. Historical tests, not new physical spoken acceptance. |
| Desktop/sidebar/notch search | Search component and authenticated route present in active build. Search is read-only. |
| Watch always-on ambient agent screen | Historical physical verification off charger through100seconds, wake restoration and ongoing marker cleanup. Samsung charging screen can supersede it. |
| Watch recording screen-on and background speech lifetime/buffer repair | Installed and unit-tested. Full long answer while lowering wrist still needs physical acceptance; not marked fully verified. |
| Phone recording keep-screen-on and calmer handoff swipe/animation | Installed hash verified today;145phone/42watch tests in deployment evidence. Physical hold/swipe acceptance remains unverified. |
| BLE close-and-deliberate-hold context handoff, secure review and explicit Send | Active desktop physicalTap module matches source at snapshot; installed phone implementation. Real Windows advertiser previously verified. Complete private capture-to-send flow not tested. RSSI is approximate proximity. |
| Structured context/original document picker | Installed review path and active older browser context module. Original bytes require explicit grants; unknown metadata remains unknown. Later YouTube/PDF additions have separate deployment status below. |
| Phone Accessibility control, PC execution destination, separate scrcpy viewer | Native phone control device advertised connected; authorized ADB also available for Pixel7. Real control/viewer operations require separate decisions. Local phone agent execution remains unavailable. |
| Chrome browser control and user-authorized file upload | Current extension connected; active upload module matches source. Earlier Kennards photo preview/send/delivery verified once, text not duplicated. No send repeated today. |
| Mid-reply access selector | Active access module matches source; installed phone/watch selectors. Codex update uses native permission route, Claude next-message scope. Synthetic tests passed; live permission-change acceptance not exercised today. |
| Codex approval mirroring/forwarded interaction routing and notification actions | Active forwarding module matches source; prior real interaction evidence. OS-specific Codex-only Chrome consent mirroring has no conclusive end-to-end phone/watch evidence and remains a verification gap. |
| Approval-policy correction | Live interactive policy is on-request with user review, including Full Access; filesystem scope remains separate. No real decision generated in audit. |
| Plan usage awareness | Active providerUsage module matches source. Codex reported windows; Claude passive observed event may be unknown/stale. Unknown never means exhausted. |
| Caption/speech speed synchronization, branding, notification text sanitation and quiet live activity | Earlier tests/install/live evidence; present in subsequent active build lineage. No new physical audio/icon/heads-up acceptance performed. |

## Implemented but not live in desktop snapshot

| Feature | Evidence and remaining work |
|---|---|
| Non-destructive long-reply watchdog | Current source replaces automatic five-minute finish/stop with waiting status. Active013358 still has the old destructive watchdog. Screenshot18:26 reproduces it. Existing regression covers quiet long tools, late completion, no duplicate start, and explicit Stop. Activation is necessary. |
| Native watch QR pairing and bounded10minute maintenance | Both Android apps installed; desktop `deviceAccess.ts` absent from live build. Physical scan/maintenance acceptance outstanding. |
| Integrated no-ADB MediaProjection viewer | Installed Android capability; desktop phoneStream modules absent live. Fresh Android screen-share consent plus Ally raw-view approval required. Generated-content harness only; no physical capture verified. |
| YouTube timestamp continuation and richer browser media provenance | Tests/source present; youtubeContext module absent live. Native Spotify/media-session/transcript adapters still missing. |
| Resumable file-transfer server | Source and23 synthetic tests exist; `transfer.ts` absent live. Integration is incomplete even after activation; see defect below. |
| Multi-Codex-account profiles/login/usage/chat affinity |106focused and903broader tests passed with documented exclusions; account modules absent live. Real three-account sign-ins and runtime API compatibility not tested. Explicit new-chat handoff exists; automatic rotation is not implemented. |
| Native transcript local-image crash guard | Six focused tests/types/native UI build passed. Active MarkdownImage source differs from repaired version. Needs activation and physical retest. |

## Confirmed incomplete or faulty work

1. **Large transfers are not complete.** Reproduced with a generated21MiB binary using the real compiled TransferStore and DeviceMedia: every512KiB chunk accepted; finalisation throws `Attachments must be between 1 byte and 20 MB`. Unit tests substitute a permissive media mock, so they miss this integration limit. `TransferReceiver` has no production call sites; normal share drafts still enforce20MB/file. Therefore README/docs claiming100MB end-to-end support are premature. Repro `.local/feature-audit/transfer-integration.cjs`; no user data was used.
2. **Long-running work can still be stopped in the active build.** Source is fixed, deployment is stale. The audit itself hit this timeout.
3. **Phone-local Codex/Claude agent execution, offline-PC takeover, automatic routing recommendation with real phone backend, summary-return execution flow:** not implemented. PC-driven phone control is a different working feature.
4. **Universal media handoff:** Spotify transfer, native now-playing/transcript acquisition, original browser PDF export, general audio routing remain missing. YouTube continuation covers only supported observed URL/position data. Source-app PDF page extra and explicit user entry exist, not automatic page inference.
5. **Cross-restart exactly-once message reconciliation:** current ordinary receipts are not proof of persistent exactly-once recovery. Resumable file chunks do not solve message receipt persistence.
6. **Native image crash repair and account feature:** source complete, runtime acceptance pending. Automatic three-account switching from the original request was not shipped; the takeover implements isolated profiles and explicit handoff.
7. **Physical acceptance:** full watch readout/screen-off speech, mid-reply permissions, phone/watch notification action delivery for each native approval class, QR pairing/maintenance, native viewer consent/Stop, final phone swipe/recording styling remain incompletely verified.
8. **Existing test gaps:** two NotchHomePreview hidden-polling failures remain; final903-test run explicitly excluded that file. Watch lint has seven known errors outside native-access work. These were documented, not fixed by passing other suites.
9. **False proximity triggers:** a separate current chat has claimed HoldApproachGate and phone-only installation. At audit snapshot this is active independent work; do not mark its new fix installed before its result is recorded.
10. **Publication:** PR46 is OPEN and not merged, independently verified with GitHub CLI. Hero screenshot refresh remains outstanding. New account/image repair changes are uncommitted and not established as included in that PR.

## Recent development chat outcomes

| Chat | Outcome |
|---|---|
| Fix Ally chat connection and rich mobile… | Many earlier features deployed; current audit hit old live watchdog. Timeout activation queued after reply, not yet claimed complete. |
| There was a tool called SRCPY on GitHub | Continuity/viewer coordination and phone polish completed; later native-image crash fix source-ready only. |
| Implement Ally physical tap handoff. This is a new dedicated visible chat reques | Earlier watchdog/user stops were resumed; final native-access and polished APK installations completed and independently evidenced. Physical acceptance/PC activation gaps remain. |
| Phone/watch power-hold chat picker (Claude) | Picker/media/PDF work completed in source. Account task definitively stopped at14:59 with “out of extra usage”, reset reported18:50. Do not infer present allowance from this old message. |
| Ally Codex account management takeover | Rescued interrupted account task; implementation/tests complete. Latest18:16 restart stopped safely at active-work guard; not a hang and not deployed. |
| Ally notch feature parity (Claude) | Transfer source/tests and documentation completed; PR46 opened.100MB integration defect newly found by audit; screenshot refresh still outstanding. |
| Watch always-on agent progress display (Claude) | Completed, installed, historical physical ambient verification. |
| Desktop chat search in Ally sidebar (Claude) | Search completed; later messages are continuity design, not evidence that phone agent runtime shipped. Subsequent implementation moved to dedicated chats. |
| Keep optimizing Ally performance and… | Earlier performance/sync/notifications deployed; upload work explicitly stopped and handed over to current fix chat, which completed sending once. No abandoned duplicate send. |
| use this script and restart ally Created restart-ally-manual.ps1. Run this in Po | Restart later confirmed successful, but its chosen build is older than later feature work. A successful restart does not prove newest feature coverage. |
| Can you check this? This might be a problem If it is fix it, it'll be on region' | Cloudflare active tunnels upgrade reported completed/healthy. Three offline hosts remain version-unverified. This is tunnel maintenance, not an unfinished Ally UI feature. |
| is there currently an ally chat running / Does this model have a browser use kind of thingy? | Informational questions, not stalled implementation tasks. |

Additional older context checked: “hi bro” (older robot/server/restart work), “Ally study prototype modifications (fork)” (explicitly stopped prototype/native work), “DroidCore motion as an MCP server for Ally agents” (sim tested historically; real hardware handlers/Isaac remain incomplete). They do not establish those robot services are running today.

## Timeout activation follow-up

User requested fix and continue after the18:26 timeout screenshot. Source watchdog fix already exists; rerun bridge regression before activation. A fresh source-matching staged build071750-cce513f8 was found. The normal restart script retains idle/durable-draft/identity/source-hash checks and now has explicit `-Yes` for this user-authorized invocation; default interactive confirmation remains. A background helper waits for this reply to finish, then activates through that script. Status: `.local/feature-audit/activation-status.json`. Until it says complete and verifies live build/chat/draft/native connection, rows above remain snapshot/deployment-pending, not live acceptance claims. No old prompt, photo, account login, real consent or microphone action is replayed.
