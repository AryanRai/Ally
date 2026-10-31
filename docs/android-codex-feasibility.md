# Android Codex runtime feasibility — Pixel 7

Observed 2026-10-30T16:52:35.663359+00:00. Feasibility only; no model/thread/turn or prompt was submitted.

## Conclusion

Current status31Oct: the installed phone runtime is signed in with its own account and live reply/streaming, queue, duplicate receipts, steering, Stop/cleanup and a paired desktop chat-list tool call are verified. Phone-local Codex MCP elicitations now use Ally native review; no approval is auto-answered. Final APK SHA256 129704DB8D02B39A8F2EE03A20CB338C452B1FEADE84A15E7CB615D8AA9CC61D independently matches the Pixel install.243phone tests and lint pass. Physical phone-control actions and reviewed forwards are not yet live-tested; phone-local attachments remain unavailable. Historical zero-prompt probe conclusions below describe that earlier stage.

Updated after the authorized debug app-process probe below: the verified Codex0.166.0 ARM64 musl binary runs from Ally's normal `untrusted_app_34` process via ProcessBuilder/nativeLibraryDir. initialize, account/read and config/read succeed. Device-code issuance succeeds through the loopback CONNECT proxy **plus a temporary PEM of Android's existing public CA certificates**, with TLS verification enabled. Login was immediately cancelled; account remains null. No model prompts/tools were submitted. This proves debug control-plane/auth-transport feasibility, not a production phone agent, completed authentication, model/tool execution or background lifecycle readiness. Historical shell/run-as results follow unchanged.

## Artifact and device

- Official release: [rust-v0.166.0](https://github.com/openai/codex/releases/tag/rust-v0.166.0). Binary reports `codex-cli 0.166.0`.
- Asset: `codex-aarch64-unknown-linux-musl.tar.gz`; source: https://github.com/openai/codex/releases/download/rust-v0.166.0/codex-aarch64-unknown-linux-musl.tar.gz.
- Archive SHA-256: `94eb707605ec2646b2e05b7edf7c4e7b3ccf02b16237c34ae9beb8cfb7f810a9`; matches the digest published by the official GitHub release API. Sigstore assets exist, but independent Sigstore verification was not performed.
- Extracted executable SHA-256: `f2e6c980c937e734644bed1b4a9a018d3e63a0ccbe71aafc85c86a8c6e4b462a`; independently matched on the phone in both probe locations. ELF machine 183 (AArch64), no PT_INTERP segment, 277,549,176 bytes.
- Pixel 7, arm64-v8a, Android 17 / API 37. SELinux remained Enforcing. Wireless debugging used the existing authorized connection; no pairing or settings change.
- Shell UID 2000, SELinux shell. run-as UID 10588 (dev.ally.phone), SELinux runas_app. The ordinary running Ally process was observed in untrusted_app_34; this differs from runas_app.

## Requested probes

| Context | --version | initialize since spawn, including ADB | account/read | config/read | Initial RSS |
| --- | --- | --- | --- | --- | --- |
| shell | PASS | 641 ms | account=null; requiresOpenaiAuth=true | PASS, empty MCP/config origins | 65,208 KiB (63.7 MiB) |
| app_uid_run_as | PASS | 1281 ms | account=null; requiresOpenaiAuth=true | PASS, empty MCP/config origins | 67,872 KiB (66.3 MiB) |

- Subsequent fresh-process measurements: shell initialize 390 ms, run-as initialize 515 ms; RSS 73,140 / 88,800 KiB respectively. These are two observations, not a performance benchmark. --version wall times were 62–78 ms shell and 141 ms run-as, including ADB.
- Both app-server contexts answered newline-delimited initialize, initialized notification, account/read(refreshToken:false), config/read(includeLayers:false). No thread/start or turn/start was sent. All four app-server probe processes exited with code 0 after stdin closed.
- Each process used env -i and fresh HOME/CODEX_HOME/TMPDIR inside its owned probe directory; no PC profile, sign-in, auth.json, API key or token was copied.

## Exact failures and limitations

1. App UID executing the shell-folder binary: exit 126, `sh: /data/local/tmp/ally-codex-probe/codex: can't execute: Permission denied`. The same unmodified binary copied into the separately authorized app-private probe folder then ran as run-as. No permissions/SELinux policy was disabled.
2. Both identities emitted: `Codex could not find bubblewrap on PATH. Install bubblewrap with your OS package manager. See the sandbox prerequisites: https://developers.openai.com/codex/concepts/sandboxing#prerequisites. Codex will use the bundled bubblewrap in the meantime.` Nothing was installed and no sandboxed tool was invoked.
3. Optional account/login/start(type:chatgptDeviceCode) under run-as failed after 5032 ms with JSON-RPC -32603: `failed to request device code: error sending request for url (https://auth.openai.com/api/accounts/deviceauth/usercode)`. No code/login ID was returned; subsequent account/read still returned account=null. No sign-in completed. The error did not expose its nested DNS/TLS cause, so DNS success/failure remains unestablished.
4. No seccomp or landlock failure appeared in the exercised control-plane calls. /proc status reported Seccomp:0 / NoNewPrivs:0 for these probe processes. This is not evidence that a normal app-launched process has equivalent confinement or that shell/MCP tools can run under Codex sandboxing.
5. Not tested: a normal ProcessBuilder/app-child launch, signing in, model inference, local phone MCP server, desktop Ally chats MCP reachability, background lifecycle/battery handling, or protected-action handling from a phone-resident agent. No current phone execution feature is enabled.

## Cleanup and evidence

- Both phone directories were removed after each pass: /data/local/tmp/ally-codex-probe and /data/user/0/dev.ally.phone/files/ally-codex-probe. Independent final tests printed SHELL_PROBE_ABSENT and APP_PROBE_ABSENT. Cleanup attempted no unrelated process termination; probe PIDs were already absent after clean exit.
- No Ally app source, APK, settings, Android security setting, PC account preferences or active desktop runtime was changed/rebuilt/reinstalled/restarted.
- Large downloaded archive and executable were removed from the PC after validation. Small raw result JSON and harness scripts remain locally at .local/android-codex-probe for reproducibility.
- Protocol reference: [Official app-server documentation](https://learn.chatgpt.com/docs/app-server), using initialize, account/read and config/read only (plus the optional login-start attempt).


## Normal app-process debug probe — completed 31Oct2026, 04:27 Sydney

The APK was built with `JAVA_HOME=C:\Program Files\Java\jdk-23`, Android SDK under the user's LocalAppData, and:

```powershell
.\gradlew.bat -PcodexProbe=true :phone:testDebugUnitTest :phone:assembleDebug
```

Opt-in `prepareCodexProbe` downloads the official pinned archive, verifies archive and extracted executable SHA256 listed above, and copies it into generated debug `jniLibs/arm64-v8a/libcodex.so`. Generated files/archive remain under ignored phone/build; nothing large is committed. Native-library legacy packaging and the merged `extractNativeLibs=true` put it in nativeLibraryDir. The app checks the executable hash again before launching. Release tasks reject the probe opt-in; source/entry are under src/debug only. Normal builds do not fetch/bundle the binary.

The debug Activity is exported only in the debug manifest and requires the platform/shell DUMP permission; ordinary apps cannot invoke it. ADB launches that Activity; **the normal application process**, not run-as or shell, starts Codex. Run-as is used only afterward to retrieve the app-written diagnostic report. PID discovery uses Process.toString plus this app's task-child lists because Android lacks Java9 Process.pid. The initial probe stopped cleanly but measured no protocol calls because of that API mismatch; the fixed probe produced the results below.

Installed APK SHA256: `79F525FC7C90998BD93A4010AF3659BF8BF849A0F517F5BA251DF35488DC1CDF`, independently matched installed base.apk on physical Pixel7 `2C181FDH2000W3`. Install-r preserved app data/pairing and the existing assistant binding. 216phone unit tests passed with0failures/errors, including4 proxy tests for authentication-before-DNS, destination restrictions, private-address rejection and tunnel/socket closure. No desktop/watch change or restart.

App PID6152/UID10588; child PIDs6307,6366,6411 all reported the same SELinux domain `u:r:untrusted_app_34:s0:c76,c258,c512,c768`. Android SELinux remained enforcing; children report Seccomp2 and NoNewPrivs0. No Android security policy/setting was changed.

| Final pass | Initialize from spawn | Initial RSS / high water | account/read | config/read sandbox_mode | Device code |
| --- | --- | --- | --- | --- | --- |
| Direct |781ms|79,532KiB (77.7MiB)|account=null|danger-full-access|Failed, JSON-RPC-32603 request-send error (~5s)|
| Loopback proxy |1221ms|69,544KiB (67.9MiB)|account=null|danger-full-access|Failed despite successful Android DNS (~159ms)|
| Proxy + Android CA PEM |730ms|75,328KiB (73.6MiB)|account=null|danger-full-access|**Issued**, then cancelled successfully (~771ms)|

These are individual observations, not benchmarks. A preceding successful app-process control-plane run measured614/367ms and85,888/49,452KiB for direct/proxy, with the same login failures. All effective configs explicitly showed danger-full-access **inside the Android app sandbox**. This does not exercise Linux sandbox/tool execution; none were requested. The process environment is cleared and HOME/CODEX_HOME/TMPDIR point to fresh private probe folders. No PC account/config/auth.json, token or API key was copied.

### Network finding

The proxy binds only127.0.0.1 at a random port, requires per-invocation Basic authentication, accepts only CONNECT auth.openai.com:443, uses Android InetAddress DNS, rejects nonpublic results and limits connections/headers/timeouts. It tunnels TLS unchanged and reads no HTTP payload. Android DNS resolved172.64.146.15/104.18.41.241 in34ms (subsequently cached0ms). Therefore DNS resolution succeeds through the proxy; a DNS-only workaround was insufficient. Proxied login failed until SSL_CERT_FILE pointed to a temporary PEM exported from AndroidCAStore (120existing public trust anchors). Adding that file alone to the already-working proxied path made device-code issuance succeed. This establishes a Linux-client trust-store mismatch as an additional blocker. The direct request's nested error remains opaque, so this does not prove its original failure was exclusively DNS.

No TLS verification bypass, certificate installation, system trust modification or general-purpose network proxy was added. The temporary CA PEM is removed with the probe directory. The issued user code was immediately cancelled and is not usable for sign-in; account/read afterward confirmed account=null on all passes. No login completion or tokens were accepted.

### Cleanup / remaining scope

All three final Codex processes exited0. The proxy reports closed, active sockets were closed, and all per-invocation private homes/temporary CA files were removed. Independent ADB process listing afterward found **no libcodex.so process**, and app-private find found no codex-probe-* directory. Only the small results JSON remains in app files and generated debug APK/native build artifacts remain on PC/installed APK. Assistant binding still dev.ally.phone/dev.ally.device.AllyAssistantService. On-screen status/logcat show PROBE_COMPLETE. No model turns/prompts, shell tools, PC sign-in transfer or security changes occurred.

Evidence: `.local/codex-app-probe/result.json`, `result-direct-and-proxy.json`, `logcat.txt`, `validation.json`; build log `.local/codex-app-probe-build-resume.log`. Current production Run on phone remains unavailable: a signed-in production runtime, actual model/tool loop, phone MCP binding, streaming, battery/background handling and full lifecycle/security QA are outside this zero-prompt probe.

## Phone-local runtime implementation — 31 Oct 2026

The approved full runtime now exists in `wear-app/phone/src/main/java/dev/ally/phone/codex/`. This section supersedes the earlier statement that no phone backend is installed. The original zero-prompt probe evidence above remains historical.

Implemented:

- Codex 0.166.0 is bundled by default as extracted `arm64-v8a/libcodex.so`. Build task downloads the official archive and checks both pinned hashes above; neither binary nor generated cache is tracked. `-PphoneCodex=false` produces the smaller PC-only app. Probe/debug entry remains absent from release builds.
- Phone-owned persistent CODEX_HOME is private `files/phone-codex`. Environment is cleared. No PC configuration, sign-in, token or pairing credentials are copied. Settings → Phone Codex offers native device-code sign-in, cancel/Stop, sign-out and a new local chat. Browser authentication is completed by the user.
- Localhost CONNECT proxy uses random credentials, Android DNS, exact allowlisted OpenAI authorities on port443, public-address checks and bounded sockets. Android's existing CA anchors are exported to a private PEM for the Linux TLS client. TLS verification remains enabled. Model traffic is limited to auth.openai.com, auth0.openai.com, chatgpt.com, api.openai.com and ab.chatgpt.com; no arbitrary host/LAN proxy.
- Codex runs without Linux sandboxing inside Android's normal app sandbox. Shell, shell snapshot, private image reader, hooks, plugins, apps and multi-agent features are disabled. A pinned official model catalog removes apply_patch, shell and experimental tools and disables the Node REPL for every listed model. The runtime checks this catalog before spawning and verifies effective shell/view_image flags after initialize. Unsupported app-server server requests are rejected rather than approved.
- Native foreground service has an ongoing Stop notification, bounded partial wake lock and no sticky/background restart. Process/proxy/MCP lifetime is limited to sign-in or active phone work. Cancel/Stop kills the child, cancels pending native review and releases control. Every completed request ends its control grant before queued work starts.
- Private localhost MCP endpoint offers phone_control and, while the paired desktop is connected, desktop_chats. The endpoint uses an unguessable path, rejects browser Origin and nonlocal peers, bounds request sizes, and exposes no generic RPC or shell executor.
- Phone control requires an actual native user review. The phone rechecks lock state, grant expiry/identity, fresh tree/revision, coordinates and protected controls before input. System/security/password/payment surfaces and Send/Pay/Approve/Delete-style controls remain manual. Ally's own approvals/questions cannot be answered by the agent, including arbitrarily labelled options. Native halo, touch marker and Stop reuse the existing control implementation. A denial is retained for that request.
- Paired PC tools list/read Codex or Claude chats and submit a reviewed handoff through the existing authenticated HTTPS bridge, without exposing its token to Codex. Desktop access is read-only by default. Failed/uncertain handoffs are not automatically replayed. No desktop MCP port is opened on the LAN and no desktop restart is required.
- Phone-created chats use the existing phone conversation/composer/history, access control, Queue/Steer and Stop. Phone histories and deduplication receipts persist atomically on the phone. Restarted interrupted turns become explicit errors and are never auto-resubmitted. Uncertain steering is not replayed. Public commentary/tools/final text use the native progress UI and speech path; reasoning and raw tool payloads are excluded.
- Explicit phone-only assistant requests can route to the phone after verified sign-in; this is configurable. PC/mixed/ambiguous requests retain the destination choice. Existing PC and Gemini routes remain available. Mixed phone work can request a reviewed desktop handoff mid-task.

### Verification so far

The production runtime (rather than the original probe config) initialized on the Pixel7 in764ms, reported account=null, verified effective shell_tool=false and view_image=false, listed9 models, and successfully started a model-free ephemeral thread with a required local MCP server. Codex called tools/list. Child and proxy then closed; independent process listing found no libcodex.so process. No model prompt or completed login was involved. Evidence: `.local/phone-codex-runtime/runtime-check.json`.

On-device testing caught and fixed Android JSON slash escaping incompatible with TOML and the pinned binary's rejection of the retired approval_policy="untrusted" value. The runtime uses the supported on-request policy with shell/file tools disabled and native phone grants enforced independently. Lint caught and fixed an API33-only InputStream helper so minSdk30 remains supported.

### Boundaries / pending acceptance

A completed phone sign-in, actual streamed model reply, model-driven control approval/action/Stop, Queue/Steer and desktop handoff still require end-to-end acceptance after authentication. Implementation is not evidence these have run. File/image input to phone-local chats is explicitly unavailable in this first runtime: attachments stay on the phone and the draft is retained, rather than silently uploading them to the PC. Existing PC attachment paths are unchanged. Desktop tool discovery is refreshed when the phone request starts; calls also reject a disconnected PC immediately. This is a focused list/read/reviewed-forward bridge, not every desktop/browser MCP capability. Long phone turns have a55minute bound; control grants also retain their existing60minute ceiling. Routing is conservative deterministic intent matching, not an additional LLM routing loop.

Pinned model catalog source: https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/models-manager/models.json (OpenAI Codex, Apache-2.0). App-server/config references: https://learn.chatgpt.com/docs/app-server and https://learn.chatgpt.com/docs/config-file/config-reference . Shell-tool construction and static-catalog behavior checked against the same pinned source under codex-rs/core/src/tools/spec_plan.rs and codex-rs/models-manager/src/manager.rs.

Final debug APK installed and independently matched on Pixel7: SHA256 46B695920CF9E2188DD261DB6F0026CFBF24C4311552E096A9C0440657FCA434. Final tests238, failures0, errors0; lint0errors; watch compilePASS. Installed production runtime initialized756ms, accountnull, shell/file-readerdisabled,9models, real phone_control MCP schema offered and tools/list requested by Codex; process/proxy closed with no remaining child. PC bridge was disconnected during this check, so desktop_chats was correctly absent. Actual sign-in screen is being opened for the user; authenticated model/tool acceptance remains pending. Evidence.local/phone-codex-runtime/validation.json and runtime-check.json. No desktop restart, PC account changes, Git operations, model prompt or control input performed.

### Use and acceptance checklist

Open Ally phone Settings → Phone Codex → Sign in to Codex on this phone. Complete the official browser flow personally. Once the phone shows Signed in on this phone, New phone chat opens the existing Ally chat UI. A new local chat starts read-only; change its access in the normal chat access selector if you want phone actions. Any control session still needs a separate native review. Stop is available in the app and ongoing notification. Phone Codex settings can disable automatic routing or sign out the phone account without touching PC accounts.

Acceptance still to perform with that signed-in account: one ordinary reply; public progress/full final readout; Stop during generation; request-scoped control review and protected Send/Approve refusal; queued next request with a fresh grant; steer with receipt and uncertain-delivery recovery; authenticated desktop list/read/reviewed-forward while PC is online and tool refusal while offline. The existing Android unit tests and model-free MCP initialization do not replace these live tests.

### Signed-in live acceptance — 31Oct05:22Sydney
User completed phone sign-in, independently verified via account/read through the production app process (ChatGPT account; no tokens read or copied). Same runtime offered both phone_control and desktop_chats with the paired bridge connected. Actual production-coordinator test returned ALLY_PHONE_REPLY_OK in6093ms with a streamed delta observed; duplicate submit retained the same receipt; queued ALLY_PHONE_QUEUE_OK completed in order and four history messages were retained. A third active request stopped with explicit Stopped and no remaining Codex process. Separate steering during streaming returned steered, retained duplicate-receipt identity and finished with ALLY_PHONE_STEER_OK. No phone control input or desktop message was sent.
The first model-driven desktop lookup exposed a real integration issue: the pinned catalog forced tool_mode=code_mode_only while codeMode was deliberately disabled on phone. Shell/file safety stayed intact, but the model could not call MCP tools. Fixed all catalog entries to supported direct tool mode and added a catalog regression check alongside existing shell/apply_patch/Node/image-reader restrictions.239phone tests and lint pass after that fix; direct-MCP live acceptance is running. Proof: .local/phone-codex-runtime/acceptance.json and advanced-before-direct-fix.json.

### Tool discovery and native approval fixes — live result

The desktop tool now succeeds end-to-end from a phone Codex model turn: desktop_chats/action=list/provider=codex returned30chats; public progress and a completed tool step preceded the final “Succeeded.30chats returned.” No individual desktop chat was read and no message was forwarded. The native tool/proxy/service then closed; independent ps/dumpsys confirmed no Codex child or CodexPhoneService left running. Proof: `.local/phone-codex-runtime/desktop-lookup-pass.json`.

Two separate integration issues were diagnosed and fixed. The small phone MCP catalog now uses direct model tool mode **and** supports_search_tool=false/code_mode_tool_search=false, so its tools are advertised directly rather than deferred to a Code Mode search tool that is intentionally absent on Android. The pinned core mcp_tool_exposure.rs confirms that this flag selects Direct versus Deferred MCP exposure. All command/private-file/Node restrictions stay enabled.

Once the real MCP call was exposed, Codex requested mcpServer/elicitation/request for tool consent. The original phone client rejected every server request. It now relays only bounded form elicitations from the owned ally_phone server into the real native review activity and notification. The user must explicitly answer; default form values are never submitted, shell/permission requests remain rejected, unsupported URL/nested forms cancel, and Stop cancels pending reviews. Native form regression tests cover missing/default answers, explicit enum choices, unsupported fields and typed bounds. Latest unit result243tests/0failures/0errors; lint0errors. The final read-only desktop lookup passed with this handler installed.

Phone account and histories survived updates. The phone has been returned to the normal Phone Codex account screen, ready for New phone chat. Desktop runtime/account preferences, watch APK, security settings and Git state were not changed. Remaining acceptance is physical phone input under a real user grant and an explicitly authorized reviewed forward; no test forward was sent. Local file/image input is still explicitly unavailable and kept on the phone.
