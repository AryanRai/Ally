import { describe, expect, it } from 'vitest';
import { claudeActivityAt, claudeTurnPending, claudeTerminalStatus, codexRolloutPending, codexTurnsPending, isRunning, STALE_TURN_MS } from './sessionActivity';

const assistant = (stop_reason: string, extra = {}) => ({ type: 'assistant', message: { stop_reason, content: [], ...extra } });
const user = (content: unknown, extra = {}) => ({ type: 'user', message: { content }, ...extra });

it('requires explicit final/interrupt/error evidence for Claude terminal status',()=>{
  expect(claudeTerminalStatus([assistant('tool_use')])).toBeUndefined();
  expect(claudeTerminalStatus([assistant('end_turn'),user('new question')])).toBeUndefined();
  expect(claudeTerminalStatus([assistant('end_turn'),{type:'queue-operation'}])).toBe('completed');
  expect(claudeTerminalStatus([user('[Request interrupted by user]')])).toBe('stopped');
  expect(claudeTerminalStatus([{...assistant('',{model:'<synthetic>'}),isApiErrorMessage:true}])).toBe('error');
});

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

  it('ends on an explicit API error even without a synthetic model or stop reason', () => {
    const error = { ...assistant('', { model: 'claude', content: [{ type: 'text', text: 'Credit balance is too low' }] }), isApiErrorMessage: true };
    expect(claudeTurnPending([user('hi'), error])).toBe(false);
    expect(claudeTurnPending([error, user('try again')])).toBe(true);
  });
});

it('does not let Claude bookkeeping, metadata or sidechains refresh activity', () => {
  const timestamp = '2026-10-18T00:36:57.516Z';
  const recent = '2026-10-18T00:50:08.000Z';
  expect(claudeActivityAt([
    { ...user('show me the images'), timestamp },
    { type: 'cost-state', timestamp: recent },
    { ...user('metadata', { isMeta: true }), timestamp: recent },
    { ...assistant('tool_use'), isSidechain: true, timestamp: recent },
  ], Date.parse(recent))).toBe(Date.parse(timestamp));
  expect(claudeActivityAt([user('legacy')], 123)).toBe(123);
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
