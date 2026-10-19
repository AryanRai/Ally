# Ally documentation

Setup guides, feature references, and engineering notes for the desktop, Android phone, and Wear OS companions.

[← Project overview](../README.md) · [Getting started](getting-started.md) · [Android companions](../wear-app/README.md) · [Local speech](../speech-service/README.md)

## Start here

| Guide | What it covers |
| --- | --- |
| [Getting started](getting-started.md) | Desktop development, agent configuration, voice, pairing, and common setup problems |
| [Phone and watch](../wear-app/README.md) | Android requirements, builds, connection modes, safe updates, and device behavior |
| [Local speech worker](../speech-service/README.md) | Python setup, model caches, local authentication, and the transcription contract |
| [Vercel deployment diagnosis](vercel-retired-deployments.md) | Why the retired web service still produces build failures and the proposed cleanup |

## Conversations and control

| Topic | Reference |
| --- | --- |
| Native Codex ownership and routing | [Chat ownership](codex-chat-ownership.md) · [Hybrid routing](phone-voice-and-hybrid-routing.md) |
| Stop, interruption, and continuation | [Stop and resume](stop-and-resume.md) |
| Follow-ups during active work | [Shared message queue](message-queue.md) · [Voice and steering](voice-feedback-steering.md) |
| Real questions and approval requests | [Chat interactions](chat-interactions.md) · [Shared input timeline](question-timeline-and-shared-input.md) |
| Sharing, images, and attachments | [Device sharing and attachments](device-sharing-and-attachments.md) |
| Chat ordering, unread state, and activity | [Stable ordering](stable-chat-order.md) · [Unread state](unread-chats.md) · [Running chats](running-chats.md) |
| Chat opening and Android assistant binding | [Selection and binding](chat-open-and-assistant-binding.md) |

## Visual explanations and desktop experience

| Topic | Reference |
| --- | --- |
| Circle selection and the drawing board | [Pill and canvas workflow](pill-canvas-workflow.md) · [Visual tutor](visual-tutor.md) |
| Interactive diagrams and compact images | [Drawing surfaces and artifacts](drawing-artifacts-and-phone-approvals.md) |
| Math and forwarding receipts | [Circle, delivery, and math](circle-delivery-math-results.md) |
| Manual window size and file links | [Manual sizing and citations](manual-size-and-file-citations.md) |
| The bounded compact reply reader | [Reader and context controls](compact-reader-and-context.md) · [Compact message rendering](collapsed-message-readability.md) |
| Resize responsiveness | [Resize and Meeting controls](resize-and-meeting-menu.md) |
| Current open-chat restoration and profiling | [Debugger performance results](debugger-performance-results.md) |
| Earlier reply-rendering measurements | [UI performance results](ui-performance-results.md) |

## Phone, watch, and voice

| Topic | Reference |
| --- | --- |
| Device connections, alerts, and consent | [Companion integration](device-companions.md) · [Device live replies](device-live-replies.md) |
| Android assistant activation | [Activation and routing](assistant-activation-routing.md) · [Assistant binding](chat-open-and-assistant-binding.md) |
| Phone voice cuts off during a pause | [Phone assistant listening](phone-assistant-listening.md) |
| Agent monitor and unread activity | [Assistant monitor](assistant-agent-monitor.md) |
| Home-screen widgets and system tiles | [Widgets and tiles](android-widgets-and-tiles.md) |
| Watch chat navigation and rich replies | [Watch quick switcher](watch-quick-chats-and-rich-replies.md) |
| Speech playback and notifications | [Voice and reply alerts](voice-and-notifications.md) · [Watch read-aloud controls](watch-read-aloud.md) |
| Phone device actions and confirmations | [Phone controls](phone-control.md) |
| Local speech model-cache recovery | [Speech cache repair](phone-speech-cache-repair.md) |
| Phone screen context and internal-session filtering | [Screen-context results](guardian-screen-context-results.md) |

## Architecture and maintenance

- [Cross-chat routing](cross-chat-routing.md): authenticated discovery, reading, and explicitly requested forwarding through the agents’ tools.
- [Realtime perception](realtime-agent.md): capture sessions, relevance classification, policy gating, and contextual cards.
- [Desktop and Android integration](main-integration-20261018.md): a dated integration and validation snapshot.
- [Collaboration scratchpad](agent-collaboration.md): file ownership, active deployment slots, and handoffs. Read it before changing shared code or restarting a live instance.

## Reading the engineering reports

Many feature pages record a particular implementation, candidate build, test run, or device check. Their timestamps, process IDs, test counts, and deployment notes describe that moment; they are not live status indicators.

Use the entry-point guides above for current setup. For a specific deployment, inspect that candidate’s `deployment.json` and current process/port ownership. Preserve historical reports rather than rewriting their past results as though they happened today.

No example, screenshot, build report, or Markdown action substitutes for a real approval request or an observed device result.
