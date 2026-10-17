# Running chats across Ally

Desktop, Android phone and Wear OS show **Running** directly above **Most recent** in the chat library. The list spans both engines independently of the provider filter. Each row shows its chat title, engine and working folder and opens the existing conversation. Linked Ally/device identities are reused; reading the list never resumes, forks or sends to an agent.

## Coverage and lifecycle

- Codex desktop/CLI chats with local rollout files under `~/.codex/sessions`, including continuation files deduplicated by original chat ID.
- Main Claude Code chats under `~/.claude/projects`. Nested Claude subagent transcripts are not separately navigable in Ally yet.
- Ally-owned agent runs, including device requests before they receive a native session ID.
- Ordinary ChatGPT website chats, cloud-only chats and sessions on other computers are not available through these local integrations.

The authenticated `GET /v1/running` endpoint and desktop `agent:runningSessions` IPC share the same source. Local transcript activity uses turn lifecycle events, not just recent modification time. Codex scans backward for the latest lifecycle event so large tool outputs cannot hide a long-running turn's start. Claude follows its existing pending-turn parser. Unmanaged turns silent for ten minutes are omitted as potentially abandoned; owned Ally runs remain visible until done or stopped. Waiting for approval is still an active turn. Transcript previews are bounded; files are never decoded into message attachments for monitoring.

Refresh is every five seconds with a shared four-second read cache. Phone/watch polling runs only while the library is visible and its activity is started. A failed poll clears the old list and displays live status unavailable. Existing send/Stop/retry/approval behavior and pairing credentials are preserved.

## Verification

- TypeScript, all 225 desktop tests, Vite renderer and Electron builds passed.
- Android unit tests, both APK builds and phone lint passed (existing deprecation warnings).
- Tests cover terminal events, interruption, abandonment, partial JSON, large turns, continuation deduplication, sessions beyond recent pagination, provider identity collisions and existing device/desktop links.
- Desktop component visually checked with two engine fixtures. Live reader detected this Codex chat and the active Claude chat in about 38 ms on this computer.
- Pixel 7 installed and visually verified against the live authenticated cloud endpoint; both engines appeared above Most recent.
- Isolated desktop deployment preserves the concurrent latest-Claude-folder fix without committing its owned source changes. Speech and cloud status verified ready after restart.
- Watch5 APK installed and Running visually verified with both devices connected after the desktop restart.
- The unrelated Vercel preview check remains failed because its configured service root is missing; this is not a web deployment.
