// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { localImage } from './localImage';
describe('raster preview reader', () => {
  it('returns an existing raster and rejects disguised files and non-image paths', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ally-preview-test-'));
    try {
      const image = path.join(dir, 'preview.jpg'); await fs.writeFile(image, Buffer.from([255,216,255,0]));
      expect(await localImage(image)).toBe('data:image/jpeg;base64,/9j/AA==');
      await fs.writeFile(image, 'private text'); await expect(localImage(image)).rejects.toThrow('content');
      await expect(localImage(path.join(dir, 'secret.txt'))).rejects.toThrow('path');
      await expect(localImage('https://example.com/x.jpg')).rejects.toThrow('path');
      await expect(localImage('\\\\server\\share\\x.jpg')).rejects.toThrow('path');
    } finally { await fs.rm(dir, { recursive: true }); }
  });
});
