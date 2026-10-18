# Combined feature integration — 2026-10-18

The user explicitly requested all ready Ally feature work merged into main and redeployed. There were no open feature PRs at the initial check; PRs through #32 were already on main. This integration publishes the remaining ready source together, rather than deploying one chat's snapshot over another's features.

Included: native Guardian source filtering and off-page receipt projection; invocation-bound Android phone screen context; recent-folder disclosure and stable Codex list/history loading; unchanged-reply memoization; assistant activation/routing and activity monitor; widgets/tiles and uncapped unread reachability; stable newest-created history; movable visual tutor card; queue presentation; Stop/Resume receipts; natural device replies and real inline interaction history; Markdown image handling and associated regression coverage. Existing UI presentation and permissions are preserved except for the explicitly requested features.

Integration correction: Codex list, foreground history and background metadata use separate read-only RPC connections. A Guardian metadata timeout cannot cancel a foreground chat open. The new regression checks that isolation without a real model turn.

User follow-up adds a tiny Agents disclosure inside the desktop collapsed pill. It uses the same filtered activity projection through restricted renderer IPC, without depending on phone pairing. The closed control is a 20px text/icon row; opening reveals a 112px maximum scrolling viewport with every active/unread row. Polling runs every four seconds only while open. Real stopped/error/needs-input status and stale Last seen labels are retained. Clicking selects the exact existing conversation without sending, stopping, answering or acknowledging anything merely from the status list. Existing pill controls and visual style remain intact.

Local MCP backup, vendor checkout, environment files, caches and build outputs are excluded from the commit. No reset/stash/clean or conversation deletion is part of this integration. Shared concurrent edits are preserved; the tested snapshot's source hashes are compared before committing and activation.

Validation and frozen artifacts are recorded in the new `Exo/.ally-main-integration-20261018` candidate, which does not overwrite earlier builds. Desktop full tests, TypeScript, renderer/Electron builds and Android unit/APK/phone-lint results are recorded there. Full watch lint retains its documented unrelated WearPasswordInput blocker in the untouched pairing form; no rule is disabled.

Deployment targets desktop plus the existing USB phone `2C181FDH2000W3`, with data/pairing and assistant settings preserved. Watch source/APK is included in main, but watch installation remains deferred by the user's earlier explicit choice. Activation checks the exact predecessor, frozen hashes, other native/device responses, capture, pending decisions and phone identity before changing the runtime. Native Codex/Claude and speech workers must not be killed as descendants. No private screen capture, microphone recording, real model test send or approval decision is used as verification.

The candidate's `deployment.json` records actual activation state; a merged commit alone does not mean desktop or phone is live. Physical power-gesture/screen callback validation remains a manual check using a harmless synthetic page.

## Verified integration result

PR #33 merged as `a6e4a168d3895241929acbba2cce8133749d880a`. All 475 source files in the isolated candidate match merged main; 447 build/APK/updater artifacts have frozen hashes. Full514 desktop tests pass (four opt-in profiles skipped), TypeScript/Vite/Electron builds pass, phone56/watch29 JVM tests pass, both APKs and phone lint pass. A separate25-test affected run includes the tiny monitor and metadata-lane isolation regressions.

Vercel's preview check fails because its configured `ally-remote-service` root is absent from both the previous and current Git trees. Its log fails before the application build starts. No hosting settings were changed; the locally tested desktop/Android app integration was merged as requested.

Desktop-only helper12936 was armed against exact predecessor34808 after hash/source checks. It waits for every response and pending decision and for capture to stop, then verifies local/cloud health after activation. It expires after30 minutes and stops if predecessor/port ownership changes. No APK installation is included in that helper. Final status is `Exo/.ally-main-integration-20261018/deployment.json`.

Connected `device_list` and `phone_control_devices` checks did not execute: automatic approval review reported its usage limit, explicitly not a safety determination. There is no pending approval. Phone deployment is blocked until that review capability is restored; no alternate phone access was used to bypass the failed checks. Watch installation remains explicitly deferred.
