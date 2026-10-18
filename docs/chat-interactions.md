# Chat approvals and questions

Real pending approvals and questions appear inside their originating Ally conversation on the Android phone and Wear OS watch. A notification opens that exact chat, including when the app is already open. A pending-request banner also opens the conversation. Requests include the action details and expire rather than silently approving. Swiping a notification away does not answer the request.

Either paired device can answer. The first valid decision wins; both devices display the resolved status and remove its notification. Identical retries are harmless and contradictory retries fail. Requests are authenticated, bound to the live connection, and resynchronized after reconnect. Expired, cancelled and disconnected requests cannot execute. No selection is submitted automatically.

## Unread attention

Pending requests add independent attention to the exact provider/session key used by shared unread markers. Opening or reading the chat cannot clear this attention. Answering, declining, cancellation or expiry removes that request's attention, while preserving any unread reply. Multiple pending requests keep the dot until all are resolved. Normal durable exact-reply read receipts are unchanged. Request attention is in memory because requests are cancelled when the desktop restarts.

## Structured questions

The `chat_ask_user` MCP tool asks one to six questions with up to six text choices each, plus a free-text answer. It waits for an actual user response or cancellation (maximum ten minutes). Each question needs a unique ID. Supply `chatId: "codex:sessionId"` or `"claude:sessionId"` when caller context is absent; an explicit value must match known caller context. Credentials, OTP and secret forms require manual handoff.

```json
{
  "chatId": "codex:YOUR_SESSION_ID",
  "questions": [{
    "id": "connection",
    "question": "Which connection should Ally use?",
    "options": ["Wireless", "USB"]
  }]
}
```

Native Codex approval and requestUserInput events received by Ally's managed-turn bridge are mirrored into the same cards and notifications. The real native request remains the authority. Unsupported, secret or oversized forms retain their original native handoff. This does not intercept unrelated prompts displayed only by another desktop application's private UI. Existing agents must refresh the MCP tool list to discover `chat_ask_user`.

## Device actions

Approval is bound to the exact original target device and immutable plan, even when answered from the other device. Phone-control ADB actions still require a live authorized local USB or wireless transport. Native Android app/link/alarm/timer intents may require a final "Continue on this phone" tap when Android prevents background app launch; consent alone is never reported as execution. Existing quiet hours, mute, notification permissions and Keep connected preferences remain effective. Notifications require the paired devices' persistent authenticated connection; this does not add FCM or an offline push service.

## Validation

Desktop tests exercise real WebSocket phone/watch decision routing, no execution before consent, exact target identity, structured answer validation, native Codex question callbacks, independent unread attention, expiry, abort/disconnect and replay. Shared Android unit tests cover exact chat projection, aliases, expiry, connection changes and resolved-state blocking. Android unit/APK/lint and TypeScript are required before release. Physical approval taps are left to the owner; deterministic tests never approve a live request.

2026-10-18: full desktop suite369/369 passed, followed by20/20 focused tests for the final unread clearing fix and a clean TypeScript check. Android phone/watch unit tests, both APK builds and phone lint passed; both APKs installed with preferences and assistant roles retained. The Galaxy Watch install reset Samsung's hold action, so its exact pre-install `googlevoiceassistant/googlevoiceassistant` value was restored and verified. Both devices reconnected to the current bridge.

The isolated desktop build at `%LOCALAPPDATA%/Ally/builds/chat-interactions-20261018/glass-pip-chat` preserves the verified unread/tutor renderer byte for byte and overlays12 scoped backend sources. Electron build passes. One-time hidden deployment helper PID30608 waits for the reserved unread deployment to report complete, then checks idle replies/capture/device actions and the exact predecessor process before switching. Status is in `chat-interactions-20261018/deployment.json`. Until it reports `complete`, the new backend is staged rather than live. Existing runtime and previous build are retained for rollback; the helper verifies local/cloud/speech/unread, MCP tool registration and both devices after activation.

Activation completed as PID25448 after the user explicitly requested restart. Both devices and local/cloud/speech/unread/tool registration checks passed. A real question was answered on the phone ("Inside this chat"); both devices synchronized its resolved state and shared unread became false. A real phone notification approval was answered on the phone and returned confirmed native completion. Agents did not tap either response. Live QA found that native completion replaced the target's resolved inline card; the shared Android follow-up retains that history and routes the resulting notification to the same chat. Phone/watch unit tests, APK builds and phone lint passed again for this correction.
