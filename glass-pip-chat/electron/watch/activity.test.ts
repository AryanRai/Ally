import { describe, expect, it } from 'vitest';
import { recordActivity, settleActivity, type ActivityState } from './activity';

describe('watch activity', () => {
  it('updates a tool in place, keeps failures, and only reports supplied usage', () => {
    const state: ActivityState = { steps: [] };
    recordActivity(state, { kind: 'tool_start', id: '1', name: 'Read', input: { path: 'README.md' } });
    recordActivity(state, { kind: 'tool_update', id: '1', input: { path: 'LICENSE' } });
    recordActivity(state, { kind: 'tool_end', id: '1', isError: true, output: 'Denied' });
    recordActivity(state, { kind: 'done', usage: { outputTokens: 12 } });
    expect(state.steps).toEqual([{ id: '1', name: 'Read', status: 'error', detail: 'LICENSE\n\nDenied' }]);
    expect(state.usage).toEqual({ outputTokens: 12 });
  });
  it('bounds activity and marks missing completions interrupted', () => {
    const state: ActivityState = { steps: [] };
    for (let i = 0; i < 30; i++) recordActivity(state, { kind: 'tool_start', id: `${i}`, name: 'shell', input: { command: 'x'.repeat(5000) } });
    settleActivity(state);
    expect(state.steps).toHaveLength(24);
    expect(state.steps[0].id).toBe('6');
    expect(state.steps.every(s => s.status === 'interrupted' && s.detail.length === 1600)).toBe(true);
  });
});
