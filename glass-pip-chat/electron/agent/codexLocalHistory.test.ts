// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) };
});
import { createReadStream } from 'node:fs';
vi.mock('./thumbs.js', () => ({ thumbnails: (images?: string[]) => images?.length ? images : undefined }));
import { CodexLocalHistory } from './codexLocalHistory';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); vi.mocked(createReadStream).mockClear(); });
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

it('rejects a large alias rollout after its header, reuses that decision and retries file revisions', async () => {
  const { file, reader } = await fixture([{ ...meta, payload: { ...meta.payload, id: 'other-session' } }]);
  await fs.truncate(file, 64 * 1024 * 1024);
  expect(await reader.read(id)).toBeUndefined();
  const stream = vi.mocked(createReadStream).mock.results.at(-1)!.value;
  expect(stream.destroyed).toBe(true);
  expect(stream.bytesRead).toBeLessThan(256 * 1024);
  const calls = vi.mocked(createReadStream).mock.calls.length;
  expect(await reader.read(id)).toBeUndefined();
  expect(vi.mocked(createReadStream)).toHaveBeenCalledTimes(calls);
  await fs.writeFile(file, [meta, message('user', 'Complete replacement')].map(r => JSON.stringify(r)).join('\n') + '\n');
  expect((await reader.read(id))?.messages[0].content).toBe('Complete replacement');
});

it('retries metadata-only, unfinished and missing rollouts when they become complete', async () => {
  const { file, reader } = await fixture([meta]);
  expect(await reader.read(id)).toBeUndefined();
  const calls = vi.mocked(createReadStream).mock.calls.length;
  expect(await reader.read(id)).toBeUndefined();
  expect(vi.mocked(createReadStream)).toHaveBeenCalledTimes(calls);
  await fs.appendFile(file, JSON.stringify(message('user', 'Now complete')) + '\n{"partial":');
  expect((await reader.read(id))?.messages[0].content).toBe('Now complete');
  await fs.unlink(file);
  await expect(reader.read(id)).rejects.toThrow();
  await fs.writeFile(file, [meta, message('user', 'Restored')].map(r => JSON.stringify(r)).join('\n'));
  expect((await reader.read(id))?.messages[0].content).toBe('Restored');
});

it('keeps full large Unicode records, cross-file ordering and duplicate suppression', async () => {
  const text = 'Full text 🦘 日本語 '.repeat(16000);
  const first = await fixture([meta, message('user', text)]);
  const second = await fixture([meta, message('assistant', 'Reply'), message('user', text)]);
  const reader = new CodexLocalHistory(() => [first.file, second.file]);
  const snapshot = await reader.read(id);
  expect(snapshot?.messages).toHaveLength(2);
  expect(snapshot?.messages[0].content === text.trim()).toBe(true);
  expect(snapshot?.messages[1].content).toBe('Reply');
});
