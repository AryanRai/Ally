import { describe, expect, it } from 'vitest';
import { ClaudeStreamParser, CodexStreamParser, extractImages, stringifyToolOutput } from './parsers';
import type { AgentEvent } from './types';

const feed = (parser: { handle(e: unknown): AgentEvent[] }, events: unknown[]) => events.flatMap(e => parser.handle(e));

it('preserves Codex desktop text blocks in tool output', () => {
  expect(stringifyToolOutput([{ type: 'input_text', text: 'Build passed' }, { type: 'output_text', text: '34 tests passed' }, { type: 'text', text: 'Done' }])).toBe('Build passed\n34 tests passed\nDone');
});

describe('ClaudeStreamParser', () => {
  it('keeps unstreamed blocks and subsequent messages after a streamed block', () => {
    const events = feed(new ClaudeStreamParser(), [
      { type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Plan' } } },
      { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'Plan' }, { type: 'text', text: 'First answer' }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'After the tool' }] } },
    ]);
    expect(events).toEqual([{ kind: 'thinking', text: 'Plan' }, { kind: 'text', text: 'First answer' }, { kind: 'text', text: 'After the tool' }]);
  });

  it('extracts embedded image formats without fetching remote URLs', () => {
    expect(extractImages([
      { type: 'tool_result', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AA' } }] },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,BB' } },
      { type: 'input_image', image_url: 'data:image/png;base64,CC' },
      { type: 'image_url', image_url: { url: 'https://example.com/private.png' } },
    ])).toEqual(['data:image/jpeg;base64,AA', 'data:image/png;base64,BB', 'data:image/png;base64,CC']);
  });

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
      { kind: 'done', sessionId: 's1', isError: false, error: undefined, costUsd: 0.01, usage: { costUsd: 0.01 } },
    ]);
  });

  it('reports auth failures once, as an error result', () => {
    const events = feed(new ClaudeStreamParser(), [
      { type: 'assistant', session_id: 's2', message: { model: '<synthetic>', content: [{ type: 'text', text: 'Failed to authenticate' }] } },
      { type: 'result', session_id: 's2', is_error: true, api_error_status: 401, result: 'Failed to authenticate. API Error: 401' },
    ]);
    expect(events.filter(e => e.kind === 'text')).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ kind: 'done', isError: true, error: expect.stringContaining('/login') });
  });

  it('explains execution errors that carry errors[] instead of result', () => {
    const [done] = feed(new ClaudeStreamParser(), [
      { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['No conversation found with session ID: x'] },
    ]);
    expect(done).toMatchObject({ kind: 'done', isError: true, error: 'No conversation found with session ID: x' });
    const [bare] = feed(new ClaudeStreamParser(), [{ type: 'result', subtype: 'error_max_turns', is_error: true }]);
    expect(bare).toMatchObject({ error: 'Claude Code stopped: error max turns' });
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
      { kind: 'done', sessionId: 'th1', usage: {} },
    ]);
  });

  it('surfaces tool images and plan progress', () => {
    const events = feed(new CodexStreamParser(), [
      { type: 'item.started', item: { id: 'p', type: 'todo_list', items: [{ text: 'a', completed: false }] } },
      { type: 'item.updated', item: { id: 'p', type: 'todo_list', items: [{ text: 'a', completed: true }] } },
      { type: 'item.completed', item: { id: 'm', type: 'mcp_tool_call', server: 'eyes', tool: 'look', result: { content: [{ type: 'image', data: 'QUJD', mimeType: 'image/png' }] } } },
    ]);
    expect(events).toContainEqual({ kind: 'tool_update', id: 'p', input: { items: [{ text: 'a', completed: true }] } });
    expect(events.at(-1)).toMatchObject({ kind: 'tool_end', id: 'm', images: ['data:image/png;base64,QUJD'] });
  });

  it('turns a failed turn into an error result', () => {
    const events = feed(new CodexStreamParser(), [{ type: 'turn.failed', error: { message: 'quota' } }]);
    expect(events).toEqual([{ kind: 'done', sessionId: undefined, isError: true, error: 'quota' }]);
  });
});
