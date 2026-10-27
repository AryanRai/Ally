import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { TransferStore, MAX_TRANSFER, MAX_CHUNK } from './transfer.js';
import type { DeviceMedia, DeviceAttachment } from './media.js';

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function makeMedia(store: Map<string, DeviceAttachment> = new Map()): DeviceMedia {
  let seq = 0;
  return {
    put(bytes: Buffer, name: string, mimeType = 'application/octet-stream'): DeviceAttachment {
      const id = sha256(Buffer.concat([Buffer.from(name), bytes])) + (seq++);
      const att: DeviceAttachment = { id, name, mimeType, size: bytes.length, url: `/v1/attachments/${id}` };
      store.set(id, att);
      return att;
    },
    get(id: string): DeviceAttachment {
      const att = store.get(id);
      if (!att) throw Error('Not found');
      return att;
    },
  } as unknown as DeviceMedia;
}

let dir: string;
let media: DeviceMedia;
let store: TransferStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'transfer-test-'));
  media = makeMedia();
  store = new TransferStore(dir, media);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const DEV = 'device-abc';
const data = Buffer.from('Hello, Ally!');
const fullSha = sha256(data);

function beginDefaults(overrides: Record<string, unknown> = {}) {
  return {
    transferId: 'tx-001',
    deviceId: DEV,
    name: 'file.txt',
    mimeType: 'text/plain',
    size: data.length,
    sha256: fullSha,
    ...overrides,
  };
}

describe('begin', () => {
  it('creates a new transfer at offset 0', () => {
    const status = store.begin(beginDefaults());
    expect(status).toEqual({ id: 'tx-001', acknowledged: 0, finalised: false });
  });

  it('returns current acknowledged on resume with same params', () => {
    store.begin(beginDefaults());
    const chunk = data.subarray(0, 6);
    store.chunk({ transferId: 'tx-001', deviceId: DEV, offset: 0, data: chunk, chunkSha256: sha256(chunk) });
    const status = store.begin(beginDefaults());
    expect(status.acknowledged).toBe(6);
    expect(status.finalised).toBe(false);
  });

  it('throws on transferId conflict with different sha256', () => {
    store.begin(beginDefaults());
    expect(() => store.begin(beginDefaults({ sha256: 'a'.repeat(64) }))).toThrow('conflict');
  });

  it('throws when size exceeds MAX_TRANSFER', () => {
    expect(() => store.begin(beginDefaults({ size: MAX_TRANSFER + 1 }))).toThrow('too large');
  });

  it('throws on invalid sha256 format', () => {
    expect(() => store.begin(beginDefaults({ sha256: 'notvalidhex' }))).toThrow('sha256');
  });

  it('throws on invalid transferId characters', () => {
    expect(() => store.begin(beginDefaults({ transferId: 'bad id!' }))).toThrow('transferId');
  });
});

describe('chunk', () => {
  beforeEach(() => { store.begin(beginDefaults()); });

  it('appends chunk and advances acknowledged', () => {
    const status = store.chunk({ transferId: 'tx-001', deviceId: DEV, offset: 0, data, chunkSha256: fullSha });
    expect(status.acknowledged).toBe(data.length);
  });

  it('returns current offset idempotently for re-sent prior chunk', () => {
    store.chunk({ transferId: 'tx-001', deviceId: DEV, offset: 0, data, chunkSha256: fullSha });
    const status = store.chunk({ transferId: 'tx-001', deviceId: DEV, offset: 0, data, chunkSha256: fullSha });
    expect(status.acknowledged).toBe(data.length);
  });

  it('throws on wrong offset', () => {
    expect(() => store.chunk({ transferId: 'tx-001', deviceId: DEV, offset: 5, data, chunkSha256: fullSha })).toThrow('offset');
  });

  it('throws on SHA-256 mismatch', () => {
    expect(() => store.chunk({ transferId: 'tx-001', deviceId: DEV, offset: 0, data, chunkSha256: 'a'.repeat(64) })).toThrow('SHA-256');
  });

  it('throws on device mismatch', () => {
    expect(() => store.chunk({ transferId: 'tx-001', deviceId: 'other-device', offset: 0, data, chunkSha256: fullSha })).toThrow('Device mismatch');
  });

  it('throws when chunk exceeds MAX_CHUNK', () => {
    const big = Buffer.alloc(MAX_CHUNK + 1);
    expect(() => store.chunk({ transferId: 'tx-001', deviceId: DEV, offset: 0, data: big, chunkSha256: sha256(big) })).toThrow(`${MAX_CHUNK}`);
  });

  it('throws on unknown transferId', () => {
    expect(() => store.chunk({ transferId: 'no-such', deviceId: DEV, offset: 0, data, chunkSha256: fullSha })).toThrow('not found');
  });
});

describe('finalise', () => {
  it('completes transfer and returns attachment', () => {
    store.begin(beginDefaults());
    store.chunk({ transferId: 'tx-001', deviceId: DEV, offset: 0, data, chunkSha256: fullSha });
    const result = store.finalise({ transferId: 'tx-001', deviceId: DEV });
    expect(result.finalised).toBe(true);
    expect(result.attachment.size).toBe(data.length);
    expect(result.attachmentId).toBe(result.attachment.id);
  });

  it('is idempotent: second finalise returns same attachment', () => {
    store.begin(beginDefaults());
    store.chunk({ transferId: 'tx-001', deviceId: DEV, offset: 0, data, chunkSha256: fullSha });
    const first = store.finalise({ transferId: 'tx-001', deviceId: DEV });
    const second = store.finalise({ transferId: 'tx-001', deviceId: DEV });
    expect(second.attachmentId).toBe(first.attachmentId);
  });

  it('throws on incomplete transfer', () => {
    const partial = data.subarray(0, 6);
    store.begin(beginDefaults());
    store.chunk({ transferId: 'tx-001', deviceId: DEV, offset: 0, data: partial, chunkSha256: sha256(partial) });
    expect(() => store.finalise({ transferId: 'tx-001', deviceId: DEV })).toThrow('Incomplete');
  });

  it('throws when whole-file sha256 does not match', () => {
    const wrongData = Buffer.from('wrong content!');
    store.begin(beginDefaults({ size: wrongData.length }));
    store.chunk({ transferId: 'tx-001', deviceId: DEV, offset: 0, data: wrongData, chunkSha256: sha256(wrongData) });
    expect(() => store.finalise({ transferId: 'tx-001', deviceId: DEV })).toThrow('SHA-256');
  });

  it('throws on device mismatch', () => {
    store.begin(beginDefaults());
    store.chunk({ transferId: 'tx-001', deviceId: DEV, offset: 0, data, chunkSha256: fullSha });
    expect(() => store.finalise({ transferId: 'tx-001', deviceId: 'other' })).toThrow('Device mismatch');
  });
});

describe('status', () => {
  it('returns current transfer state', () => {
    store.begin(beginDefaults());
    const status = store.status('tx-001');
    expect(status).toEqual({ id: 'tx-001', acknowledged: 0, finalised: false });
  });

  it('throws on unknown transfer', () => {
    expect(() => store.status('no-such')).toThrow('not found');
  });
});

describe('multi-chunk resume', () => {
  it('uploads in two chunks and finalises correctly', () => {
    const content = Buffer.allocUnsafe(10);
    content.fill(0x42);
    const fullHash = sha256(content);
    store.begin({ transferId: 'tx-multi', deviceId: DEV, name: 'bin.dat', mimeType: 'application/octet-stream', size: 10, sha256: fullHash });
    const c1 = content.subarray(0, 5), c2 = content.subarray(5);
    store.chunk({ transferId: 'tx-multi', deviceId: DEV, offset: 0, data: c1, chunkSha256: sha256(c1) });
    store.chunk({ transferId: 'tx-multi', deviceId: DEV, offset: 5, data: c2, chunkSha256: sha256(c2) });
    const result = store.finalise({ transferId: 'tx-multi', deviceId: DEV });
    expect(result.attachment.size).toBe(10);
  });

  it('resumes from acknowledged offset after restart', () => {
    const content = Buffer.allocUnsafe(10);
    content.fill(0x42);
    const fullHash = sha256(content);
    store.begin({ transferId: 'tx-resume', deviceId: DEV, name: 'bin.dat', mimeType: 'application/octet-stream', size: 10, sha256: fullHash });
    const c1 = content.subarray(0, 5);
    store.chunk({ transferId: 'tx-resume', deviceId: DEV, offset: 0, data: c1, chunkSha256: sha256(c1) });

    // Simulate restart: new store instance, same dir
    const store2 = new TransferStore(dir, media);
    const resumed = store2.begin({ transferId: 'tx-resume', deviceId: DEV, name: 'bin.dat', mimeType: 'application/octet-stream', size: 10, sha256: fullHash });
    expect(resumed.acknowledged).toBe(5);

    const c2 = content.subarray(5);
    store2.chunk({ transferId: 'tx-resume', deviceId: DEV, offset: 5, data: c2, chunkSha256: sha256(c2) });
    const result = store2.finalise({ transferId: 'tx-resume', deviceId: DEV });
    expect(result.attachment.size).toBe(10);
  });
});

describe('cleanup', () => {
  it('removes expired transfers', () => {
    store.begin(beginDefaults());
    const metaPath = join(dir, 'tx-001.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    meta.createdAt = Date.now() - 25 * 60 * 60 * 1000;
    writeFileSync(metaPath, JSON.stringify(meta));
    store.cleanup();
    expect(() => store.status('tx-001')).toThrow('not found');
  });
});
