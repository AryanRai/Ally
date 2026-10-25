# Provider usage in Ally Settings

The private native UI omits the notch Invite button, Settings Invite entry and Upgrade offer. The former plan card embeds a local provider usage page. Account actions and sign-in remain available; usage is also visible when signed out of the native account.

Codex account allowances use the documented read-only `account/rateLimits/read` RPC; account lifetime tokens use `account/usage/read` where supported. Missing methods, API-only authentication and unavailable fields show unavailable states. These figures do not describe Vercel/OpenRouter/API credits. Reference: [Codex app-server documentation](https://developers.openai.com/codex/app-server/).

Claude subscription allowance is unavailable through this integration. Both providers separately show usage reported by runs completed through Ally, recorded from activation onward. This is not a complete account history; no historical transcripts are scanned. Missing reported costs/tokens remain unavailable. Reported USD cost is not a subscription charge.

The aggregate ledger is `provider-usage.json` in Electron's user-data directory. Writes and reads are serialized. Completion reporting does not block responses. Opening Settings or pressing Refresh reads usage; account reads coalesce and cache for 30 seconds. There is no idle polling. The native capability authenticates the proxy; the desktop bridge token stays server-side and the bridge rejects browser Origins.

The native patch is `ally-study/apply-ally-settings.ps1`, applied after the surface patch by the existing build/start scripts. `ALLY_USAGE_URL` carries the connector URL and native capability. The patch stages by default and refuses installation while the private native client is running. Existing installed app files and loaded assemblies are preserved.

Validation on 26 October 2026: focused accounting/bridge/runner and connector tests, TypeScript and isolated Electron compilation passed. A separate hidden Chromium fixture checked populated/unavailable/error states, manual refresh, missing capability, absence of idle polling and horizontal overflow. Synthetic preview/results are under `.local/settings-validation/`. Native staging audited 15,977 methods, valid branch targets, unchanged assembly identity/resources, only five reviewed UI method changes and byte-idempotent reapplication.

Activation: source and `.settings-ready` are staged. The running native45944 and desktop40676 were not restarted or reloaded. A fresh integrated build is required before the next normal launch; the concurrent performance chat has been notified to include this source. Actual WinUI host interaction and real account quota responses remain unverified; no model or microphone request was made.
