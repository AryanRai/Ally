import { expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ stat: vi.fn(), open: vi.fn(), reveal: vi.fn() }));
vi.mock('node:fs/promises', () => ({ default: { stat: fixture.stat } }));
vi.mock('electron', () => ({ shell: { openPath: fixture.open, showItemInFolder: fixture.reveal } }));
import { openLocalDocument } from './localDocument';
it('opens regular documents on explicit request, reveals other files and rejects network/URL references', async () => {
  fixture.stat.mockResolvedValue({ isFile: () => true }); fixture.open.mockResolvedValue('');
  await openLocalDocument('C:/study/sheet.pdf'); expect(fixture.open).toHaveBeenCalledTimes(1);
  await openLocalDocument('C:/study/program.exe'); expect(fixture.reveal).toHaveBeenCalledTimes(1); expect(fixture.open).toHaveBeenCalledTimes(1);
  for (const path of ['https://example.com', '\\\\server\\file.pdf', '//server/file.pdf', 'relative.pdf', 'C:/bad\n.pdf']) await expect(openLocalDocument(path)).rejects.toThrow();
  fixture.open.mockResolvedValue('failure'); await expect(openLocalDocument('C:/study/sheet.pdf')).rejects.toThrow(/open/);
});
