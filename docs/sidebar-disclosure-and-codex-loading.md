# Recent folder and reliable Codex discovery

User follow-up explicitly authorizes the existing desktop Recent & unread section to behave like the working-folder dropdowns, with additional chats available on demand.

The section starts closed and remembers its open/closed setting. Opening it shows six newest-created chats; View more reveals every remaining row, and View less restores the preview. The folder retains an unread indicator while closed. Disclosure never acknowledges a receipt. Existing row destinations, provider separation, order, running controls and styling are retained. All entries remain in the underlying list; no data cap is introduced.

The supplied screenshots show Continue MECH5720 Lab 1. Live runtime logs identify the failure chain: `agent:listSessions` hits `Codex thread/list timed out`, timeout recovery closes its shared Codex RPC pipe, and concurrent `agent:loadSession` requests fail with `Codex connection closed`. The renderer then replaces the failed provider's rows with an empty list, causing visible disappearance until a later successful refresh.

Fixes:

- Separate read-only RPC connections for lists and chat history, so a list timeout cannot cancel an in-flight chat open. Each connection still recovers on its own timeout and both close on shutdown/configuration changes.
- Coalesce overlapping desktop focus/event/manual list scans. On a failed provider refresh, retain its last successful rows while still updating providers that succeeded. A successful empty response still removes rows normally. Unmounted hooks do not issue new scans.

Validation:38 focused regressions pass; isolated TypeScript, Vite and Electron builds pass. Full suite:501 pass, one existing runningSessions filesystem timing timeout; the full nine-test runningSessions file passes on isolated rerun. Four opt-in performance cases were skipped. Tests cover list-timeout isolation during chat hydration, recovery, refresh coalescing, failure versus authoritative removals, disclosure persistence, all rows behind View more, exact unread destinations and unchanged receipts.

Read-only native probes found both exact MECH5720 sessions and their original folder. The compiled candidate loaded all895 messages in the original chat in113560ms while listing five chats concurrently. The original history has hundreds of turns; it is not truncated. The continuation's native metadata read succeeded, but the additional full-history diagnostic hit its150-request safety budget after partially reading the continuation; a complete continuation-history verification is not claimed. Diagnostic limits are not production list/history limits.

Measured turn-page sizes5/20/50 returned169567/537651/5604512 bytes in708/2280/6454ms respectively. Larger pages approach the eight-second RPC deadline, so the existing safe five-row history pages remain. Large first-time histories can still take about two minutes to load; the confirmed cancellation and disappearing-row failures are addressed without removing history.

Candidate: `Exo/.ally-recent-folder-20261018`. It starts from the deployed performance snapshot and includes only the disclosure and refresh/RPC changes, preserving the reply memo optimization. Concurrent Guardian/discovery source edits remain intact in the workspace and are excluded from this scoped candidate until that owner's integration. Shared dist, Git and frozen prior candidates are untouched.

Deployment is guarded by exact predecessor12780, port ownership,442 artifact hashes, no capture and no other active reply; the requesting native chat may continue. Native Codex/Claude processes are preserved regardless of parentage. Initial Windows PowerShell helper could not resolve Get-FileHash and exited before any runtime mutation; PowerShell7 helper34456 is the active replacement. The separate Guardian/screen-context reply was active at the last check, so deployment was waiting. Candidate deployment.json is authoritative. No Android install; watch remains deferred. No real messages, recording or read acknowledgements were sent by the probes.

Deployment completion: candidate deployment.json reports complete at2026-10-18T10:41:18Z, PID34808. Subsequent user-requested status check confirms the exact candidate owns18765/18767 and fresh local/cloud status is connected. No Android installs; watch deferred.
