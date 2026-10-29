import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodexBranchTurns, mergeBranchMessages } from './codexBranchTurns';

const ID = '019ff712-a519-7cb0-b941-ed3be6c60d05';
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

const line = (record: object) => JSON.stringify(record) + '\n';
const meta = (id = ID) => line({ timestamp: '2026-10-28T03:00:00.000Z', type: 'session_meta', payload: { id } });
const turn = (turnId: string, at: string, question: string, answer: string) =>
  line({ timestamp: at, type: 'event_msg', payload: { type: 'task_started', turn_id: turnId } })
  + line({ timestamp: at, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: question }] } })
  + line({ timestamp: at, type: 'response_item', payload: { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: answer }] } })
  + line({ timestamp: at, type: 'event_msg', payload: { type: 'task_complete', turn_id: turnId } });

function sessions() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-branches-'));
  dirs.push(root);
  const day = path.join(root, '2026', '10', '29');
  fs.mkdirSync(day, { recursive: true });
  const file = (name: string, body: string) => { const full = path.join(day, name); fs.writeFileSync(full, body); return full; };
  return { root, file };
}

describe('turns a chat wrote to its other session files', () => {
  it('adds turns missing from Codex\'s view, skips known ones and other chats\' files', async () => {
    const s = sessions();
    const current = s.file(`rollout-b-${ID}_new.jsonl`, meta() + turn('known', '2026-10-28T15:00:00.000Z', 'q1', 'a1'));
    s.file(`rollout-a-${ID}_old.jsonl`, meta() + turn('known', '2026-10-28T15:00:00.000Z', 'q1', 'a1') + turn('elsewhere', '2026-10-28T16:42:00.000Z', 'why so slow?', 'RAM pressure'));
    s.file(`rollout-c-${ID}_foreign.jsonl`, meta('another-chat') + turn('intruder', '2026-10-28T16:50:00.000Z', 'x', 'y'));
    const reader = new CodexBranchTurns(s.root);
    const found = await reader.read(ID, current, new Set(['known']));
    expect(found?.messages.map(m => [m.role, m.content])).toEqual([['user', 'why so slow?'], ['assistant', 'RAM pressure']]);
    expect(await reader.read(ID, current, new Set(['known', 'elsewhere']))).toBeUndefined();
  });

  it('reads appended turns from a growing file and changes its revision', async () => {
    const s = sessions();
    const other = s.file(`rollout-a-${ID}_old.jsonl`, meta() + turn('one', '2026-10-28T16:00:00.000Z', 'q1', 'a1'));
    let clock = 0;
    const reader = new CodexBranchTurns(s.root, () => clock);
    const first = await reader.read(ID, undefined, new Set());
    fs.appendFileSync(other, turn('two', '2026-10-28T17:00:00.000Z', 'q2', 'a2'));
    clock += 61_000;
    const second = await reader.read(ID, undefined, new Set());
    expect(second?.messages.map(m => m.content)).toEqual(['q1', 'a1', 'q2', 'a2']);
    expect(second?.revision).not.toBe(first?.revision);
  });

  it('places found messages in time order without reordering the chat\'s own', () => {
    const own = [{ role: 'user' as const, content: 'a', timestamp: 1 }, { role: 'assistant' as const, content: 'b', timestamp: 3 }];
    const merged = mergeBranchMessages(own, [{ role: 'user', content: 'x', timestamp: 2 }, { role: 'assistant', content: 'y', timestamp: 4 }]);
    expect(merged.map(m => m.content)).toEqual(['a', 'x', 'b', 'y']);
  });
});
