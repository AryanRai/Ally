// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./thumbs.js', () => ({ thumbnails: (images?: string[]) => images?.length ? images : undefined }));
import { CodexLocalHistory } from './codexLocalHistory';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
const id = '11111111-1111-4111-8111-111111111111';
const meta = { type: 'session_meta', timestamp: '2026-10-18T00:00:00Z', payload: { id, source: 'cli', cwd: '/work' } };
const message = (role: string, text: string) => ({ type: 'response_item', timestamp: '2026-10-18T00:00:01Z', payload: { type: 'message', role, content: [{ type: 'text', text }] } });
async function fixture(records: unknown[]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ally-local-history-')); roots.push(root);
  const file = path.join(root, 'rollout.jsonl'); await fs.writeFile(file, records.map(r => JSON.stringify(r)).join('\n') + '\n');
  return { file, reader: new CodexLocalHistory(() => [file]) };
}
it('loads every long-chat message while yielding the event loop and shares repeated reads', async () => {
  const { reader, file } = await fixture([meta, ...Array.from({ length: 1000 }, (_, i) => message(i % 2 ? 'assistant' : 'user', `Message ${i}`))]);
  let ticks = 0; const timer = setInterval(() => ticks++, 0);
  const first = reader.read(id), duplicate = reader.read(id);
  expect(duplicate).toBe(first);
  const snapshot = await first; clearInterval(timer);
  expect(snapshot?.messages).toHaveLength(1000); expect(ticks).toBeGreaterThan(0);
  expect(snapshot?.messages.at(-1)?.content).toBe('Message 999');
  await fs.appendFile(file, JSON.stringify(message('user', 'Fresh question')) + '\n' + JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', turn_id: 'live' } }) + '\n');
  const changed = await reader.read(id); expect(changed?.revision).not.toBe(snapshot?.revision); expect(changed?.running).toBe(true);
  await fs.appendFile(file, JSON.stringify({ type: 'event_msg', payload: { type: 'turn_aborted' } }) + '\n');
  expect((await reader.read(id))?.messages.at(-1)?.content).toContain('Stopped');
  expect((await reader.read(id))?.running).toBe(false);
});
it('does not substitute incomplete, unrelated, internal or forked rollout history for native history', async () => {
  for (const header of [{ ...meta, payload: { ...meta.payload, id: 'different' } }, { ...meta, payload: { ...meta.payload, source: { subagent: 'guardian_review' } } }, { ...meta, payload: { ...meta.payload, forked_from_id: 'parent' } }, { ...meta, payload: { ...meta.payload, history_base: { thread_id: 'base' } } }, { ...meta, ordinal: 900 }]) {
    const { reader } = await fixture([header, message('user', 'not a complete native history')]);
    expect(await reader.read(id)).toBeUndefined();
  }
  const { reader } = await fixture([meta]); expect(await reader.read(id)).toBeUndefined();
});
