// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { InteractionBroker } from './interactions';
describe('decision history persistence', () => {
  it('retains outcomes and cancels orphaned requests after restart without restoring consent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-decisions-'));
    const b = new InteractionBroker(vi.fn());
    try {
      const file = path.join(dir, 'history.json'); b.configure(file);
      const spec = { chatId: 'codex:session-1234', kind: 'question' as const, title: 'Question', detail: '', fields: [{ id: 'secret', label: 'Private', secret: true, required: true, freeText: true, options: [] }], actions: [{ value: 'submit', label: 'Answer' }], expiresAt: Date.now() + 60000 };
      b.add({ ...spec, id: 'answered' }, vi.fn(), vi.fn());
      b.answer('answered', { action: 'submit', values: { secret: 'never-on-disk' } }, 'desktop');
      b.add({ ...spec, id: 'orphan' }, vi.fn(), vi.fn());
      expect(fs.readFileSync(file, 'utf8')).not.toContain('never-on-disk');
      const restored = new InteractionBroker(vi.fn()); restored.configure(file);
      expect(restored.list()).toEqual([]);
      expect(restored.history(spec.chatId)).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'answered', state: 'answered' }), expect.objectContaining({ id: 'orphan', state: 'cancelled' })]));
    } finally { b.closeAll(); fs.rmSync(dir, { recursive: true }); }
  });
});
