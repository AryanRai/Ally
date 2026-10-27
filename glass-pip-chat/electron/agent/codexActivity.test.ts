// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readCodexActivity } from './codexActivity';
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(p => fs.rm(p, { recursive: true, force: true }))); });
it('finds exact lifecycle across large tool records and distinguishes stopped/stale turns', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ally-lifecycle-')); roots.push(root);
  const file = path.join(root, 'rollout.jsonl');
  const marker = (type: string) => JSON.stringify({ type: 'event_msg', payload: { type, turn_id: 'turn' } }) + '\n';
  await fs.writeFile(file, marker('task_started') + JSON.stringify({ type: 'response_item', output: 'x'.repeat(600000) }) + '\n');
  expect(await readCodexActivity(file)).toMatchObject({ turnId: 'turn', pending: true, recent: true });
  expect(await readCodexActivity(file, Date.now() + 11 * 60_000)).toMatchObject({ pending: true, recent: false });
  await fs.appendFile(file, marker('turn_aborted'));
  expect(await readCodexActivity(file)).toMatchObject({ turnId: 'turn', pending: false });
});

it('reuses unchanged lifecycle reads, recomputes staleness and notices append/replacement/deletion', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ally-lifecycle-cache-')); roots.push(root);
  const file = path.join(root, 'rollout.jsonl');
  const marker = (type: string) => JSON.stringify({ type: 'event_msg', payload: { type, turn_id: 'exact' } }) + '\n';
  await fs.writeFile(file, marker('task_started'));
  const open = vi.spyOn(fs, 'open');
  const first = await readCodexActivity(file);
  expect(first).toMatchObject({ pending: true, recent: true });
  for (let i = 0; i < 5; i++) expect(await readCodexActivity(file)).toEqual(first);
  expect(open).toHaveBeenCalledTimes(1);
  expect(await readCodexActivity(file, Date.now() + 11 * 60_000)).toMatchObject({ pending: true, recent: false });
  await fs.appendFile(file, marker('task_complete'));
  expect(await readCodexActivity(file)).toMatchObject({ status: 'completed', pending: false });
  await fs.rename(file, file + '.old');
  await fs.writeFile(file, marker('turn_aborted'));
  expect(await readCodexActivity(file)).toMatchObject({ status: 'stopped' });
  await fs.unlink(file);
  await expect(readCodexActivity(file)).rejects.toThrow();
});

it('caches absent lifecycle markers without masking a later start', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ally-lifecycle-empty-')); roots.push(root);
  const file = path.join(root, 'rollout.jsonl'); await fs.writeFile(file, '{}\n');
  const open = vi.spyOn(fs, 'open');
  expect(await readCodexActivity(file)).toBeUndefined();
  expect(await readCodexActivity(file)).toBeUndefined(); expect(open).toHaveBeenCalledTimes(1);
  await fs.appendFile(file, JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }) + '\n');
  expect(await readCodexActivity(file)).toMatchObject({ pending: true });
});
