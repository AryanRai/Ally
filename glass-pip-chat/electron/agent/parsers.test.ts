import { describe, expect, it } from 'vitest';
import { ClaudeStreamParser, CodexStreamParser } from './parsers';
import type { AgentEvent } from './types';

const feed = (parser: { handle(e: unknown): AgentEvent[] }, events: unknown[]) => events.flatMap(e => parser.handle(e));

describe('ClaudeStreamParser', () => {
  it('streams deltas, tools and the result without duplicating text', () => {
    const events = feed(new ClaudeStreamParser(), [
      { type: 'system', subtype: 'init', session_id: 's1' },
      { type: 'stream_event', session_id: 's1', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } } },
      { type: 'stream_event', session_id: 's1', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi ' } } },
      // The full assistant message repeats the streamed text; only its tool_use should surface
      { type: 'assistant', session_id: 's1', message: { content: [{ type: 'text', text: 'Hi ' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] } },
      { type: 'user', session_id: 's1', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'a.txt' }] } },
      { type: 'result', session_id: 's1', is_error: false, total_cost_usd: 0.01 },
    ]);
    expect(events).toEqual([
      { kind: 'session', sessionId: 's1' },
      { kind: 'thinking', text: 'hmm' },
      { kind: 'text', text: 'Hi ' },
      { kind: 'tool_start', id: 't1', name: 'Bash', input: { command: 'ls' } },
      { kind: 'tool_end', id: 't1', output: 'a.txt', isError: false },
      { kind: 'done', sessionId: 's1', isError: false, error: undefined, costUsd: 0.01 },
    ]);
  });

  it('reports auth failures once, as an error result', () => {
    const events = feed(new ClaudeStreamParser(), [
      { type: 'assistant', session_id: 's2', message: { model: '<synthetic>', content: [{ type: 'text', text: 'Failed to authenticate' }] } },
      { type: 'result', session_id: 's2', is_error: true, result: 'Failed to authenticate' },
    ]);
    expect(events.filter(e => e.kind === 'text')).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ kind: 'done', isError: true, error: 'Failed to authenticate' });
  });

  it('ignores subagent traffic', () => {
    const events = feed(new ClaudeStreamParser(), [
      { type: 'assistant', parent_tool_use_id: 'x', message: { content: [{ type: 'tool_use', id: 'sub', name: 'Read', input: {} }] } },
    ]);
    expect(events).toEqual([]);
  });
});

describe('CodexStreamParser', () => {
  it('maps items to text, tool pills and completion', () => {
    const events = feed(new CodexStreamParser(), [
      { type: 'thread.started', thread_id: 'th1' },
      { type: 'item.completed', item: { id: 'i0', type: 'agent_message', text: 'Listing.' } },
      { type: 'item.started', item: { id: 'i1', type: 'command_execution', command: 'ls', status: 'in_progress' } },
      { type: 'item.completed', item: { id: 'i1', type: 'command_execution', command: 'ls', aggregated_output: 'a.txt', exit_code: 1 } },
      { type: 'turn.completed', usage: {} },
    ]);
    expect(events).toEqual([
      { kind: 'session', sessionId: 'th1' },
      { kind: 'text', text: 'Listing.\n\n' },
      { kind: 'tool_start', id: 'i1', name: 'shell', input: { command: 'ls' } },
      { kind: 'tool_end', id: 'i1', output: 'a.txt', isError: true },
      { kind: 'done', sessionId: 'th1' },
    ]);
  });

  it('turns a failed turn into an error result', () => {
    const events = feed(new CodexStreamParser(), [{ type: 'turn.failed', error: { message: 'quota' } }]);
    expect(events).toEqual([{ kind: 'done', sessionId: undefined, isError: true, error: 'quota' }]);
  });
});
