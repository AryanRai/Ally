// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanRunningSessions } from './runningSessions';
import { STALE_TURN_MS } from './sessionActivity';
import { readDesktopActivity } from './codexDesktop';

vi.mock('./codexDesktop', () => ({ readDesktopActivity: vi.fn(async () => undefined) }));

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
it('does not revive an abandoned Claude prompt when bookkeeping rewrites the file', async () => {
  const file = `.claude/projects/project/${id}.jsonl`;
  const prompt = { type: 'user', timestamp: new Date(now - STALE_TURN_MS - 1000).toISOString(), message: { content: 'show me the images' } };
  await write(file, [prompt, { type: 'cost-state', timestamp: new Date(now).toISOString() }]);
  expect(await scanRunningSessions(home, now)).toEqual([]);
  await write(file, [prompt, { ...prompt, timestamp: new Date(now).toISOString() }]);
  expect(await scanRunningSessions(home, now)).toEqual([expect.objectContaining({ provider: 'claude', id })]);
  await write(file, [prompt, { type: 'assistant', isApiErrorMessage: true, timestamp: new Date(now).toISOString(), message: { content: 'Usage limit reached' } }]);
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

it('recovers an exact native running chat even when its rollout mtime is stale after restart', async () => {
  const live = '33333333-3333-3333-3333-333333333333';
  vi.mocked(readDesktopActivity).mockResolvedValueOnce({ running: true, idle: false, turnId: 'native-live' });
  await write(`.codex/sessions/rollout-${live}.jsonl`, [
    { type: 'session_meta', payload: { cwd: '/still-working' } }, ev('task_started'),
  ], now - 10 * STALE_TURN_MS);
  const rows = await scanRunningSessions(home, now);
  expect(rows).toEqual([expect.objectContaining({ id: live, provider: 'codex', cwd: '/still-working', updatedAt: now })]);
  expect(readDesktopActivity).toHaveBeenCalledWith(live);
});

it('does not revive stale pending work when its native owner is idle or unavailable', async () => {
  const idle = '44444444-4444-4444-4444-444444444444';
  const unavailable = '55555555-5555-5555-5555-555555555555';
  vi.mocked(readDesktopActivity).mockResolvedValueOnce({ running: false, idle: true, turnId: 'finished' }).mockRejectedValueOnce(new Error('Desktop restarting'));
  await write(`.codex/sessions/rollout-${idle}.jsonl`, [ev('task_started')], now - STALE_TURN_MS - 1);
  await write(`.codex/sessions/rollout-${unavailable}.jsonl`, [ev('task_started')], now - STALE_TURN_MS - 1);
  await write(`.claude/projects/project/${id}.jsonl`, [{ type: 'user', message: { content: 'Still working' } }]);
  expect(await scanRunningSessions(home, now)).toEqual([expect.objectContaining({ provider: 'claude', id })]);
});
