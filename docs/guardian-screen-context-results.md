# Guardian discovery filtering and phone assistant screen context

2026-10-18. Separate implementation from the UI performance chat. The current UI, styles, spacing, animation and monitor viewport are preserved. The unchanged-reply React.memo improvement is included in the new combined source snapshot.

## Confirmed cause

Both supplied screenshots were inspected. Native Guardian session headers identify `source: {"subagent":{"other":"guardian"}}`, `thread_source: "guardian_review"` and a parent thread. A read-only SQLite metadata cross-check found 16 internal and one user Codex receipt among the durable unread Codex entries at investigation time. No transcript bodies or receipt flags were changed by this check.

Normal history already requests interactive/exec `sourceKinds`. The uncapped activity feed independently reconstructs conversations from durable unread receipts, then previously loaded a whole native history just to resolve its title. Native unread mirroring and fallback running/history scanners did not apply the history source restriction. These paths reintroduced Guardian threads, including ones outside the loaded page. This is not evidence of a title-filter problem.

Official OpenAI documentation describes read-only thread metadata and source filters, including subAgentReview/subAgentOther: https://learn.chatgpt.com/docs/app-server#list-threads-with-pagination--filters . The specific Guardian source/purpose above was verified locally; the public documentation alone does not establish that private source variant.

## Filtering behavior

`codexDiscovery.ts` classifies native source/purpose, never an editable title, originator or parent alone. Ordinary CLI/app-server/exec chats named Guardian review and user-created forks remain discoverable. Unknown/unavailable metadata remains reachable.

The shared projection covers native lists, fallback summaries, running/terminal scanners, durable off-page receipts, saved desktop imports, merged phone/watch aliases, assistant routing, activity/attention, notification delivery, and MCP list/search via the same native list. Widgets/tiles consume that filtered activity feed. Android explicit hidden receipt keys remove retained internal-only cached list/attention rows on refresh. Existing stale/error labels remain authoritative on failure; no real receipt is acknowledged merely by listing.

Internal receipts/history remain stored. Their discovery projection emits `hidden: true, unread: false`, which clears obsolete client dots without writing read acknowledgements to Ally or Codex. Real interaction questions, approvals, denials and exact revisions in the originating user conversation are unchanged. No approval policy or reviewer mechanism is disabled.

Session headers are bounded to 64 KiB and cached against file identity/size/times; directory/title indexes refresh after five seconds. Missing/offline metadata uses at most two deduplicated `thread/read` metadata requests, with a five-minute retry cache. Codex title warming no longer loads every receipt's full turn history. No new history or unread sample cap is introduced; creation-time history sorting is unchanged.

The second screenshot's first and last partial rows are consistent with a scrolled, bounded viewport. There is no demonstrated clipping defect beyond ordinary scrolling, so `AssistantSheet` layout and scroll behavior were left unchanged.

## Phone context lifecycle

Only phone assistant invocation accepts Android's `onHandleScreenshot`/`onHandleAssist` data, with the system/user disabled-context flags honored. The explicit voice launcher requests the supported flags; hardware invocation uses the flags and snapshot supplied by Android. No second capture is requested from the visible Ally overlay. Own-app assist metadata discards the snapshot. The unlock interstitial deliberately requests no screen context. Watch, Agents, Inbox and monitor-only launches do not accept screen context.

One generation-bound screenshot is encoded off the UI thread. Assist text is bounded to visible system-provided fields, omits password/blocked nodes, and is labelled as screen data. A query is required before any upload/message. Context stays with that invocation while choosing a relevant/new chat. It is frozen before submission, uploaded through `/v1/attachments`, and included once in the existing idempotent message request. Chosen chat, permission, request ID, uploaded attachment ID, frozen submission and accepted receipt survive explicit retry; receipt adoption does not resend. The normal user-visible query remains the routing input.

Raw screenshot bytes stay in memory, are cleared on completion/dismissal/cancellation/silence, and are never saved in preferences or a local screenshot file. Once a query is submitted, its uploaded image uses existing attachment storage like other user attachments. Only the media ID and frozen text needed for an unfinished retry are retained in the existing private draft. Dismissing or process loss before upload loses the transient screen, keeps the words/request identity and reports screen unavailable. Later orb interactions do not recapture or reuse the completed invocation's screen. Missing/denied callbacks time out after 1.5 seconds at submission and continue normally with a compact honest indication. There is no ADB capture, accessibility capture, continuous recording, settings change or FLAG_SECURE workaround.

## Candidate and verification

Fresh candidate: `C:/Users/buzza/Desktop/Projects/Active/Exo/.ally-guardian-screen-context-20261018`. `validation.json`, source/artifact hash manifests and logs there record final checks. `deployment.json` is the activation authority. Existing monitor/performance candidates are preserved. The performance candidate was independently deployed by its owning chat during this task; bridge/MCP PID12780 was observed afterward. This task does not restart that runtime, install an APK, arm an updater or perform Git operations. Watch installation remains explicitly deferred.

Final desktop validation: 509 tests pass (four opt-in profiles skipped), TypeScript/Vite/Electron builds pass; final classifier/sidebar run adds 16 passing checks after metadata concurrency and test-typing corrections. The compiled read-only receipt smoke check reports 19 hidden internal entries, no hidden-unread entries, and an unchanged receipt-file hash. Counts are observations, not fixed expected user unread totals. The genuine native unread receipt observed earlier had already changed independently by the smoke-check time; this task sent no read acknowledgement.

Android validation: 56 phone and 29 watch JVM tests, both debug APK builds and phone lint pass, including the final cancellation/error handling rebuild in `logs/android-final.log`. Full watch lint is not rerun; the previously documented unrelated `WearPasswordInput` error in the untouched pairing form remains outside this change. No lint rule is disabled. Vite retains its existing large-chunk advisory. All 471 source/script files in the snapshot match the workspace; the performance reply component matches its independently frozen candidate. `verify-candidate.ps1` checks frozen hashes without restarting or installing anything.

Regressions cover native source variants, legitimate same-title chats/forks, 90 internal receipts outside loaded pages, unchanged durable receipts, genuine attention, saved aliases, fallback running/terminal scans, cache invalidation, metadata-read deduplication/concurrency/failure caching, cached desktop rows, Android hidden receipts, query/media retry identity, context denial/timeout, own-overlay callback order, stale callbacks, silence/cancellation/resource release and repeated invocation. Existing bridge attachment tests exercise inert upload and exact-chat attachment delivery with synthetic media.

No microphone recording, private screen capture, real model messages or approval decisions were performed. Synthetic JVM tests verify the context/submission lifecycle; physical power-gesture/callback delivery and live layout are not claimed as device QA.

## Safe manual checks after a coordinated update

1. Confirm the selected assistant/pairing and Samsung power mapping are retained. Install only the phone update with data preserved; do not install watch without a new instruction. Restart desktop only when all native/device responses and capture are idle, with a fresh exact runtime check.
2. Refresh history, search, recent/running lists, compact monitor and widgets. Guardian internals should disappear, counts should match reachable real chats, older unread chats should remain reachable, and an ordinary user chat named Guardian review should remain. Viewing lists must not clear genuine unread/approval state.
3. On the phone, display a harmless synthetic page. Invoke the assistant normally, enter a screen-related question and deliberately choose a test chat/new chat. Verify the pre-overlay screenshot arrives once through normal attachments. Do not use a private screen for validation.
4. With Android screen context disabled or a protected app visible, verify normal text/voice still works with the compact unavailable/text-only indication. Do not alter security settings to bypass a denial. Check own-Ally invocation, unlock, no speech, cancel/dismiss, explicit retry and later orb use for stale-image reuse. Agents/Inbox/widget monitor launches must not capture or listen.

If the OS does not supply a screenshot for this assistant/device, report that as unavailable; do not substitute another capture path.
