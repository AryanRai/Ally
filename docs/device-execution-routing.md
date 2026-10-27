# Device execution routing

Power-hold requests now ask where the agent should run before showing the existing chat picker. **Run on PC** selects the existing desktop route; it never sends. The final **Send to …** button remains the only submission. Users can return to the location choice before submission. Choosing a chat, viewing recommendations, retrying a lookup, or reviewing phone context cannot start an agent.

The optional `execution` field on `/v1/assistant/route` has schema `{ version: 1, suggested: "pc" | null, options: [{ location, label, available, reason }] }`. Location is independent of provider (`codex`/`claude`), chat identity and phone-control transport. The PC offer describes the available bridge route; it does not claim provider authentication, which remains checked by existing execution. Existing clients ignore the additive field. New clients can use an older bridge's existing PC route. Unknown metadata versions and malformed PC availability fail closed.

Phone execution is unavailable: no Android agent runtime exists in the current phone sources. Accessibility control and scrcpy mirroring do not run an agent on Android. Phone remains disabled even if remote metadata claims it is ready. Selecting it shows the reason and keeps the request available for explicit PC selection. `/v1/messages` rejects any supplied execution location other than `pc` before creating a chat or starting an agent; absent location retains compatibility with existing callers. New assistant sends specify `executionLocation: "pc"`.

The explicit PC choice is stored with the original private assistant draft. Request ID, frozen text/media, selected provider/chat and accepted receipt retain their existing retry behavior. Re-recording a changed request clears the location choice; hearing nothing restores the previous words and their choice. Older partially submitted drafts remain on their original PC route to avoid repeating or moving execution. Location cannot change after partial submission. No automatic fork, owner takeover, fallback provider, or additional model loop was added.

The phone-only **Review phone context on PC** action uses only the assistant snapshot already supplied by Android. It opens the local handoff review picker; it does not capture again or send. The existing assistant draft is cleared only after successful launch; launch failure keeps the words. This is local review, separate from agent execution selection and mirroring. The handoff vault is process-private and short lived; it is not a universal exactly-once guarantee across process death.

## Android runtime feasibility

Official [Codex CLI documentation](https://learn.chatgpt.com/docs/codex/cli) describes macOS/Linux/Windows installation; it does not establish Android compatibility. An ARM64 executable renamed `libcodex.so` is not a verified backend. [Authentication documentation](https://learn.chatgpt.com/docs/auth) describes runtime sign-in with ChatGPT or API credentials; desktop pairing is not Android runtime authentication. No credentials were copied or authentication attempted.

Before enabling phone execution, verify an Android-compatible distribution/ABI, independent supported authentication, private storage and sandbox behavior, Android lifecycle/background limits, interruption/stop, tool and approval parity, and exact request/receipt recovery. Continue using the existing agents rather than adding a provider or app-owned tool loop. No on-device backend is claimed implemented by this increment.

## Validation

Focused TypeScript tests cover route metadata, no recommendation when PC unavailable, unsupported-location rejection, and bridge rejection before agent start/chat creation. Phone JVM tests cover legacy bridge compatibility, unsupported schema and malformed readiness, and refusing fabricated phone capability. Existing routing, assistant picker and submission tests remain required. No real microphone, private capture, authentication or model turn is used for validation. Deployment and physical device flow require separate verification.

Validated 27 October 2026: 22 focused desktop checks pass; combined Android validation by the handoff lane passes 92 phone and 39 watch JVM tests plus both `compileDebugKotlin` tasks. No live deployment or physical power-hold flow was performed.
