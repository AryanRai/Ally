# Blank window while typing

On 20 October 2026, the live renderer had an empty React root while its process
was still alive. Its transcript cache occupied 52,422,392 characters and a bounded
storage probe returned `QuotaExceededError`. The composer wrote drafts to that
same localStorage quota inside a React state updater, allowing a failed save to
unmount the whole interface.

`useChatDrafts` now updates the composer independently of persistence. Local saves
are guarded, and per-chat drafts also persist in the `ally-composer` IndexedDB
database, which has a separate quota. Ordered writes retain intentional clears;
hydration cannot overwrite typing already started or drafts in another chat.
If both stores are unavailable, editing continues in memory and logs a warning.
The fix does not delete, shorten or migrate transcript history.

Verification includes quota failures, both stores unavailable, delayed hydration,
cross-chat callbacks, intentional clears, and a native Chromium test that fills
localStorage and verifies the draft and clear across reloads:

```powershell
npm run test:run -- src/hooks/useChatDrafts.test.tsx
npm run typecheck
# Clear ELECTRON_RUN_AS_NODE before running the native fixture.
.\node_modules\electron\dist\electron.exe scripts/check-draft-storage.mjs
```

The fixed renderer was loaded into the existing desktop process without restarting
agents or the open drawing surface. Local storage was backed up first; the full
transcript cache and existing local draft size were unchanged afterward. The
isolated renderer and next-launch desktop candidate are in
`../.ally-blank-20261020/`; its `deployment.json` records the active renderer and
next-launch location. The previous frozen build remains unchanged. The next
desktop launch should use this candidate or rebuild from the updated source.
