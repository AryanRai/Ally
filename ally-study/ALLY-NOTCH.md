> The canonical integration guide and current feature/parity inventory are [docs/unified-ally.md](../docs/unified-ally.md). The dated notes below describe earlier stages.

# Embedded Ally chat

The native Chat tab hosts a local WebView2 page inside the expanded notch (820 × 638 logical pixels). The renderer imports Ally’s real ChatSidebar, AgentReply, CompactUserMessage, PromptInput, fonts and styles from the existing Ally source. It does not open or replace Ally’s separate preview window. Floating-pill changes are deferred.

Select an existing Codex/Claude chat or create one with the engine selector. The selected row is highlighted, and the conversation stays selected when the notch collapses, its chat view is recreated, or the connector restarts. The updated desktop bridge is the shared selection authority; the private profile’s ally-selected-chat.json caches that selection. Existing native chats synchronize in both directions. New notch chats synchronize to the desktop once their first turn creates a real provider session. Drafts are separate for each chat and survive a WebView reload within the same browser session. The chosen permissions apply to both expanded-chat sends and native notch requests.

The expanded chat supports paginated chat discovery/history, queued follow-ups, status, owned-turn stop and genuine bridge approval prompts. Browsing uses Ally’s existing history reads. No background model requests, automatic forks or new provider loop were added. Unavailable original-app ownership routes return Ally’s error and keep the draft. Native notch requests continue the selected chat through the same bridge, including images already captured by the native app. Cancelling that native request stops only its own bridge turn.

## Voice and drawing behavior

Native listening and speech output keep the existing Ally Google configuration. Selected-chat native requests now include the captured images and environment context and request synchronized speech/drawing programs. Valid fenced drawing programs are passed to the native interpreter; ordinary prose is quoted into say() calls. The connector never executes generated code. With no chat selected yet, the prior standalone study drawing route remains available. The consolidated composer now accepts pasted/dropped/picked files through Ally transport; native capture remains available.

## Connection and security

Ally’s local bridge must be running, with its enabled configuration at %APPDATA%/glass-pip-chat/watch-bridge.json. The private connector proxies only explicit chat/history/turn/approval routes. The bridge credential stays server-side, and the bridge’s browser-Origin rejection is preserved. The WebView receives a separate per-run capability via its initial URL fragment; the fragment is removed from the address afterward. No credentials are embedded in built assets.

The new UI depends on the existing Ally source/dependencies at ../glass-pip-chat. build-ally-notch.mjs bundles those components into a fresh versioned notch-builds directory. A running connector retains its prior asset directory, so rebuilding does not remove its files. notch-build.json participates in connector source-revision checking so a future normal startup can distinguish an obsolete backend.

## Staging and verification

Changes are staged, not active in any already-running client or connector. apply-ally-notch.ps1 produces a staged native assembly in the client directory by default. It includes the cursor-monitor correction. Installation refuses while the private native client is running. Existing startup/preparation scripts integrate the staged components for their next use; neither script was executed during this work.

Offline checks: 22 isolated image/history/selection/proxy tests pass; embedded renderer TypeScript and production build pass. Native metadata checks confirm all ten changed existing methods are within the reviewed chat/layout scope, branch targets are valid, resources and assembly identity are unchanged, and the monitor patch remains included. The installed application and live private DLL were not modified. No native launch/restart, real model send, microphone recording or speech-service request was performed during this integration. The current desktop process predates the shared-selection bridge API. The new desktop candidate is the versioned desktop candidate recorded in ../.local/unified-build.json; its parent contains a desktop-only start-ally.ps1. Both desktop and connector updates need a normal subsequent start to take effect. WebView rendering, keyboard behavior, hover and multi-monitor movement remain unverified at runtime.

