# Power-button voice and conversation choices

The shared Android assistant window on phone and Wear OS starts one foreground
listening session when Android invokes it, after unlock and with microphone
permission already granted. It no longer depends on Android forwarding the
original power-button press or release. Paused voice stays paused.

An activation with no detected speech stops quietly after five seconds without
transcribing, creating a chat or sending a message. Speech followed by a
1.5-second pause ends the recording; the maximum is 60 seconds. Dismissing or
expanding the assistant cancels capture. These thresholds use microphone energy
and need an on-device check in noisy environments. Later orb holds still record
until release. A new hardware activation starts another automatic session unless
an unfinished request needs a decision or retry first.

The initial request is transcribed separately from the selected conversation.
`POST /v1/assistant/route` checks the latest 30 chats per engine, including saved
device chats. Matching uses titles, project folders and recent user messages
already held by the bridge; it does not open a writer or submit an agent turn.
The configured Vertex relevance project/model performs semantic classification.
It cannot run tools, choose permissions or resume a conversation.

- Clearly independent topics create a new chat using the selected engine.
- Relevant previous conversations appear as up to three choices, with their
  engine labels and a New chat option. An existing conversation only receives
  the words after the user chooses it.
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
