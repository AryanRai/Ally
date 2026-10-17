import fs from 'node:fs';
import { imageMimeType } from '../agent/imageFile.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const MAX_ATTACHMENT = 20 * 1024 * 1024;
export interface DeviceAttachment { id: string; name: string; mimeType: string; size: number; url: string }
const validId = /^[a-f0-9]{64}$/;
export function attachmentName(name: string): string {
  const safe = path.win32.basename(path.posix.basename(name)).replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').slice(0, 140).replace(/^\.+/, '_').replace(/[. ]+$/, '') || 'Attachment';
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe) ? `_${safe}` : safe;
}
/** Opaque, authenticated assets. HTTP clients can never nominate a local path. */
export class DeviceMedia {
  constructor(private root: string) { fs.mkdirSync(root, { recursive: true }); }
  put(bytes: Buffer, name: string, declared = 'application/octet-stream'): DeviceAttachment {
    if (!bytes.length || bytes.length > MAX_ATTACHMENT) throw new Error('Attachments must be between 1 byte and 20 MB');
    const image = imageMimeType(bytes);
    if (declared.startsWith('image/') && !image) throw new Error('This image format is not supported. Share PNG, JPEG, GIF or WebP.');
    const mimeType = image ?? (/^[\w.+-]+\/[\w.+-]+$/.test(declared) && !declared.startsWith('image/') ? declared : 'application/octet-stream');
    let safeName = attachmentName(name);
    if (image) {
      const extension = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' } as Record<string, string>)[image];
      if (extension && path.extname(safeName).toLowerCase() !== extension) safeName = safeName.slice(0, 130) + extension;
    }
    const id = createHash('sha256').update(safeName).update('\0').update(mimeType).update('\0').update(bytes).digest('hex');
    const asset: DeviceAttachment = { id, name: safeName, mimeType, size: bytes.length, url: `/v1/attachments/${id}` };
    if (!fs.existsSync(path.join(this.root, `${id}.json`))) {
      // Original names/extensions help file viewers and the agents. ID directories prevent collisions/traversal.
      fs.mkdirSync(path.join(this.root, id), { recursive: true });
      fs.writeFileSync(path.join(this.root, id, safeName), bytes);
      fs.writeFileSync(path.join(this.root, `${id}.json`), JSON.stringify(asset));
    }
    return asset;
  }
  get(id: string): DeviceAttachment {
    if (!validId.test(id)) throw new Error('Attachment not found');
    try {
      const asset = JSON.parse(fs.readFileSync(path.join(this.root, `${id}.json`), 'utf8')) as DeviceAttachment;
      if (asset.id !== id || attachmentName(asset.name) !== asset.name || !fs.statSync(this.file(asset)).isFile()) throw new Error();
      return asset;
    } catch { throw new Error('Attachment not found'); }
  }
  file(asset: DeviceAttachment): string {
    if (!validId.test(asset.id) || attachmentName(asset.name) !== asset.name) throw new Error('Invalid attachment');
    return path.join(this.root, asset.id, asset.name);
  }
  dataUrls(values: string[] | undefined, label = 'Screenshot'): DeviceAttachment[] {
    return (values ?? []).slice(0, 6).flatMap((value, index) => {
      const match = /^data:(image\/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
      if (!match || match[2].length > MAX_ATTACHMENT * 1.4) return [];
      try { return [this.put(Buffer.from(match[2], 'base64'), `${label} ${index + 1}.${match[1].split('/')[1].replace('jpeg', 'jpg')}`, match[1])]; } catch { return []; }
    });
  }
  markdown(text: string): DeviceAttachment[] {
    const assets: DeviceAttachment[] = [];
    for (const match of text.matchAll(/!?\[([^\]\n]*)\]\((?:<([^>\n]+)>|([^\s)]+))\)/g)) {
      let file = match[2] ?? match[3];
      if (file.startsWith('sandbox:')) file = file.slice(8);
      if (file.startsWith('file:')) { try { file = fileURLToPath(file); } catch { continue; } }
      if (!path.isAbsolute(file) || assets.length >= 6) continue;
      try {
        const stat = fs.statSync(file);
        if (!stat.isFile() || stat.size > MAX_ATTACHMENT || !stat.size) continue;
        assets.push(this.put(fs.readFileSync(file), path.basename(file)));
      } catch { /* A missing attachment stays visible as its original link. */ }
    }
    return assets;
  }
  requested(ids: unknown): DeviceAttachment[] {
    if (ids == null) return [];
    if (!Array.isArray(ids) || ids.length > 6 || ids.some(id => typeof id !== 'string')) throw new Error('Choose up to six attachments');
    const assets = [...new Set(ids as string[])].map(id => this.get(id));
    if (assets.reduce((sum, asset) => sum + asset.size, 0) > 40 * 1024 * 1024) throw new Error('Combined attachments must be under 40 MB');
    return assets;
  }
}

export function approvalImageUrls(value: unknown, depth = 0): string[] {
  if (depth > 7 || value == null) return [];
  if (typeof value === 'string') return value.startsWith('data:image/') ? [value] : [];
  if (Array.isArray(value)) return value.slice(0, 24).flatMap(item => approvalImageUrls(item, depth + 1)).slice(0, 6);
  if (typeof value !== 'object') return [];
  const node = value as Record<string, unknown>;
  if (node.type === 'image' && typeof node.data === 'string') return [`data:${node.mimeType ?? 'image/png'};base64,${node.data}`];
  if (node.type === 'image' && (node.source as any)?.type === 'base64') return [`data:${(node.source as any).media_type ?? 'image/png'};base64,${(node.source as any).data}`];
  return Object.values(node).slice(0, 24).flatMap(item => approvalImageUrls(item, depth + 1)).slice(0, 6);
}
