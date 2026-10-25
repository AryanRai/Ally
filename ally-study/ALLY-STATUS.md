> The canonical integration guide and current feature/parity inventory are [docs/unified-ally.md](../docs/unified-ally.md). The dated notes below describe earlier stages.

# Ally Study status

25 October 2026.

Ally is configured for Google Cloud speech under the user's existing project, with en-AU-Chirp3-HD-Aoede output. Its full desktop UI is not needed for the standalone connector. The user's Codex CLI configuration points to Vercel AI Gateway.

## Tests completed

- Model: a synthetic study question was submitted through the user's Codex app-server. The connector returned a completed native SSE stream with a 120-character drawing program including say() and circle().
- Speech: synthesized a synthetic sentence through the user's Google speech account and returned 120,960 bytes of 24 kHz PCM through Ally's realtime WebSocket adapter. Sent those bytes to the transcription WebSocket; the transcript was exactly “The diagram shows a circle and an arrow.”
- Neither test recorded the microphone or played audio. Real speech and model services were used, so their normal account usage applies.
- Native rendering and actual microphone interaction remain unverified at runtime.

## Remaining implementation limitations

The standalone study route uses Codex and the existing Ally Google speech configuration. Integrations, web/image search, autonomous delegated jobs, routines, compaction, and 3D drawing are not fully implemented. Embedded chat supports Codex and Claude through Ally's local bridge. The separate context panel can select read-only text snapshots of up to three Codex chats; it bounds the amount of imported history and does not automatically transfer every referenced artifact.



## Naming

The prototype is named Ally Study. Its panel, launcher filenames, executable filename (AllyStudy.exe), and Codex session titles use that name. Visible display text is branded Ally through a reviewed manifest. Internal assembly and protocol identifiers are preserved for compatibility. The renamed executable has not been launch-tested.


## Ally display branding

The private UI assembly now uses Ally in 131 reviewed display strings, including notch text, accessibility labels, settings, tray menus, onboarding, and taskbar captions. The standalone browser setup page is branded Ally. The connector panel uses Ally's existing blue chat icon. Assembly identity, type names, references, entry point, and embedded resource contents were verified unchanged; installed file hashes were checked. This is static verification only. Embedded artwork, original-service screens, and compatibility identifiers retain their original names. See ALLY-BRANDING.md for the full boundary and ally-brand-inventory.json for original string references.

## Existing sign-in imported

At the user's request, auth.bin and device-registration.json were copied from the installed application's existing local profile into this private profile. Both copies were verified without displaying credentials. This supersedes the earlier removal of those files. sync-ally-signin.ps1 can repeat the local copy, preserving existing private files in a backup if present. The connector's authorization requirement remains intact. No native client was launched, no server-side session validity was checked, and a currently running client may continue using its in-memory signed-out state until it reloads the profile. The receipt is ally-signin-sync.json.

## Embedded chat and persistent notch selection (25 October)
The staged native Chat view now embeds Ally's actual UI components. Selected Codex/Claude chats persist across collapse/reopen and connector restart; native notch requests continue that selection through Ally's existing local bridge. The standalone preview window is unchanged. This mode requires Ally's bridge to be running. Native requests carry screenshots and environment context into the selected chat and request native speech/drawing programs; ordinary prose remains safely quoted for speech. Monitor-follow and local conversation-history fixes are staged alongside it. TypeScript/build and 22 isolated tests pass; native metadata/resources are verified. No client/backend restart or native launch was performed. See ALLY-NOTCH.md and the verification JSON files for the current implementation and its runtime-validation limits.


## Shared selection and current desktop build

The 26 October source update adds desktop/notch shared selection, native screenshot delivery, drawing reply preservation, activity ordering and desktop Load more. The isolated desktop build is the versioned desktop candidate recorded in ../.local/unified-build.json. Existing running processes remain unchanged. See the Ally source guide docs/notch-chat-integration.md for validation and remaining feature limits.
