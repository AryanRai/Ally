// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanRunningSessions } from './runningSessions';
import { STALE_TURN_MS } from './sessionActivity';

let home: string;
const now = Date.now();
const id = '11111111-1111-1111-1111-111111111111';
const ev = (type: string) => ({ type: 'event_msg', payload: { type } });
beforeEach(async () => { home = await fs.mkdtemp(path.join(os.tmpdir(), 'ally-running-')); });
afterEach(async () => { await fs.rm(home, { recursive: true, force: true }); });
async function write(relative: string, records: unknown[], at = now) {
  const file = path.join(home, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, records.map(r => JSON.stringify(r)).join('\n') + '\n');
  await fs.utimes(file, at / 1000, at / 1000);
  return file;
}
it('reports both providers independently and removes completed, interrupted and stale turns', async () => {
  const codex = `.codex/sessions/2026/10/17/rollout-${id}.jsonl`;
  const claude = `.claude/projects/project/${id}.jsonl`;
  await write(codex, [{ type: 'session_meta', payload: { cwd: '/codex' } }, ev('task_started')]);
  await write(claude, [{ type: 'user', cwd: '/old', message: { content: 'Hello' } }, { type: 'assistant', cwd: '/new', message: { stop_reason: 'tool_use' } }]);
  expect(await scanRunningSessions(home, now)).toEqual(expect.arrayContaining([
    expect.objectContaining({ id, provider: 'codex', cwd: '/codex' }),
    expect.objectContaining({ id, provider: 'claude', title: 'Hello', cwd: '/new' }),
  ]));
  await write(codex, [ev('task_started'), ev('task_complete')]);
  await write(claude, [{ type: 'user', message: { content: '[Request interrupted by user]' } }]);
  expect(await scanRunningSessions(home, now)).toEqual([]);
  await write(codex, [ev('task_started')], now - STALE_TURN_MS - 1000);
  expect(await scanRunningSessions(home, now)).toEqual([]);
});
it('deduplicates continuations by original ID and honors the newest terminal event', async () => {
  await write(`.codex/sessions/rollout-${id}.jsonl`, [ev('task_started')], now - 1000);
  await write(`.codex/sessions/${id}_22222222-2222-2222-2222-222222222222.jsonl`, [ev('task_started'), ev('turn_aborted')]);
  expect(await scanRunningSessions(home, now)).toEqual([]);
});
it('does not confuse recent edits or partial JSON with running work', async () => {
  const file = await write(`.codex/sessions/rollout-${id}.jsonl`, [ev('task_complete')]);
  await fs.appendFile(file, '{"type":"event_msg"');
  await write(`.claude/projects/project/${id}.jsonl`, [{ type: 'assistant', message: { stop_reason: 'end_turn' } }, { type: 'queue-operation' }]);
  expect(await scanRunningSessions(home, now)).toEqual([]);
});
it('finds active sessions beyond the recent-chat page', async () => {
  for (let i = 0; i < 85; i++) await write(`.codex/sessions/rollout-${String(i).padStart(8, '0')}-1111-1111-1111-111111111111.jsonl`, [ev('task_complete')]);
  await write(`.codex/sessions/rollout-${id}.jsonl`, [ev('task_started')], now - 1000);
  expect(await scanRunningSessions(home, now)).toHaveLength(1);
});

it('detects a long running turn whose start is outside the transcript preview', async () => {
  await write(`.codex/sessions/rollout-${id}.jsonl`, [ev('task_started'), { type: 'response_item', payload: { output: 'x'.repeat(700000) } }]);
  expect(await scanRunningSessions(home, now)).toHaveLength(1);
});
