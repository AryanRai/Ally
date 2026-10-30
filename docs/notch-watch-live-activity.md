# Notch and watch live chat activity

The native notch Chat tab and Home preview now consume the same public timeline/step payload as the phone. Public status updates remain between adjacent groups of commands, each command expands separately, and live reply text remains visible. Completion collapses the activity above the final answer with step/update counts and duration. One live activity row combines the current action and elapsed time. Private model reasoning is not part of this payload.

The shared DeviceActivityReply renderer supports timeline-less historical records, using legacy commentary and steps without duplicating referenced commands. Native Home retains selection freezing and copying. A completed live reply remains visible while persisted history catches up. Selected-chat boundaries remain enforced by the existing preview adapter.

The watch parses ordered timeline entries (bounded to 192), keeps all bounded steps (128, matching the server), retains metadata on completed replies/history, and uses the same chronological groups and final collapsed summary. Main activity detail and duplicate progress sections were combined. Reconnects preserve the last received content. Existing approvals, cards, attachments, speech, input and history navigation remain available.

Validation: 16 desktop/preview UI tests; TypeScript; 44 watch unit tests; watch debug APK built. Watch APK SHA256 DD09BDD877291C554CA08D314D1B5F606C72D1D8F001DE96CBCC950380D6B264. Watch is not installed: ADB discovery sees only Pixel7; saved watch endpoint 192.168.1.48:45519 timed out (10060). Enable wireless debugging on the watch and reconnect its current address before install -r (preserve pairing/data).

Phone-notch/plugin and control-edge-glow work was sent once to the other Ally Codex chat Fix Ally chat connection and rich mobile, 01a17732-eb42-7433-933c-ddabbf5f968e. Delivery accepted and that chat claimed implementation scopes in docs/agent-collaboration.md. It owns phone-only work and must not restart desktop.

Desktop activation is recorded in .local/notch-watch-activation.json. Do not claim queued builds are installed until that status completes.