# Browser extension repair — 30 October 2026

The reported failure was intermittent: the normal Ally connection and tab tools
subsequently found Chrome profile `179f1905-3ab8-4f44-94cb-0599fb0ef7ec` and the
existing WhatsApp tab. No WhatsApp messages were read or sent during this repair.

## Comparison and delivered changes

The installed ChatGPT 1.26.1020.11845 manifest declares native messaging,
debugger, tabs/groups, downloads, scripting, alarms, sessions, bookmarks/history,
offscreen processing and a side panel. A manifest establishes declared features,
not reliability or access to its proprietary desktop connection. Its code,
credentials and private protocol were not copied or changed.

Ally already implements semantic references, screenshots, navigation, foreground
indicators, task-owned tabs/groups, downloads, approved file attachment, dialog
handling and pixel interaction in its extension engine. Its authenticated agent
interface exposed only a subset. This repair adds:

- Exponential native-host reconnect starting at 250 ms, capped at 10 seconds,
  with the existing 30-second Chrome alarm retained for service-worker recovery.
- An 8-second initial native-host handshake watchdog, stale-port message guards,
  cleanup on connection setup failure, an explicit Reconnect popup action, and
  display of the actual native-host error.
- A bounded desktop wait for the selected returning profile before dispatch.
  Transport write failures immediately remove the dead connection. Diagnostics
  distinguish connected, disconnected and busy profiles.
- Focused and interactive snapshots, bounded visible-text waits (including
  disappearance), and main-frame text/table extraction through the Chrome tool.
  Extraction/waits do not authorize subsequent input: take a new snapshot first.

This is not a claim of complete ChatGPT extension feature parity. ChatGPT's
history/bookmark APIs, its side-panel application and account-specific services
remain separate. Existing Ally native browser features also retain their current
tool boundaries. No browser permissions were added.

## Recovery guarantees

Recovery reconnects the transport; it never repeats a click, send or upload.
Unknown delivery remains unknown. Ownership restrictions, Stop, site restrictions,
upload approval and request deduplication remain enforced. Cancelling during
reconnect prevents later dispatch. A missing or empty page snapshot does not mean
the extension is disconnected.

Source patches for Ally's private unpacked extension are installed with
`node ally-study/apply-browser-reliability.mjs`. It validates all source anchors
before replacement, keeps rollback copies and is repeatable. It changes Ally's
private extension files only. Chrome must reload the extension to load them.
The desktop changes require a source-matched staged build and idle activation.

Validation: browser/policy/ownership/upload fixtures and reconnect tests plus
TypeScript. Live normal connection discovery and tab enumeration succeeded.
Windows Computer Use could inspect Chrome but repeatedly failed activation;
that is not evidence a reload occurred. Record actual extension reload and
desktop activation separately before describing these changes as live.

## Follow-up: debugger lifetime and stopped turns

The 15:06 screenshot's underlying tool history contains a different failure:
the profile was connected, two clicks failed with stale references, then a read
failed with `Browser access stopped for this turn` after three `target_closed`
debugger detachments. The assistant's claim that Chrome disconnected was wrong.
No authentication or verification was attempted by the repair chat.

The follow-up patch checks both document epoch and debugger-state identity after
all asynchronous snapshot probes. A changed document/session cannot publish
apparently current references. A read-only snapshot may reattach and observe
once; the existing Stop/ownership checks still run and input is never replayed.
Detach budgets are now keyed by trusted task plus tab, instead of accumulating
for the lifetime of a tab across future turns.

The agent tool now uses Ally's exact managed-run identity when available, with
desktop-owner activity as the fallback. This preserves Stop throughout the same
user turn without accidentally making it a process-lifetime restriction on all
future requests. Model-supplied fields cannot create a fresh task. Structured
faults report page-reference errors, stopped turns and transport failures
separately, with Chrome connection status and an explicit no-replay instruction.

Twenty-five public tests and four extension tests pass, including a document
change during geometry lookup, debugger replacement during a read, user cancel,
three-drop limits, managed-run scoping and an attempted model-forged turn ID.
These fixtures do not establish why Chrome detached on that specific sign-in
page. The stopped login is not reopened, replayed or taken over for testing.
