# Stop and Resume

An Ally-controlled response shows **Stop**. Once the response has stopped, that control offers **Resume** on desktop (expanded composer, collapsed pill, selected sidebar row), phone, and both watch chat views.

Resume sends a continuation turn to the original provider, session and working folder. It uses the selected permission mode and existing provider approval checks. It does not resend the original request or its attachments, create a replacement chat, or approve any tool request. Completed work remains in the conversation; the continuation prompt asks the agent to pick up where it stopped.

Stop receipts are stored by canonical provider/session on the desktop bridge and survive a desktop restart. Devices discover the same receipt when refreshing chat history. Stopping desktop work from a device, or device work from desktop, uses the same managed run. Work owned solely by another application keeps the existing “Stop there” behavior.

Resume receipts are checked after acquiring the session's queue consumer. A stale receipt cannot start another turn. Device retries reuse a request ID derived from that receipt; simultaneous taps either return the same accepted turn or are rejected. A normal new message clears Resume; later native user input also invalidates the old receipt. Stopped work keeps queued messages. Existing send/ownership/approval safeguards still apply.

The watch treats an explicit Stop as an interruption rather than a failed send to retry. This prevents its Retry path from replaying the original request. Composer drafts remain untouched by Resume.

Validation covers shared stop/continuation state, persistence, canonical identity, permissions, no attachment replay, duplicate/stale receipts, cross-device HTTP requests, renderer controls, and both Android builds/unit suites. No real model turn or tool approval is used for testing. Active deployment state is recorded in `agent-collaboration.md`.
