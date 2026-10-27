// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => {
  const image = { isEmpty: vi.fn(() => false), getSize: vi.fn(() => ({ width: 3200, height: 4800 })), resize: vi.fn(), toJPEG: vi.fn(() => Buffer.from('preview')) };
  image.resize.mockReturnValue(image);
  return { image, decode: vi.fn(() => image) };
});
vi.mock('electron', () => ({ nativeImage: { createFromBuffer: fake.decode } }));
import { prepareDiagramImages } from './diagramMedia';
let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'ally-card-media-')); vi.clearAllMocks(); fake.image.isEmpty.mockReturnValue(false); fake.image.toJPEG.mockReturnValue(Buffer.from('preview')); });
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });
it('prepares explicit page images outside the HTML budget without modifying original files', async () => {
  const file = path.join(root, 'page.png'); await fs.writeFile(file, 'original');
  expect(await prepareDiagramImages([{ id: 'page1', path: file }])).toEqual({ page1: 'data:image/jpeg;base64,cHJldmlldw==' });
  expect(fake.image.resize).toHaveBeenCalledWith({ height: 1800, quality: 'good' });
  expect(fake.image.toJPEG).toHaveBeenCalledWith(85);
  expect(await fs.readFile(file, 'utf8')).toBe('original');
  expect(await prepareDiagramImages(undefined)).toBeUndefined();
});
it('rejects URLs, network paths, non-raster files, duplicates, decode failures and oversized payloads', async () => {
  for (const asset of [{ id: 'a', path: 'https://example.test/a.png' }, { id: 'a', path: '\\\\server\\a.png' }, { id: 'a', path: path.join(root, 'a.svg') }, { id: '../a', path: path.join(root, 'a.png') }]) await expect(prepareDiagramImages([asset])).rejects.toThrow();
  const file = path.join(root, 'page.png'); await fs.writeFile(file, 'original');
  await expect(prepareDiagramImages([{ id: 'a', path: file }, { id: 'a', path: file }])).rejects.toThrow('unique');
  fake.image.isEmpty.mockReturnValueOnce(true);
  await expect(prepareDiagramImages([{ id: 'a', path: file }])).rejects.toThrow('decode');
  fake.image.toJPEG.mockReturnValueOnce(Buffer.alloc(4 * 1024 * 1024));
  await expect(prepareDiagramImages([{ id: 'a', path: file }])).rejects.toThrow('budget');
  await fs.truncate(file, 25 * 1024 * 1024);
  await expect(prepareDiagramImages([{ id: 'a', path: file }])).rejects.toThrow('24 MB');
});
