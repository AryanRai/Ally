import { describe, it, expect } from 'vitest';
import { historyActivityTimeline, updateActivityTimeline } from './activityTimeline';
import { watchHistory } from './conversations';
import { recordActivity, type ActivityState } from './activity';

describe('public activity timeline', () => {
  it('keeps streamed updates between tool runs, updates tools in place and excludes reasoning/final text', () => {
    const state: ActivityState = { steps: [] };
    recordActivity(state, { kind: 'text', phase: 'commentary', itemId: 'a', text: 'Checking ' });
    recordActivity(state, { kind: 'text', phase: 'commentary', itemId: 'a', text: 'files' });
    recordActivity(state, { kind: 'tool_start', id: 'read', name: 'Read' });
    recordActivity(state, { kind: 'text', phase: 'commentary', itemId: 'b', text: 'Testing now' });
    recordActivity(state, { kind: 'tool_start', id: 'test', name: 'shell' });
    recordActivity(state, { kind: 'tool_end', id: 'read' });
    recordActivity(state, { kind: 'thinking', text: 'private' });
    recordActivity(state, { kind: 'text', phase: 'final_answer', text: 'Done' });
    expect(state.timeline?.map(row => row.type === 'update' ? row.text : row.stepId)).toEqual(['Checking files', 'read', 'Testing now', 'test']);
    expect(state.steps).toHaveLength(2);
    expect(state.steps[0].endedAt).toBeGreaterThanOrEqual(state.steps[0].startedAt!);
  });
  it('restores the same public order from native history and retains timing', () => {
    const message = { role: 'assistant' as const, content: 'Done', timestamp: 5000, usage: { durationMs: 4000 }, segments: [
      { type: 'text' as const, phase: 'commentary' as const, content: 'Checking' },
      { type: 'thinking' as const, content: 'private' },
      { type: 'tool' as const, toolExecution: { id: 'r', name: 'Read', parameters: {}, status: 'success' as const, startTime: 1000, endTime: 2000 } },
      { type: 'text' as const, phase: 'commentary' as const, content: 'Verified' },
      { type: 'text' as const, phase: 'final_answer' as const, content: 'Done' },
    ] };
    expect(historyActivityTimeline(message).map(row => row.type)).toEqual(['update', 'tool', 'update']);
    const [projected] = watchHistory([message]);
    expect(projected.text).toBe('Done');
    expect(projected.durationMs).toBe(4000);
    expect(projected.steps?.[0]).toMatchObject({ startedAt: 1000, endedAt: 2000 });
  });
  it('does not duplicate tool entries during retries or expose unknown events', () => {
    const first = updateActivityTimeline([], { kind: 'tool_start', id: 'a', name: 'Read' });
    expect(updateActivityTimeline(first, { kind: 'tool_start', id: 'a', name: 'Read' })).toEqual(first);
    expect(updateActivityTimeline(first, { kind: 'stderr', text: 'internal' })).toEqual(first);
  });
});
