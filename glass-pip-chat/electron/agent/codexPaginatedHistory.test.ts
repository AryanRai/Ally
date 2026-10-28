// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { CodexPaginatedHistory } from './codexPaginatedHistory';
vi.mock('./thumbs.js', () => ({ thumbnails: (images?: string[]) => images }));
const roots: string[] = [];
afterEach(async () => { for (const dir of roots.splice(0)) await fs.rm(dir, { recursive: true, force: true }); });
const id = 'exact-thread';
const header = { type: 'session_meta', ordinal: 100, payload: { id, history_mode: 'paginated', history_base: { thread_id: id, end_ordinal_exclusive: 100 } } };
const start = (turn: string) => ({ type: 'event_msg', payload: { type: 'task_started', turn_id: turn } });
const message = (role: string, text: string, phase?: string) => ({ type: 'response_item', payload: { type: 'message', role, id: `${role}-${text}`, phase, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] } });
const finish = (turn: string, type = 'task_complete') => ({ type: 'event_msg', payload: { type, turn_id: turn } });
const encode = (records: any[]) => records.map((r, i) => JSON.stringify({ timestamp: new Date(1000 + i * 1000).toISOString(), ordinal: 100 + i, ...r })).join('\n') + '\n';
async function fixture(records: any[]) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ally-paginated-')); roots.push(dir);
  const file = path.join(dir, 'rollout'); await fs.writeFile(file, encode(records));
  return { file, reader: new CodexPaginatedHistory() };
}
it('reads current final replies and tools from verified suffix turns, preserving phases and stops', async () => {
  const { file, reader } = await fixture([header, start('old-build'), message('user', 'Build it'), message('assistant', 'Working', 'commentary'), { type: 'response_item', payload: { type: 'custom_tool_call', call_id: 'tool', name: 'exec', input: '{}' } }, { type: 'response_item', payload: { type: 'custom_tool_call_output', call_id: 'tool', output: 'passed' } }, message('assistant', 'Built it', 'final_answer'), finish('old-build'), start('new-turn'), message('user', 'Next?'), message('assistant', 'Latest answer', 'final_answer'), finish('new-turn'), start('real-stop'), message('user', 'Wait'), finish('real-stop', 'turn_aborted')]);
  const result = await reader.read(id, file);
  expect([...result!.turnIds]).toEqual(['old-build', 'new-turn', 'real-stop']);
  expect(result!.messages.map(m => m.content)).toEqual(['Build it', 'Working\n\nBuilt it', 'Next?', 'Latest answer', 'Wait', '⏹️ Stopped']);
  expect(result!.messages[1].segments).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'final_answer', content: 'Built it' }), expect.objectContaining({ type: 'tool', toolExecution: expect.objectContaining({ status: 'success' }) })]));
  expect(await reader.read(id, file)).toBe(result);
});
it('invalidates unchanged and growing suffix revisions without losing the last completed answer', async () => {
  const records = [header, start('one'), message('user', 'Q'), message('assistant', 'A', 'final_answer'), finish('one')];
  const { file, reader } = await fixture(records);
  expect((await reader.read(id, file))!.messages.at(-1)!.content).toBe('A');
  await fs.appendFile(file, JSON.stringify({ ordinal: 105, type: 'event_msg', payload: { type: 'task_started', turn_id: 'two' } }) + '\n{"partial":');
  expect((await reader.read(id, file))!.messages.at(-1)!.content).toBe('A');
  await fs.writeFile(file, encode([...records, start('two'), message('user', 'Q2'), message('assistant', 'A2', 'final_answer'), finish('two')]));
  expect((await reader.read(id, file))!.messages.at(-1)!.content).toBe('A2');
});
it.each([
  { ...header, payload: { ...header.payload, id: 'another-thread' } },
  { ...header, payload: { ...header.payload, history_base: { thread_id: 'parent', end_ordinal_exclusive: 100 } } },
  { ...header, payload: { ...header.payload, forked_from_id: 'parent' } },
  { ...header, ordinal: 99 },
])('refuses unrelated or incomplete inherited lineage', async badHeader => {
  const { file, reader } = await fixture([badHeader, start('turn'), message('user', 'Q'), message('assistant', 'Wrong answer')]);
  expect(await reader.read(id, file)).toBeUndefined();
});
it('rejects an ordinal gap and never invents a turn for unanchored response items', async () => {
  const { file, reader } = await fixture([header, start('turn'), { ...message('user', 'Q'), ordinal: 103 }]);
  expect(await reader.read(id, file)).toBeUndefined();
  await fs.writeFile(file, encode([header, message('user', 'Fragment'), message('assistant', 'Not a complete turn')]));
  expect(await reader.read(id, file)).toBeUndefined();
});
