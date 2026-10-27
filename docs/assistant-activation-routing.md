# Power-button voice and conversation choices

The shared Android assistant window on phone and Wear OS starts one foreground
listening session when Android invokes it, after unlock and with microphone
permission already granted. It no longer depends on Android forwarding the
original power-button press or release. Paused voice stays paused.

On phone, an activation allows eight seconds to begin speaking. After speech
starts, it waits for four seconds below the sustained-speech threshold before
finishing, so a normal thinking pause does not split the request. Quieter speech
can establish an utterance, and a lower continuation threshold retains softer
sentence endings. Separate short clicks do not accumulate into speech.

Wear OS retains its existing five-second initial wait and 1.5-second endpoint.
The recording maximum remains 60 seconds on both surfaces. A silent activation
ends without transcribing, creating a chat, or sending a message. Dismissing or
expanding the assistant cancels capture; later orb holds still record until
release. A new hardware activation starts another automatic session unless an
unfinished request needs a decision or retry first. These are energy thresholds,
not semantic sentence detection; microphone placement, Bluetooth routing, and
noisy environments still need a physical check. See [phone listening](phone-assistant-listening.md).

The initial request is transcribed separately from the selected conversation.
`POST /v1/assistant/route` checks the latest 30 chats per engine, including saved
device chats. Matching uses titles, project folders and recent user messages
already held by the bridge; it does not open a writer or submit an agent turn.
The configured Vertex relevance project/model performs semantic classification.
It cannot run tools, choose permissions or resume a conversation.

- After the words are transcribed, the assistant shows a compact confirm-before-send
  picker (same workflow as the share sheet). The suggested destination is
  pre-selected: the top routed chat, or "New <engine> chat" for a clearly
  independent topic. Below it are the other routed matches and the most recent
  Codex/Claude chats from `GET /v1/chats` (at most five chats plus New chat),
  then More chats, Search chats and Try again.
- More chats shows five more rows. After the loaded chats run out, it fetches the
  next `/v1/chats` page for each engine. Search chats opens a small field: typing
  filters the loaded chats at once and adds results from the desktop's read-only
  `GET /v1/chat-search` after a short pause. If search is unavailable, only the
  local filter applies. Picking a search result only selects it.
- Tapping a row only changes the selection. Nothing is sent, and no chat is
  created, until the user taps the fixed "Send to …" button. The usual flow is
  hold → speak → Send; correcting the chat adds one tap.
- Re-recording (Try again or another power-button hold) keeps the earlier words
  and selection. If nothing new is heard, they come back to the picker.
- The recent-chat lookup is separate from routing and has a 2.5-second limit. A
  slow or failed lookup only shortens the list.
- If classification or part of chat listing is unavailable, the words remain
  pending and the assistant offers a conservative chat picker. It does not
  infer that an unavailable search means a new topic.
- Suggestions are bounded to recent scopes; this is not exhaustive semantic
  search over every historical transcript.

Private app preferences retain the transcript and original request ID while a
choice, send or retry is unfinished. No raw recording is persisted. A lost send
response is retried only explicitly, against the same chat and request ID. The
accepted turn receipt is adopted by the existing per-chat controller for polling;
no synthetic continuation or automatic fork is added. The selected chat's saved
permission applies; a new chat defaults to read only.

Validation: 24 focused desktop routing/HTTP/conversation tests, isolated
TypeScript and Electron build; both Android unit suites and debug APK builds.
Synthetic live classifier checks cover an independent holiday query and a
related assistant-button query without starting any agent conversation.

Activation artifacts and the idle deployment result are in
`Exo/.ally-assistant-routing-validation`. The updater waits for all native and
device replies to finish and for both exact paired devices to connect before
restarting the exact old Ally process and installing with `adb install -r`.
It retains pairing, data, native desktop agents and the existing Samsung
assistant-button selection. It does not invoke a microphone during deployment.

## Timeout recovery (27 October 2026)

Conversation matching is optional. Its request has a ten-second total budget, while recent-chat lookup starts in parallel with its own2.5-second budget. A timeout or connection failure opens an explicit manual picker using whatever recent chats completed; no failed match is interpreted as consent to create or send to a new chat. If no list arrives, More chats and Search remain available for explicit retry. Transcript/request identity remain in the existing private draft.

Assistant HTTP calls now use cancellable asynchronous OkHttp calls. Re-recording, dismissal and coroutine deadlines cancel the underlying call; abandoned responses cannot populate the new picker. Connection, read and whole-call time limits are finite, redirects and automatic network retries disabled. This change does not add automatic message retries or retry a model turn.

A timed-out send is described as missing desktop confirmation, not definite failure. Retry keeps the existing chosen destination, request ID, frozen text/media and accepted receipt. Record again is offered only for replaceable unsent requests. Desktop restart receipt reconciliation remains a separate known limitation.

Validation:131phone and42watch JVM tests PASS, including bounded routing/list delays, offline fallback, cancellation propagation, same-send timeout wording and real loopback HTTP cancellation. Both APKs assemble. Artifacts .local/assistant-timeout/ally-phone-timeout-fix.apk and ally-watch-timeout-fix.apk. Not installed at this checkpoint: phone mDNS endpoint<phone-ip>:<port> refused authorized adb connection; no security settings changed or private request replayed. No desktop restart required.
Recovery by dedicated handoff chat: frozen timeout APK SHA256 hashes verified exactly; DEX audit confirms structured context/original documents/swipe and phone persistent toggle/departure latch remain included. No newer shared Android source edits than the artifact build found. Ally on-device phone connection online but no ADB devices; fresh phone40247 standard connect failed, watch43949 actively refused10061. Real15min control approval requested in this originating chat; inspect returned protected app, zero operations, no alternate control/viewer path used. Control session ended early. Real device question pending for user-performed USB/native debugging or refreshed watch wireless setup; installation not retried without stable authorized transport. No pairing/security settings changed or agent/model/mic/message test.
Recovery checkpoint after user scanned the generated AOSP QR in native Android pairing UI: ordinary authenticated phone transport<phone-ip>:<port> connected, hardware2C181FDH2000W3/Pixel7 and existing Ally ID2c657c4c-bf98-4bf4-b0a0-cb11fb62d595 verified. Exact frozen phone timeout APK install-r Success; installed base.apk SHA256add237d7f37ee56a8c2426e4801e84e1d35f176dfd4e9534b5dd1e8e44694f84 independently verified, lastUpdateTime2026-10-27 13:26:13. Normal MainActivity launch; assistant selected+bound without repair/security writes. Current hold.enabled/capture true and user RSSI-48 retained. QR helper exited after one normal pair/connect, no lingering watcher. Watch endpoint43949 still actively refuses; no watch install attempted by recovery chat. Actual device question pending for current watch connection address/awake screen. No private microphone/model/message or capture tests.
Recovery COMPLETE: after user kept watch Wireless debugging screen awake, fresh mDNS45317 connected normally; RFAT8170M5N/SM-R915F verified. Installed watch base.apk SHA256a24c09f1191a3ff2d64f3c7e3541bf468b7e4ac6aa42c8b7f7e2900bbed71303 exactly matches frozen timeout APK, lastUpdateTime2026-10-27 13:08:31. Earlier failed/disconnected installation had in fact completed; no duplicate watch install performed. Phone exact frozen timeout APK installed and independently hashverified as above. Both existing assistants selected+bound without repair. Fresh ADB and Ally device_list show both devices connected. No desktop restart/private mic/model/message tests or permission/security setting automation. User performed native QR scan and watch setup; normal adb pairing completed, one-shot helper exited. Durable evidence .local/assistant-timeout/recovery-status.json and recovery-artifact-audit.json. Installation lane released.

## Floating phone keyboard (27 October 2026)

The power-button assistant window now fits visible keyboard, system-bar and display-cutout insets while keeping its floating bottom position. Under a reduced height, reply/history scroll areas shrink before destination lists so the composer and fixed actions retain space. Preferred heights return on keyboard dismissal; no text, focus or destination is recreated by the layout change. Round watch sizing is preserved.

Validation:135 phone and42 watch JVM tests pass, including four reduced-height/restoration cases; both APKs assemble. Source/build validated only: actual keyboard geometry remains to be tested on the phone. Frozen diagnostic artifact .local/assistant-ime/ally-phone-keyboard-fix.apk includes concurrent device-access source and must not be installed until that lane finishes validation. Existing implementation chat retains coordinated installation; no desktop restart or private microphone/model request performed.


## Long-running task watchdog (27 October 2026)

The phone screenshot error 'This request took too long. Please try again.' came from the desktop bridge's five-minute no-answer-text timer. That timer finished the turn and called stopAgentRun, which paused queued follow-ups even while shell work was still active. It was separate from the bounded HTTP routing timeout fixed above.

The bridge now treats a quiet interval as a display notice: Waiting for an agent update; the user can stop the task. It preserves the same turn, receipt and queue, never cancels or resubmits merely because no answer text arrived. All agent activity resets the notice timer; pending approvals remain waiting decisions. Real provider errors/completion and explicit Stop still settle the task. A permanently quiet task can therefore stay pending until its owner reports an outcome or the user stops it; silence is not presented as proven failure.

Validation:22 focused bridge/queue tests PASS, TypeScript PASS, Electron build PASS. New synthetic regression exercises a long quiet shell, actual watchdog callback, continued completion and explicit Stop. Source-ready only; desktop activation belongs to the coordinated native-device-access chat/manual activation lane. No live desktop restart by root.

