# UI performance: unchanged reply rendering

2026-10-18. Production source change: `glass-pip-chat/src/components/chat/WatchReplyContent.tsx` only. Wrap the existing component in React's default `memo`; compare all three primitive props (content, streaming, compact). No custom comparator, global cache, throttling, delayed updates, stylesheet, markup, animation or dependency changes. No internal code was removed without evidence of disuse.

## Evidence and repeatable profile

Unchanged replies previously re-ran envelope parsing, text normalization and reconciliation on every parent render. Expanded Markdown already had an inner memo boundary, but reply presentation/cards still repeated work. Compact Markdown had no such boundary. The new boundary prevents this work when all inputs match; updated content and streaming/mode transitions still render immediately. Descendant state/context updates remain independent.

Run from `glass-pip-chat` in PowerShell:

```powershell
$env:ALLY_REPLY_PROFILE='1'
npx vitest run src/components/chat/ReplyRendering.performance.test.tsx
Remove-Item Env:ALLY_REPLY_PROFILE
```

The opt-in harness uses the real reply and Markdown trees under React Profiler/jsdom, 40 saved synthetic replies (headings, links, lists, table, inline code) and 24 incremental updates to a separate streaming reply. It compares the original function (`memo.type`) with the memo export in the same process. Two completed A/B runs gave:

| Metric, across 24 updates | Expanded before | Expanded after | Compact before | Compact after |
| --- | ---: | ---: | ---: | ---: |
| React render CPU duration, ms | 208.7–212.8 | 88.7–108.1 | 4,366.9–5,368.2 | 45.9–54.1 |
| Median render duration, ms | 8.96–8.99 | 3.73–4.16 | 192.8–226.6 | 1.80–2.12 |
| p95 render duration, ms | 11.55–11.79 | 5.91–7.33 | 225.0–282.1 | 3.52–4.72 |
| Update-loop wall time, ms | 259.5–268.5 | 121.9–154.1 | 4,684.8–5,720.2 | 86.8–98.9 |
| Test-process CPU, ms | 391–421 | 219 | 6,250–7,016 | 94 |

The compact case is a stress test of repeated compact reply fragments; it is not a claim that the collapsed UI displays 40 chat messages. Actual savings scale with unchanged content and parent updates. CPU counters include the test process, GC and helper threads. These are development/test rendering measurements, not production Electron paint/frame-rate or network/model latency measurements.

The harness records end-of-case heap usage, but GC is uncontrolled and cases share a process: expanded before/after was 91.7/95.3 MB then 91.7/109.6 MB; compact before/after was 192.9/190.1 MB then 149.1/161.7 MB. This does not demonstrate a memory improvement or regression. No retained-memory/leak claim is made. Only current component props are retained by React; no historical content cache was added.

Logs: `Exo/.ally-ui-performance-20261018/profile.log` and `profile-repeat.log`. Initial separate pre-change profile also confirmed repeated compact parsing. An intermediate stress profile exceeded Vitest's default five-second case timeout; the opt-in harness now allows 30 seconds. Both final four-case runs pass without timing assertions.

## Preservation and verification

- Five focused new regressions pass: exact DOM equality against the original function in both modes (all card types, full content/classes), unchanged inputs skip parsing, existing details retain identity/open state, content/mode/streaming changes propagate, and asynchronous image state settles under the memo boundary. Expanded Streamdown retains its existing link confirmation button; compact Markdown retains its anchor.
- Full desktop suite: **496 passed**, two opt-in profiling cases skipped at the time of the full run. The harness was subsequently expanded from two to four opt-in cases; all four pass in each final profile. No production changes followed the full suite.
- Isolated TypeScript, Vite and Electron builds pass. Vite still reports its existing large-chunk advisory; no splitting/loading behavior changes were attempted.
- Candidate `Exo/.ally-ui-performance-20261018/glass-pip-chat` has matching hashes for every workspace src/electron/scripts file. Shared dist and frozen assistant-monitor candidate/manifest remain untouched.

Exact DOM comparisons are automated markup verification, not screenshot/pixel or physical-device QA. Live CPU/frame latency, desktop screenshot/keyboard/gesture verification and Android profiling were not performed. Android was not changed, so Android builds/tests were not repeated. No real messages, voice capture or approval decisions were issued.

## Activation state

**Built and ready; not deployed.** Bridge 18765 and MCP 18767 remain owned by production PID18248 when checked after validation. No competing runtime was started and no live renderer was refreshed. Phone/watch installations, data, pairing, roles and microphone configuration are untouched. Watch installation remains deferred by the user's explicit instruction. Any later activation needs fresh runtime/idle checks and normal coordinated deployment; this candidate has no armed updater.

### Deployment completion (supersedes activation state above)

User explicitly requested deployment. Live runtime had changed to12548 from the older resume-validation build. After exact process/port,442 artifact hashes and active-work guards (only this requesting native chat, no bridge-managed turn or capture), it was stopped. The original deployment command was interrupted during shutdown; inspection confirmed both ports free, then all artifacts were reverified and the candidate launched once. PID12780 now owns18765/18767 and runs the tested performance candidate. Local/cloud connected, assistant routing/activity, fresh activity feed and MCP phone reconnection are verified. Existing local speech worker error persists from before this deployment; cloud voice capability remains enabled. No voice test or new screenshot QA is claimed. No Android installs, data/permission changes or watch update. Deployment state is complete; no updater remains armed. See candidate deployment.json and health.json.
