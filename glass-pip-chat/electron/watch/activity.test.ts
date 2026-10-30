import { describe, expect, it } from 'vitest';
import { liveActivity, recordActivity, settleActivity, type ActivityState } from './activity';

describe('watch activity', () => {
  it('uses browser context for live status and retains raw error details', () => {
    const state: ActivityState = { steps: [] };
    recordActivity(state, { kind: 'tool_start', id: 'b', name: 'cua_repl.js', input: {} });
    expect(liveActivity(state.steps)).toBe('Using browser · Browser interaction');
    recordActivity(state, { kind: 'tool_update', id: 'b', input: { title: 'Inspect Instagram', code: 'await tab.getAXState()' } });
    expect(liveActivity(state.steps)).toBe('Using browser · Inspect Instagram');
    recordActivity(state, { kind: 'tool_end', id: 'b', isError: true, output: 'Emulation.setFocusEmulationEnabled timed out' });
    expect(liveActivity(state.steps)).toBe('Browser action failed · Inspect Instagram');
    expect(state.steps[0]).toMatchObject({ name: 'cua_repl.js', status: 'error', detail: expect.stringContaining('Emulation.setFocusEmulationEnabled') });
  });
  it('keeps parallel work active and distinguishes native computer actions', () => {
    const state: ActivityState = { steps: [] };
    recordActivity(state, { kind: 'tool_start', id: 'native', name: 'mcp__cua_repl__js', input: { code: 'await cua.getApp("Editor")' } });
    expect(liveActivity(state.steps)).toBe('Using computer');
    recordActivity(state, { kind: 'tool_start', id: 'b', name: 'cua_repl.js_reset', input: {} });
    recordActivity(state, { kind: 'tool_end', id: 'b' });
    expect(liveActivity(state.steps)).toBe('Using computer');
    recordActivity(state, { kind: 'tool_end', id: 'native' });
    expect(liveActivity(state.steps)).toBe('Thinking…');
  });
  it('updates a tool in place, keeps failures, and only reports supplied usage', () => {
    const state: ActivityState = { steps: [] };
    recordActivity(state, { kind: 'tool_start', id: '1', name: 'Read', input: { path: 'README.md' } });
    recordActivity(state, { kind: 'tool_update', id: '1', input: { path: 'LICENSE' } });
    recordActivity(state, { kind: 'tool_end', id: '1', isError: true, output: 'Denied' });
    recordActivity(state, { kind: 'done', usage: { outputTokens: 12 } });
    expect(state.steps).toMatchObject([{ id: '1', name: 'Read', status: 'error', detail: 'LICENSE\n\nDenied', startedAt: expect.any(Number), endedAt: expect.any(Number) }]);
    expect(state.usage).toEqual({ outputTokens: 12 });
  });
  it('bounds activity and marks missing completions interrupted', () => {
    const state: ActivityState = { steps: [] };
    for (let i = 0; i < 134; i++) recordActivity(state, { kind: 'tool_start', id: `${i}`, name: 'shell', input: { command: 'x'.repeat(5000) } });
    settleActivity(state);
    expect(state.steps).toHaveLength(128);
    expect(state.steps[0].id).toBe('6');
    expect(state.steps.every(s => s.status === 'interrupted' && s.detail.length === 1600)).toBe(true);
  });
});
