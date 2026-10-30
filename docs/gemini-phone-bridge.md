# Gemini phone app bridge

Status: design prepared, app UI bridge not deployed. The existing Phone destination
opens a Gemini draft. Gemini speech is a separate integration through Google Cloud.

The requested next behavior is to show existing Gemini app conversations in Ally
and submit a dictated request after the user chooses Phone. This must retain the
phone app's Google session and actual conversations; an independent Gemini API
chat would not meet that requirement.

## Access and current blocker

After the initial zero-operation inspection, the user enabled Ally control and
the normal approved phone-control session successfully inspected Gemini's home,
sidebar, and an existing conversation. No prompts were submitted. The observed
Google package also hosts non-Gemini screens, so recognition requires Gemini UI
controls in addition to the package name.

The restarted Ally server advertises the phone-control tools, and normal app
registration reports Codex and Claude connected. This resumed Codex chat still
does not expose those tools; restart Codex to load the registration before live
testing can continue. No control approval is pending. Do not change to ADB,
another control executor, or private Google endpoints to work around missing
tools.

`GeminiBridgePolicy.kt` now parses the observed role/editor controls, marks
500-character captures as potentially truncated, and requires a fresh revision,
matching draft, active grant, unlocked phone and enabled Send control. Its
submission receipt permits one attempted send and retains uncertain delivery
without retry. Six focused unit tests pass. These policy helpers are not yet
wired into an installed automatic-send or chat-sync feature. Generic phone
inspection truncates long nodes, so complete chat export still needs a dedicated
approved path or explicit partial-snapshot presentation.

Google's documented chat-data export is Takeout, not a live app-history API.
App-specific UI behavior must therefore be observed and tested before a bridge
can be represented as working. Do not invent stable conversation identifiers,
claim all chats are synchronized, or substitute API chats for app chats.

## Submission contract

1. The user chooses Phone/Gemini with a finalized transcript. Acquire access using
   the existing native approval mechanism; enabling Accessibility alone does not
   authorize general remote control. Keep a visible Stop control and bounded
   lifetime for any bridge session.
2. Open the existing text-sharing intent, which was tested to populate Gemini's
   editor without sending. Restrict inspection and actions to the observed Gemini
   window; the Google app package alone is not sufficient identity proof.
3. Observe a fresh UI revision. Require an unambiguous Gemini prompt editor whose
   text matches the intended transcript and an enabled, observed Send action.
   A missing control or mismatched text leaves the draft for manual review.
4. Persist a local submission identity and mark the one allowed Send attempt
   before tapping. Perform the action once. A timeout means uncertain delivery,
   not permission to tap again.
5. Confirm the request in Gemini's conversation UI. Attach the observed response
   to that request only. Reinspect uncertain delivery without resending; let the
   user resolve an ambiguity.

## Conversations inside Ally

- Use the Gemini app's observed conversation navigation and stable identity if it
  exposes one. Otherwise represent the result as a captured conversation snapshot,
  not a permanently linked resumable chat. Titles alone are not identities.
- Scope locally stored data to the phone and observed Google account; never merge
  conversations from different accounts based on a title. Do not extract cookies,
  credentials, app databases, or authentication tokens.
- Mark snapshots with their last successful sync time and completeness. An
  off-screen section or a disconnected phone must never look like an empty chat.
- Display a Gemini section alongside Ally's existing PC conversations. Continue a
  chat only after the correct existing Gemini conversation is freshly observed.
  Keep Codex/Claude routing, access levels and send receipts unchanged.
- Sync only on explicit user interaction or within a visible, approved bridge
  session. Do not publish public Gemini share links to retrieve private chats.

## Acceptance checks before deployment

- Capture versioned fixtures from the real Gemini UI through approved control.
  Cover new chat, existing chat, long replies, account switch, app update,
  keyboard, locked phone, disconnected phone and a missing Send control.
- A stale revision, a foreign app, mismatched editor text, or an expired grant
  stops the operation with the user's words retained.
- Confirm one submission and zero replays across a timeout or reconnection.
- Verify response association and correct pagination/completeness indicators for
  history. A failed sync keeps the last good snapshot.
- Run a harmless synthetic prompt through an approved session, report its actual
  observed result, and only then offer automatic sending as available.
