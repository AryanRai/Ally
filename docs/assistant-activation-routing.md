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
  then Try again.
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
