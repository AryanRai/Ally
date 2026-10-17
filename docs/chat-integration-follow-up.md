# Chat integration verification — 2026-10-17

Normal Codex turns now use the documented stdio app-server, identifying the client as Ally. Claude retains its existing backend. Text, reasoning, tool output, plans, diffs, images, model and permission configuration, robot MCP configuration, usage and cancellation flow through the shared agent event model. Greetings remain ephemeral.

The existing folder layout is retained beneath larger Claude and Codex headers. Rows show their provider, groups are labeled working folders, and the actual home directory appears as Home. A running chat shows an animated loader, current activity and Stop. The composer also has a labeled Stop control. Streaming output remains attached to the originating chat when selection changes; sending another turn remains blocked until the current turn ends. Early Stop requests are remembered while the IPC run ID is pending.

## History and identity

Browsing uses read-only app-server APIs, including paginated history. It never resumes a thread merely to read it. Existing exec sessions fork through supported APIs only on explicit continuation. An atomic migration journal preserves old/new links, deduplicates concurrent requests and refuses to repeat an ambiguous interrupted fork. Original conversations are preserved. No Codex database is edited.

Inherited first-party identity environment variables are removed from child processes. New production chats were verified with originator ally and an interactive source. Default app-server listing and the actual Codex desktop Recents sidebar both show them.

## Live checks

- The affected original two-turn conversation was recovered through a supported fork. Original and fork history items matched after reverting only the temporary verification turn. The original remains untouched, and the mapping survived restarting Ally.
- A new chat created with the production runner appeared in Codex Recents. A continuation sent from Codex appeared when the same chat was opened in Ally.
- Read-only Ally history works while Codex owns the writer. An Ally continuation correctly reports the ownership conflict.
- An ephemeral streaming turn interrupted on first text completed without error and did not appear in the default chat listing.
- Live UI checks confirmed both provider headers, working/writing loaders and Stop controls. Switching chats kept progress on the originating row; stopping from that row preserved selection. The watch bridge remained listening and the speech health endpoint reported ready.
- Cancellation waits for backend completion before allowing another turn. Interrupted history shows a Stopped marker and retains locally streamed partial output if Codex omits the assistant item. Final-build UI verification stopped a response at 628; the partial output and marker remained after automatic history refresh.
- The final renderer and Electron builds pass. TypeScript and all 77 desktop tests pass, including startup cancellation, interrupted-history retention and keeping sidebar progress on the running chat after selection changes.

## Known app-server limitations

Codex can keep a cached writer after navigating away from a chat or minimizing its window. Ally cannot resume that thread until Codex releases ownership. It reports the conflict instead of forcefully unlocking it. Codex was not restarted for verification.

A newly forked exec chat may not appear in the default interactive list until its first new turn is persisted. Ally saves the fork mapping before sending input so cancellation or restart cannot silently create a second fork.

Vite still reports its existing large-chunk warning. Physical microphone accuracy, acoustic interruption and the complete watch microphone-to-agent loop are outside these chat changes and remain separate live checks.

Reference: https://developers.openai.com/codex/app-server
