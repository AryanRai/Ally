import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DeviceMedia, DeviceAttachment } from './media.js';

export const MAX_TRANSFER = 100 * 1024 * 1024;
export const MAX_CHUNK = 512 * 1024;
const MAX_ACTIVE = 8;
const EXPIRY_MS = 24 * 60 * 60 * 1000;

interface TransferMeta {
  id: string;
  deviceId: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  acknowledged: number;
  createdAt: number;
  finalised?: boolean;
  attachmentId?: string;
}

export interface TransferStatus {
  id: string;
  acknowledged: number;
  finalised: boolean;
  attachmentId?: string;
}

export interface FinaliseResult extends TransferStatus {
  attachment: DeviceAttachment;
}

export class TransferStore {
  constructor(private readonly dir: string, private readonly media: DeviceMedia) {
    fs.mkdirSync(dir, { recursive: true });
  }

  private metaFile(id: string) { return path.join(this.dir, `${id}.json`); }
  private partFile(id: string) { return path.join(this.dir, `${id}.part`); }

  private readMeta(id: string): TransferMeta | undefined {
    try { return JSON.parse(fs.readFileSync(this.metaFile(id), 'utf8')); } catch { return undefined; }
  }

  private writeMeta(meta: TransferMeta) {
    fs.writeFileSync(this.metaFile(meta.id), JSON.stringify(meta));
  }

  cleanup(): void {
    try {
      const now = Date.now();
      for (const f of fs.readdirSync(this.dir)) {
        if (!f.endsWith('.json')) continue;
        const id = f.slice(0, -5);
        const meta = this.readMeta(id);
        if (!meta || now - meta.createdAt > EXPIRY_MS) {
          try { fs.unlinkSync(this.metaFile(id)); } catch {}
          try { fs.unlinkSync(this.partFile(id)); } catch {}
        }
      }
    } catch {}
  }

  private activeCount(): number {
    try {
      let count = 0;
      const now = Date.now();
      for (const f of fs.readdirSync(this.dir)) {
        if (!f.endsWith('.json')) continue;
        const meta = this.readMeta(f.slice(0, -5));
        if (meta && !meta.finalised && now - meta.createdAt <= EXPIRY_MS) count++;
      }
      return count;
    } catch { return 0; }
  }

  begin(params: { transferId: string; deviceId: string; name: string; mimeType: string; size: number; sha256: string }): TransferStatus {
    const { transferId, deviceId, name, mimeType, size, sha256 } = params;
    if (typeof transferId !== 'string' || !/^[\w-]{1,80}$/.test(transferId)) throw Error('Invalid transferId.');
    if (typeof deviceId !== 'string' || !/^[\w-]{1,120}$/.test(deviceId)) throw Error('Invalid deviceId.');
    if (typeof name !== 'string' || name.length < 1 || name.length > 200) throw Error('Invalid name.');
    if (typeof mimeType !== 'string' || mimeType.length < 1 || mimeType.length > 100) throw Error('Invalid mimeType.');
    if (!Number.isInteger(size) || size < 1 || size > MAX_TRANSFER) throw Error(`File too large (max ${MAX_TRANSFER} bytes).`);
    if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) throw Error('Invalid sha256 (must be lowercase hex).');

    const existing = this.readMeta(transferId);
    if (existing) {
      if (existing.deviceId !== deviceId || existing.sha256 !== sha256) throw Error('Transfer ID conflict: different device or content.');
      const expired = Date.now() - existing.createdAt > EXPIRY_MS;
      if (expired) {
        try { fs.unlinkSync(this.metaFile(transferId)); } catch {}
        try { fs.unlinkSync(this.partFile(transferId)); } catch {}
      } else {
        return { id: transferId, acknowledged: existing.acknowledged, finalised: !!existing.finalised, attachmentId: existing.attachmentId };
      }
    }

    if (this.activeCount() >= MAX_ACTIVE) throw Error('Too many active transfers; try again later.');

    const meta: TransferMeta = { id: transferId, deviceId, name, mimeType, size, sha256, acknowledged: 0, createdAt: Date.now() };
    this.writeMeta(meta);
    return { id: transferId, acknowledged: 0, finalised: false };
  }

  chunk(params: { transferId: string; deviceId: string; offset: number; data: Buffer; chunkSha256: string }): TransferStatus {
    const { transferId, deviceId, offset, data, chunkSha256 } = params;
    const meta = this.readMeta(transferId);
    if (!meta) throw Error('Transfer not found. Call begin first.');
    if (meta.deviceId !== deviceId) throw Error('Device mismatch.');
    if (meta.finalised) return { id: transferId, acknowledged: meta.acknowledged, finalised: true, attachmentId: meta.attachmentId };
    if (Date.now() - meta.createdAt > EXPIRY_MS) throw Error('Transfer expired.');
    if (offset !== meta.acknowledged) {
      if (offset < meta.acknowledged) return { id: transferId, acknowledged: meta.acknowledged, finalised: false };
      throw Error(`Expected offset ${meta.acknowledged}, got ${offset}.`);
    }
    if (!Buffer.isBuffer(data) || data.length < 1 || data.length > MAX_CHUNK) throw Error(`Chunk must be 1–${MAX_CHUNK} bytes.`);
    if (meta.acknowledged + data.length > meta.size) throw Error('Chunk extends past declared file size.');
    const actual = createHash('sha256').update(data).digest('hex');
    if (actual !== chunkSha256) throw Error('Chunk SHA-256 mismatch.');
    fs.appendFileSync(this.partFile(transferId), data);
    meta.acknowledged += data.length;
    this.writeMeta(meta);
    return { id: transferId, acknowledged: meta.acknowledged, finalised: false };
  }

  finalise(params: { transferId: string; deviceId: string }): FinaliseResult {
    const { transferId, deviceId } = params;
    const meta = this.readMeta(transferId);
    if (!meta) throw Error('Transfer not found.');
    if (meta.deviceId !== deviceId) throw Error('Device mismatch.');
    if (meta.finalised && meta.attachmentId) {
      const attachment = this.media.get(meta.attachmentId);
      return { id: transferId, acknowledged: meta.acknowledged, finalised: true, attachmentId: meta.attachmentId, attachment };
    }
    if (meta.acknowledged !== meta.size) throw Error(`Incomplete: received ${meta.acknowledged} of ${meta.size} bytes.`);
    const bytes = fs.readFileSync(this.partFile(transferId));
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== meta.sha256) throw Error('Whole-file SHA-256 mismatch.');
    const attachment = this.media.put(bytes, meta.name, meta.mimeType);
    meta.finalised = true;
    meta.attachmentId = attachment.id;
    this.writeMeta(meta);
    try { fs.unlinkSync(this.partFile(transferId)); } catch {}
    return { id: transferId, acknowledged: meta.acknowledged, finalised: true, attachmentId: attachment.id, attachment };
  }

  status(transferId: string): TransferStatus {
    const meta = this.readMeta(transferId);
    if (!meta) throw Error('Transfer not found.');
    return { id: transferId, acknowledged: meta.acknowledged, finalised: !!meta.finalised, attachmentId: meta.attachmentId };
  }
}
