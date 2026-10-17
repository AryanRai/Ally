# Codex chat ownership (2026-10-17)

Ally uses a private `codex app-server` for each turn. Codex desktop can keep a
thread loaded after its turn finishes. Opening that thread in the desktop can
therefore prevent Ally from resuming it, even when no model is working.

## Verified API behaviour

Tested installed Codex `0.163.0-alpha.10.2` using two private app-server clients
and a synthetic thread whose only turn replied READY, with no tools or actions.

- Client A completed the turn and kept the thread loaded.
- Client B could read the history, but its `thread/read` reported `notLoaded`.
  That is local runtime state, not proof that no other process owns the thread.
- Client B's `thread/resume`, `thread/archive`, and `thread/unarchive` all failed
  with `already has an active writer`.
- Client B's `thread/unsubscribe` returned `notLoaded`; it did not affect A.
- Closing A eventually released the writer. An immediate cleanup attempt could
  still conflict during process shutdown; a subsequent archive succeeded.

The generated experimental `ThreadResumeParams` has no takeover flag. The
documented unsubscribe operation only affects the current connection; even the
last subscriber's departure has a 30-minute inactivity grace period.

## Integration boundary

Ally cannot automatically release Codex desktop's writer through these APIs.
Do not delete locks, edit Codex databases, kill Codex, impersonate its host, or
assume that a completed last turn makes forcibly acquiring a writer safe.
Do not archive arbitrary owned threads from Ally: the API rejects this and
archiving can affect descendants.

A release through the owning desktop's supported archive/unarchive controls can
be performed for an explicitly selected idle chat. This is a desktop action,
not a durable automatic-takeover feature in Ally. Opening that chat again in
Codex can reacquire ownership.

Confirmed for the user's idle “Ally watch — Aditya Lab 4 report” chat: native
desktop archive/unarchive succeeded, then Ally's `CodexRpc` resumed the exact
same thread ID successfully with status `idle`. The verification connection was
closed without starting a turn, sending a message, or repeating the email action.

The user prohibits new forks. Existing migration mappings remain readable, but
Ally never creates a new chat to resolve a writer conflict or legacy exec chat.

Source: https://developers.openai.com/codex/app-server

## Follow-up investigation

Running Ally elevated does not address this lock. The native desktop's
app-server is launched over stdio, and the public app-server control socket is
not reachable on this installation (`daemon version`: Windows error 10050).
The public `codex archive <id>` command was also tested against the same
synthetic completed chat held by another client; it failed to archive it. The
owning client successfully archived the fixture afterwards.

The bundled `codex-app-tools` MCP adapter forwards requests over a host-provided
pipe and requires executor thread metadata. It is not a general external
desktop-control endpoint. Do not copy that pipe or another chat's identity into
Ally to make it appear to be a native desktop executor.

## Scheduled helper removed

A native-tool helper was briefly implemented and tested, then rejected by the
user because scheduled Codex runs consume tokens. The automation
`release-idle-codex-chats-for-ally` was deleted, its queue disabled, and the queue
module/script removed. Do not reintroduce this design.

## Experimental desktop connection

Read-only inspection of installed Codex desktop `26.1013.3656.0` revealed a
separate local client-coordination protocol at Windows named pipe
`\\.\pipe\codex-ipc`. This is not the app-tools executor pipe above.
Ally registers its own `clientType: ally` and receives a fresh client ID. It
never copies executor thread/turn metadata, claims another client's identity,
changes Codex binaries, or edits its databases.

The protocol has length-prefixed JSON frames and versioned operations:
owner discovery (v1), turn start (v2), exact-turn interrupt (v4), approval
responses (v1), and conversation snapshot/patch broadcasts (v11). A plain Node
script successfully discovered a desktop owner, read its settings/state, and
submitted one diagnostic turn to the exact original thread. The native desktop
completed it with `IPC-SAME-CHAT-OK`, preserving prior turns and the thread ID.

A second test through Ally's production adapter invoked native `cua.getState()`
and confirmed the in-app browser is available. The diagnostic chat had no tabs;
browser tabs belong to the owning native chat. This verifies inventory access,
not Gmail uploads or every browser operation.

The live Stop test submitted a diagnostic turn then interrupted its returned
turn ID. Codex reported that turn as `interrupted` and the chat as `idle`.
The diagnostic fixture was archived again after testing. The read-only script
`glass-pip-chat/scripts/verify-codex-desktop.mjs <thread-id>` verifies owner and
runtime state without submitting a message or consuming model tokens.

Settings > Agents > **Codex desktop connection - Experimental** controls this
path for existing chats on Ally desktop and watch. It talks directly to the
owner, streams state updates, forwards supported real approvals/questions, and
interrupts only the exact turn submitted by Ally. Coordination uses no model
runs. User messages still use the normal model quota.

The desktop remains the owner and execution engine. This is shared access to
the exact chat, not an ownership transfer. The app must be open and the chat
loaded. There is no silent CLI fallback after submission or on a timeout. An
uncertain outcome is reported without replaying the message.

Known limits:
- New chats and history/model listing still use the standard CLI/app-server.
- Some native desktop questions are not covered by follower approval methods;
  those must be answered in Codex. No approvals are manufactured or auto-granted.
- Robot MCP injection is unavailable on this path.
- The protocol is internal and can change with app updates. Unexpected stream
  versions fail closed. Keep this opt-in until wider compatibility is tested.
- Idle is checked through the owner, but there is no atomic idle-and-submit
  operation. A concurrent desktop send can still race the request.
