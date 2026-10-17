// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { stdinPayload } from './runner';

it('sends shared images with their actual format and keeps binary content on stdin', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-image-payload-'));
  try {
    const extensions = ['png', 'jpg', 'gif', 'webp'];
    const images = extensions.map(ext => { const file = path.join(root, `image.${ext}`); fs.writeFileSync(file, 'synthetic'); return file; });
    const payload = JSON.parse(stdinPayload({ provider: 'claude', cwd: root, prompt: 'Look', images }));
    expect(payload.message.content.slice(0, 4).map((item: any) => item.source.media_type)).toEqual(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
    expect(payload.message.content[4]).toEqual({ type: 'text', text: 'Look' });
    expect(stdinPayload({ provider: 'codex', cwd: root, prompt: 'Look', images })).toBe('Look');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
