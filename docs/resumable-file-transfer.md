# Large-file resumable transfer

Ally supports chunked, restart-safe uploads from an Android phone to the desktop bridge. Files up to 100 MB are split into 512 KB chunks, each verified with SHA-256, and re-assembled on the desktop into the standard attachment store. A transfer can be interrupted and resumed at any point; the desktop always tells the client exactly where to continue.

## HTTP endpoints

All endpoints live under the bridge's authenticated HTTP server (same origin as the watch companion, loopback or configured HTTPS tunnel). Every request requires:

```
Authorization: Bearer <bridge-token>
X-Ally-Device-Id: <device-uuid>
```

### Begin or resume — `POST /v1/transfers`

```json
{
  "transferId": "uuid-or-stable-id",
  "name": "photo.jpg",
  "mimeType": "image/jpeg",
  "size": 4194304,
  "sha256": "64-hex-char lowercase SHA-256 of the complete file"
}
```

Response: `{ "id", "acknowledged", "finalised" }`. If a transfer with the same `transferId`, `deviceId`, and `sha256` already exists, returns its current `acknowledged` offset so the client resumes from there. Calling `begin` is always safe to retry.

### Upload a chunk — `PUT /v1/transfers/{id}/chunk`

Additional headers:
```
X-Ally-Offset: <byte offset of this chunk>
X-Ally-SHA256: <SHA-256 of this chunk's bytes>
Content-Type: application/octet-stream
```

Body: raw chunk bytes (1 byte – 512 KB).

Response: `{ "id", "acknowledged", "finalised" }`. The `acknowledged` value is the new total bytes accepted. If the offset is less than the current `acknowledged`, the request is treated as a re-send and succeeds without re-writing data.

### Check status — `GET /v1/transfers/{id}`

Returns the current `{ "id", "acknowledged", "finalised", "attachmentId?" }` without modifying state.

### Finalise — `POST /v1/transfers/{id}`

No body required. Verifies the whole-file SHA-256, stores the reassembled bytes via `DeviceMedia.put()`, and returns:

```json
{
  "acknowledged": 4194304,
  "finalised": true,
  "attachmentId": "hex-id",
  "attachment": { "id", "name", "mimeType", "size", "url" }
}
```

The attachment is then available at `/v1/attachments/{attachmentId}`. Calling finalise again on an already-finalised transfer is safe and returns the same attachment.

## Limits

| Parameter | Limit |
|---|---|
| Max file size | 100 MB |
| Max chunk size | 512 KB |
| Max concurrent active transfers | 8 |
| Transfer expiry | 24 hours |
| `transferId` characters | `[A-Za-z0-9_-]`, 1–80 chars |

## Integrity

- **Per-chunk:** the `X-Ally-SHA256` header is verified before the chunk is appended. A mismatch returns HTTP 400 and the chunk is not stored.
- **Whole-file:** on finalise, the SHA-256 of the reassembled file is compared against the value supplied in `begin`. A mismatch returns HTTP 400; the partial data is not exposed.

## Resume after restart

The `transferId` is the resume key. On reconnect, call `begin` with the same `transferId`, `deviceId`, and `sha256`. The response `acknowledged` is the last durably written byte count. Start sending chunks from that offset.

State is stored on disk (`~/.config/Ally/device-transfers/{id}.json` + `{id}.part`) so it survives both desktop and device restarts. Expired or conflicting transfers are cleaned up automatically.

## Android client

`TransferReceiver.kt` (`wear-app/phone/…/dev/ally/phone/TransferReceiver.kt`) wraps the full begin → chunk loop → finalise sequence in a `suspend fun upload(uri, baseUrl, token, deviceId, mimeType, name)`. Progress is stored in `SharedPreferences` keyed by the file's SHA-256 (`ally-transfers`), so uploads resume correctly after a process restart without re-sending already-acknowledged bytes.

## Desktop implementation

`TransferStore` in `glass-pip-chat/electron/watch/transfer.ts` manages all server-side state. It is instantiated in `bridge.ts` alongside `DeviceMedia` and cleaned up on bridge shutdown. Tests live in `transfer.test.ts` (23 cases covering begin/resume, chunk integrity, out-of-order detection, finalise, multi-chunk uploads, restart resume, and expiry cleanup).
