import { describe, expect, it } from 'vitest';
import { claudeTurnPending, codexRolloutPending, codexTurnsPending, isRunning, STALE_TURN_MS } from './sessionActivity';

const assistant = (stop_reason: string, extra = {}) => ({ type: 'assistant', message: { stop_reason, content: [], ...extra } });
const user = (content: unknown, extra = {}) => ({ type: 'user', message: { content }, ...extra });

describe('claudeTurnPending', () => {
  it('is pending mid tool loop and after a fresh prompt', () => {
    expect(claudeTurnPending([user('hi'), assistant('tool_use')])).toBe(true);
    expect(claudeTurnPending([assistant('end_turn'), user('next question')])).toBe(true);
    expect(claudeTurnPending([assistant('tool_use'), user([{ type: 'tool_result', content: 'ok' }])])).toBe(true);
  });

  it('is idle after the final reply, an interrupt or a CLI error', () => {
    expect(claudeTurnPending([user('hi'), assistant('end_turn')])).toBe(false);
    expect(claudeTurnPending([assistant('tool_use'), user([{ type: 'text', text: '[Request interrupted by user]' }])])).toBe(false);
    expect(claudeTurnPending([user('hi'), assistant('stop_sequence', { model: '<synthetic>' })])).toBe(false);
  });

  it('ignores meta lines, sidechains and bookkeeping records', () => {
    expect(claudeTurnPending([assistant('end_turn'), user('<command>', { isMeta: true }), { type: 'queue-operation' }])).toBe(false);
    expect(claudeTurnPending([assistant('end_turn'), { ...assistant('tool_use'), isSidechain: true }])).toBe(false);
  });
});

describe('codex', () => {
  const ev = (type: string) => ({ type: 'event_msg', payload: { type } });
  it('reads rollout task events', () => {
    expect(codexRolloutPending([ev('task_started'), ev('token_count')])).toBe(true);
    expect(codexRolloutPending([ev('task_started'), ev('task_complete')])).toBe(false);
    expect(codexRolloutPending([ev('task_started'), ev('turn_aborted')])).toBe(false);
  });
  it('reads app-server turn status', () => {
    expect(codexTurnsPending([{ status: 'completed' }, { status: 'inProgress' }])).toBe(true);
    expect(codexTurnsPending([{ status: 'completed' }])).toBe(false);
  });
});

it('treats long-silent turns as abandoned', () => {
  expect(isRunning(true, 1_000, 1_000 + STALE_TURN_MS - 1)).toBe(true);
  expect(isRunning(true, 1_000, 1_000 + STALE_TURN_MS)).toBe(false);
  expect(isRunning(false, 1_000, 1_000)).toBe(false);
});
