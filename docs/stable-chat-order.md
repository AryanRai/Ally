# Stable conversation order

Desktop, phone and watch history use newest-created-first order. Opening,
reading, renaming, sending a follow-up or receiving streamed output does not
promote an existing conversation. New chats and edit-created forks start at
the top. Running/activity surfaces still use live activity timestamps.

Native Codex lists request created_at ordering, including paginated reads,
and preserve thread creation time when opened in Ally. Claude and fallback
Codex summaries read the transcript creation timestamp; changing the file or
viewing it does not reset that timestamp. Existing saved imports are migrated
using original transcript timing. Unknown older notification-only rows remain
reachable, and loaded history takes precedence over incomplete attention rows.

Unread indicators remain visible without affecting history order. All working
and unread conversations stay reachable; the compact preview keeps its existing
scrolling layout. Existing pagination remains available for older history.

Validation covers browsing, completion, send, rename, reload, native paging,
read-only opening, and watch unread/activity changes. The combined update uses
the guarded idle installer; watch installation stays deferred at user request.
