# Compact notch decisions

The minimized native Home preview used to append all interactions from the selected chat. It now retains all live, unexpired pending decisions; otherwise it shows at most the latest closed decision, only for 60 seconds and only since the current exchange started. Embedded timeline requests use the same policy and are deduplicated. Complete audit history remains in the expanded chat.

The Home entry point previously discarded request bodies and always used GET. Approval/question submissions therefore reached the existing POST-only notch allowlist with the wrong method. The native-capability API client now sends bodies using authenticated JSON POST, preserving exact request IDs and the existing server-side bridge credential handling. Read calls stay GET. Failed answers are surfaced without automatic replay. Audio mute writes benefit from the same correction.

No broker action, expiration, desktop-only/private question restriction, native permission requirement, Origin policy or route allowlist was expanded. Tests submit synthetic requests only, never real user approvals.

Validation: 19 UI/client/policy tests and 15 real HTTP proxy/selection tests passed. Desktop and native UI TypeScript/build results and activation status are recorded in `.local/compact-notch-decisions-*`. Physical user approval acceptance is not claimed by the tests.
