# Codex desktop browser from Ally — 2026-10-17

Status: unresolved. Do not advertise native Codex browser support in Ally.

## Working alternative: native tools through Chrome

Verified from Ally's actual `runCodexTurn`, including the existing watch chat,
and then through the running desktop app's authenticated watch API:

- Opened Chrome and read page content using the installed `cua_repl` tools.
- Filled and submitted a synthetic form on an isolated loopback test server.
- Uploaded a generated text file to that same local server after a real native
  upload approval arrived in the watch queue and was answered using the user's
  explicit consent. The server verified the exact generated file content.
- No Gmail draft, real report, or external message was modified.

The noninteractive desktop path used `approvalPolicy: never`. An upload there
was rejected with “permission declined.” Retrying with `on-request`,
`approvalsReviewer: user`, and the existing watch handler produced a genuine
MCP elicitation and succeeded after approval. Chrome's file-URL setting was
therefore already functional during this test. Earlier connection timeouts
were not reproduced; no claim is made that their underlying cause was found.

Desktop Codex turns now provide a native dialog handler for actual approvals,
and enable on-request review without changing the selected sandbox. The same
permission selector drives both desktop and watch: Read-only and Can edit use
the human reviewer; Full access uses Codex's supported `auto_review` reviewer
for eligible requests. Required browser elicitation still reaches the human
handler, including in Full access. No request is blindly auto-accepted by Ally.
Cancel is the default. Stop/expiry cancels pending decisions. Choice questions
are supported; free-text and secret fields fail closed with an explanation.
The watch retains its richer existing question UI. No approval is fabricated
from an assistant reply.

The installed app-server confirmed `on-request` / `auto_review` /
`dangerFullAccess` for Full access and `on-request` / `user` / `readOnly` after
selecting Read-only, using ephemeral setup-only probes (no model turn or browser
action). Permission regression tests cover both desktop and watch, including
passing an upload denial through unchanged in Full access. UI labels no longer
promise that all prompts disappear. Claude retains its CLI bypass mode.

New/resumed Ally Codex turns receive Chrome-specific environment and bounded
recovery guidance. It avoids stale numeric browser IDs, unavailable `iab`, and
blind replay of side-effecting actions after a timeout. The abandoned custom
browser scaffold has been removed.

Validation: 26 targeted tests, TypeScript, and Electron build. The opt-in
`glass-pip-chat/scripts/verify-chrome-browser.mjs` exercises native Chrome with
synthetic data. `ALLY_BROWSER_TEST_THREAD` selects an explicitly authorized
existing chat; `ALLY_BROWSER_TEST_WATCH_CHAT` selects the actual desktop/watch
bridge and leaves any genuine approvals pending for a human decision. Running
the test consumes an agent turn. Never reuse it to retry a denied upload
without new user consent.

## Observed boundary

Ally starts its own `codex app-server` process, identifying the client as `ally`.
The failing Ally turn reported `Browser is not available: iab`; its subsequent
browser inventory contained only Chrome through the browser extension. A turn
sent through Codex desktop could open Example Domain in `iab`. The latter is a
native-desktop test, not an Ally integration test.

Opening a browser tab in Codex does not establish a connection from Ally.
Changing the preferred browser name or retrying a disconnected browser does not
provide a missing runtime capability.

## Additional checks

- Reviewed official app-server, browser, configuration, and CLI documentation.
- Inspected the installed CLI help and generated app-server client schema.
  No method for attaching an external client to the desktop browser was found.
- Tested the public `codex app-server proxy` command from a child environment
  sanitized by Ally's existing `childEnv()`, with an `ally` initialize request.
  It exited before initialization: connection to the default control socket
  failed with Windows error 10050. `app-server daemon version` failed similarly.
  This establishes that this route is unavailable in the current installation;
  it does not prove that every configuration lacks a shared server.
- CLI help also exposes `codex queue`, but neither its documentation nor the
  successful operation of a shared CLI daemon establishes desktop browser
  access. No messages were queued and no daemon was started or restarted.

The public proxy is a legitimate integration candidate if a future supported
desktop setup exposes it. Starting a separate daemon alone would not demonstrate
that it owns the desktop browser. Test that capability before changing transport.

## Implementation requirements for any future solution

- Verify from Ally's actual execution path, with an innocuous public page.
- Preserve agent permissions and explicit approval decisions.
- Keep one owner of each conversation; avoid private writer-lock manipulation.
- Do not pass another chat's host identity or private app pipe into Ally.
- Do not silently substitute Chrome or another browser for an explicit request
  to use Codex's built-in browser.

An Ally-owned embedded browser is a separate possible implementation. It would
need its own persistent browser profile, sign-in, scoped MCP tools, and approval
handling. It would not share Codex's existing tabs or login state. This option
has not been implemented or validated.

## References

- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/browser
- https://learn.chatgpt.com/docs/developer-commands?surface=cli
- https://learn.chatgpt.com/docs/config-file/config-reference

The browser documentation currently describes the built-in browser as a
desktop-app capability and says it is unavailable in the CLI/IDE. The
app-server documentation describes client transports but does not document a
bridge to the desktop browser. Lack of documentation is not proof that no
internal implementation exists; it means there is no verified supported bridge
for Ally from these checks.
