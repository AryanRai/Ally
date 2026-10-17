// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { DeviceMedia, MAX_ATTACHMENT, attachmentName, approvalImageUrls } from './media';
import { watchHistory } from './conversations';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function setup() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-media-')); roots.push(root); return { root, media: new DeviceMedia(root) }; }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=', 'base64');
it('stores opaque assets, preserves bytes, normalizes unsafe names and detects actual image type', () => {
  const { media } = setup();
  const asset = media.put(png, '../../CON.jpg', 'image/jpeg');
  expect(asset).toMatchObject({ name: '_CON.jpg.png', mimeType: 'image/png', size: png.length });
  expect(media.get(asset.id)).toEqual(asset);
  expect(fs.readFileSync(media.file(asset))).toEqual(png);
  expect(media.put(png, '../../CON.jpg', 'image/jpeg')).toEqual(asset);
  expect(attachmentName('..\\hello.txt. ')).toBe('hello.txt');
  expect(() => media.get('../../secret')).toThrow('not found');
  expect(() => media.requested(['/etc/passwd'])).toThrow('not found');
  expect(() => media.get('f'.repeat(64))).toThrow('not found');
});
it('enforces per-file and total limits without accepting disguised image payloads', () => {
  const { media } = setup();
  expect(() => media.put(Buffer.alloc(0), 'empty')).toThrow();
  expect(() => media.put(Buffer.alloc(MAX_ATTACHMENT + 1), 'huge')).toThrow();
  expect(() => media.put(Buffer.from('<script>bad</script>'), 'bad.png', 'image/png')).toThrow('not supported');
  const a = media.put(Buffer.alloc(MAX_ATTACHMENT), 'a.bin');
  const b = media.put(Buffer.alloc(MAX_ATTACHMENT), 'b.bin');
  const c = media.put(Buffer.from('x'), 'c.txt');
  expect(() => media.requested([a.id, b.id, c.id])).toThrow('40 MB');
  expect(() => media.requested(Array(7).fill(a.id))).toThrow('six');
  expect(media.requested([a.id, a.id])).toEqual([a]);
});
it('retains user images, tool screenshots and explicit assistant local files in native history', () => {
  const { root, media } = setup();
  const file = path.join(root, 'report.txt'); fs.writeFileSync(file, 'Synthetic report');
  const data = `data:image/png;base64,${png.toString('base64')}`;
  const messages = watchHistory([
    { role: 'user', content: 'Look at this', timestamp: 1, images: [data] },
    { role: 'assistant', content: `[Report](<${file}>)`, timestamp: 2, segments: [{ type: 'tool', content: '', toolExecution: { id: 'tool', name: 'browser', parameters: {}, status: 'success', startTime: 1, images: [data] } }] },
  ], media);
  expect(messages[0].attachments).toHaveLength(1);
  expect(messages[1].attachments).toHaveLength(2);
  expect(media.markdown('[remote](https://example.com/file.png) [relative](file.txt)')).toEqual([]);
  expect(approvalImageUrls({ content: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }] })).toEqual([data]);
});
