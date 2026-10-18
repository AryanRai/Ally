import { expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ stat: vi.fn(), open: vi.fn(), reveal: vi.fn(), realpath: vi.fn(), fileOpen: vi.fn() }));
vi.mock('node:fs/promises', () => ({ default: { stat: fixture.stat, realpath: fixture.realpath, open: fixture.fileOpen } }));
vi.mock('electron', () => ({ shell: { openPath: fixture.open, showItemInFolder: fixture.reveal } }));
import { openLocalDocument, readVisualization } from './localDocument';
import path from 'node:path';
it('opens regular documents on explicit request, reveals other files and rejects network/URL references', async () => {
  fixture.stat.mockResolvedValue({ isFile: () => true }); fixture.open.mockResolvedValue('');
  await openLocalDocument('C:/study/sheet.pdf'); expect(fixture.open).toHaveBeenCalledTimes(1);
  await openLocalDocument('C:/study/program.exe'); expect(fixture.reveal).toHaveBeenCalledTimes(1); expect(fixture.open).toHaveBeenCalledTimes(1);
  for (const path of ['https://example.com', '\\\\server\\file.pdf', '//server/file.pdf', 'relative.pdf', 'C:/bad\n.pdf']) await expect(openLocalDocument(path)).rejects.toThrow();
  fixture.open.mockResolvedValue('failure'); await expect(openLocalDocument('C:/study/sheet.pdf')).rejects.toThrow(/open/);
});
it('reads only bounded HTML artifacts inside the real artifact root, including symlink resolution', async () => {
  const root = path.resolve('C:/artifacts'), file = path.join(root, 'lens.html');
  fixture.realpath.mockImplementation(async (value: string) => value === file ? file : root);
  const close = vi.fn();
  const handle = { stat: vi.fn().mockResolvedValue({ isFile: () => true, size: 5 }), close, read: vi.fn().mockImplementation(async (buffer: Buffer) => { buffer.write('hello'); return { bytesRead: 5 }; }) };
  fixture.fileOpen.mockResolvedValue(handle);
  expect(await readVisualization(file)).toBe('hello'); expect(close).toHaveBeenCalledOnce();
  handle.stat.mockResolvedValue({ isFile: () => true, size: 1_000_001 });
  await expect(readVisualization(file)).rejects.toThrow(/large/); expect(close).toHaveBeenCalledTimes(2);
  fixture.realpath.mockImplementation(async (value: string) => value === file ? path.resolve('C:/private/lens.html') : root);
  await expect(readVisualization(file)).rejects.toThrow(/outside/);
  for (const invalid of ['relative.html', 'https://test/a.html', 'C:/artifacts/executable.exe']) await expect(readVisualization(invalid)).rejects.toThrow();
});
