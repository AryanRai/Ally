// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readCodexActivity } from './codexActivity';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => fs.rm(p, { recursive: true, force: true }))); });
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
