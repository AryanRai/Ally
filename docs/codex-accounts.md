# Ally Codex account management takeover

This implements the unfinished account-management task transferred from Claude session `3a166321-38a9-4461-ad1d-c86c5932ebce`. The source tree was clean at intake; the saved Claude plan remains unchanged. Completed media/PDF/picker/device-viewer work was not repeated. This visible Codex chat was renamed to **Ally Codex account management takeover**, verified with a metadata-only read.

## Account setup

After an explicitly authorized future activation, open **Settings → Agents → Codex accounts**. Add a label for each account to manage, then click **Sign in…** and complete the provider's normal browser login. Verify the intended email in the browser. No password/token entry, credential import or secret copying is implemented in Ally. Click **Check usage** for an on-demand account and allowance check; it does not send an inference request.

Each added profile has a stable UUID and its own `CODEX_HOME` at `<Ally userData>/codex-profiles/<id>`. Only the child process's Codex home changes. Windows `HOME`, `USERPROFILE`, `APPDATA`, and `LOCALAPPDATA` remain intact. Alternate inherited provider credentials/base URL are removed from that child's environment. Codex is launched with its documented file credential store, keeping its own authentication material inside the profile instead of relying on a shared keyring. The metadata file `codex-accounts.json` contains labels, selection, thread affinity, verified email fingerprints and usage observations, not credentials. [OpenAI authentication documentation](https://learn.chatgpt.com/docs/auth), [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Sign-in is deliberate, cancellable and bounded to five minutes. Concurrent sign-ins are refused; a profile cannot sign in while its Ally-managed replies are active, and a send cannot start during its sign-in. Ally opens only a validated HTTPS provider login address. Closing the private login app-server abandons its callback; cancellation does not log an account out or revoke an already completed login. Removing an unused profile removes metadata only and leaves Codex history/authentication files untouched. Selected, active and chat-referenced profiles cannot be removed.

The reserved **Existing Codex login** entry retains the existing environment and experimental native desktop behavior. Its authentication is managed in Codex itself. It is not an isolated third-party account import. Add isolated profiles for accounts that need stable managed identity. Multiple profiles signed into the same email do not imply independent allowances.

## Selection and chat affinity

**Use for new chats** changes the default for subsequently created chats. Existing threads resolve through a durable thread-to-profile mapping, regardless of later default changes. Old unclassified native threads stay on the reserved existing login. A missing profile, conflicting profile selection, invalid metadata or changed verified email fails closed; another account is never substituted.

Managed profiles verify their ChatGPT email through the provider account API before history reads and turns. This is an email fingerprint, not a claim that Ally can attest distinct workspaces sharing one email. A different email requires signing back into the original identity or creating a separate profile. Local chat links also persist the profile. PC selection metadata and unsubmitted device chats carry it before the first native thread exists. The central runner resolves the same affinity for desktop, phone/watch, queues and cross-chat requests; no independent retry router was added to those transports.

The expanded Codex composer shows its account and offers **Use account** before a session exists. Once a thread exists, **Create handoff chat** opens a separate empty local chat on the chosen account. It sends nothing and copies no transcript, draft or attachments. The original chat, failed-send text, receipts and partial files remain where they were. Review them and explicitly write/send the context and remaining work to transfer. Existing queued work stays with the source chat.

## Automatic switching on the same chat (28 October 2026)

All account profiles share one chat history: each profile's `sessions` and `archived_sessions` folders are junctions to the main Codex home (`~/.codex`), and its `config.toml` and `AGENTS.md` are copied so tools and instructions follow the chat. Credentials stay in each profile and are never copied. Because history is shared, any signed-in account can resume any chat, and chats are listed once.

A chat remembers the account it last used. With **Switch accounts automatically** on (the default), Ally picks the next available account (in Settings order) when that account is limited; a limit counts as over once its reported reset time passes, or after 30 minutes when no reset is reported. On a usage limit during a turn:

- **Refused before it ran** (limit seen at turn start, or a structured rejection of `turn/start`): the same message is sent once on the next account.
- **Cut off after it was accepted:** the chat continues on the next account with a short continuation turn asking the agent to pick up where it stopped.
- **Delivery uncertain** (a timeout or disconnect with no definite acceptance or rejection): nothing is resent.

When every account is limited, Ally says so and leaves the chat as it is. Turning the setting off restores manual switching (choose an account, or create a handoff chat). Chats currently open in the Codex desktop app run through that app's own login; Ally can move them to another account only when Codex is not holding them open. Verified live: a chat started on one ChatGPT account continued on a different account with its context intact, through Ally's own bridge.

## Usage and delivery

Statuses distinguish unchecked/unknown, signed out, available reported windows, limited windows and unavailable verification. The UI shows account/plan when reported, percentage used, exact provider Unix reset timestamps and observation time. Observations persist across restarts. They can become stale and do not guarantee model entitlement. Missing/unsupported usage methods stay unknown; Ally never invents allowance or parses local-language error text into reset times. The provider remains authoritative. Login and allowance reads use the documented app-server account methods. [OpenAI app-server account API](https://learn.chatgpt.com/docs/app-server).

Ally never redeems usage resets or works around a provider quota: switching moves the chat to an account that still has allowance; it does not increase or transfer any account's allowance. Multiple profiles signed into the same email share one allowance.

| Evidence | Delivery handling |
|---|---|
| Setup/profile mismatch or fresh explicit provider limit before turn submission | `not_sent`; keep the draft/source request |
| Structured JSON-RPC usage rejection returned to `turn/start`, with no acceptance observed | `not_sent`; no second account or retry |
| Timeout/disconnect after dispatch without definitive rejection/acceptance | `uncertain`; inspect the original receipt and native chat |
| Accepted turn/started item/completed-turn evidence, including a later quota failure | `accepted`; never describe it as unsent |
| A text string mentioning a limit without structured proof after dispatch | Does not authorize replay or establish non-delivery |

Older app-server versions may not return structured rejection data. Such failures remain uncertain after dispatch. Request IDs, native message/turn IDs, device deduplication and queued receipts retain their existing ownership; switching accounts does not create an automatic replacement request. No changes were made to installed Codex security/account gates, access review, browser ownership or device approvals.

## History and scope

The native directory walks each profile through explicit profile-bearing cursors. Managed history follows every turn/item page, has revision-based unchanged responses, and uses the owning profile only. A failed read cannot borrow the reserved login. Unauthenticated profiles have no browsable history until sign-in. Legacy default history remains on its existing optimized local/native path. Profile metadata reads and device-title repair also respect the owner and verify identity.

Desktop settings/composer provide the account-management UI. Existing phone/watch chat lists and sends inherit the account route; this change does not add separate Android account setup screens. Native-thread identity, model catalog, browser capabilities and approvals are not transferred between accounts.

## Validation and runtime gaps

Source-ready validation (27 October 2026):

- 106 focused account/RPC/lifecycle/history/selection/device bridge/UI regressions pass after final review.
- TypeScript, Vite production build and final Electron build pass. Vite emits the existing large-chunk advisory.
- Final broader run: 185 test files pass, one opt-in file skipped; 903 tests pass, four opt-in tests skipped. Command: `npm run test:run -- --maxWorkers=2 --exclude src/components/chat/NotchHomePreview.test.tsx`.
- The unrestricted run remains recorded: 898 passed, three failed, four skipped. Two failures are the independently reproduced pre-existing notch hidden-polling assertions; that four-test file was explicitly excluded from the final broader run, not changed or suppressed globally. The other failure was a 5-second running-session scan timeout under concurrent full-suite load; all nine scanner tests subsequently pass separately and in the final broader run.
- The final focused pass additionally covers the last metadata-validation/history-title safeguards added after the broader run had begun. It checks that stale device titles cannot overwrite original profile-thread titles. Final types/Electron build were rerun afterward.
- `git diff --check` passes. Separate peer edits to `MarkdownImage.tsx` and its tests are preserved. No changes to peer media/PDF/picker/viewer code were made. Logs are in `.local/codex-accounts-{types,vite,electron,tests,final-tests,focused}.log` (local, uncommitted evidence).

No app was restarted, installed, staged for activation or deployed. No real account login, private model/microphone/control test, agent inspection/copy of credential files, commit or push occurred. The only live task action was the explicitly requested current-chat title change, using `thread/name/set` and a metadata-only verification. The original Claude chat was not modified.

The three real account logins, actual installed-version account API compatibility, physical settings/composer rendering, and end-to-end phone/watch use of signed-in profiles require later user-owned acceptance after activation. Source tests use synthetic accounts, transports, histories and usage responses. No claim of live account availability or seamless cross-account context continuity is made.
