import { describe, expect, it } from 'vitest';
import { CodexEventParser, codexErrorMessage } from './codexEvents';
import { codexThreadConfig } from './codexRun';

describe('Codex app-server events', () => {
  it('streams text and readable reasoning without replaying completed items or other threads', () => {
    const p = new CodexEventParser('a');
    expect(p.handle('item/agentMessage/delta', { threadId: 'b', itemId: 'm', delta: 'other' })).toEqual([]);
    expect(p.handle('item/agentMessage/delta', { threadId: 'a', itemId: 'm', delta: 'Hello' })).toEqual([{ kind: 'text', text: 'Hello', itemId: 'm' }]);
    expect(p.handle('item/completed', { item: { id: 'm', type: 'agentMessage', text: 'Hello' } })).toEqual([{ kind: 'text', text: '\n\n', itemId: 'm' }]);
    expect(p.handle('item/reasoning/summaryTextDelta', { itemId: 'r', delta: 'Checking' })).toEqual([{ kind: 'thinking', text: 'Checking' }]);
    expect(p.handle('item/completed', { item: { id: 'r', type: 'reasoning', summary: ['Checking'] } })).toEqual([{ kind: 'thinking', text: '\n\n' }]);
    expect(p.handle('item/completed', { item: { id: 'm2', type: 'agentMessage', text: 'Done' } })[0]).toEqual({ kind: 'text', text: 'Done', itemId: 'm2' });
  });
  it('retains tool output, images, failures, plans, diffs and per-turn usage', () => {
    const p = new CodexEventParser('a');
    expect(p.handle('item/started', { item: { id: 'c', type: 'commandExecution', command: 'pwd' } })[0]).toMatchObject({ kind: 'tool_start', name: 'shell' });
    expect(p.handle('item/commandExecution/outputDelta', { itemId: 'c', delta: 'working' })[0]).toMatchObject({ kind: 'tool_update', input: { output: 'working' } });
    expect(p.handle('item/completed', { item: { id: 'c', type: 'commandExecution', exitCode: 1, aggregatedOutput: 'failed' } }).at(-1)).toMatchObject({ kind: 'tool_end', isError: true, output: 'failed' });
    expect(p.handle('item/completed', { item: { id: 'm', type: 'mcpToolCall', server: 'screen', tool: 'capture', result: { content: [{ type: 'image', mimeType: 'image/png', data: 'abc' }] } } }).at(-1)).toMatchObject({ images: ['data:image/png;base64,abc'] });
    expect(p.handle('turn/plan/updated', { turnId: 't', plan: [{ step: 'Check', status: 'inProgress' }] })[0]).toMatchObject({ input: { plan: [{ step: 'Check', status: 'in_progress' }] } });
    expect(p.handle('turn/diff/updated', { turnId: 't', diff: '+hello' })[0]).toMatchObject({ name: 'edit_files', input: { changes: [{ diff: '+hello' }] } });
    p.handle('thread/tokenUsage/updated', { tokenUsage: { last: { inputTokens: 12, outputTokens: 3, cachedInputTokens: 5 } } });
    const done = p.handle('turn/completed', { turn: { status: 'completed' } });
    expect(done.filter(e => e.kind === 'tool_end')).toHaveLength(2);
    expect(done.at(-1)).toMatchObject({ kind: 'done', usage: { inputTokens: 12, outputTokens: 3, cachedTokens: 5 } });
  });
  it('keeps permissions and robot configuration in structured requests', () => {
    const base = { provider: 'codex' as const, cwd: 'C:/work', prompt: 'private prompt' };
    expect(codexThreadConfig({ ...base, permission: 'readonly' })).toMatchObject({ approvalPolicy: 'never', sandbox: 'read-only' });
    expect(codexThreadConfig({ ...base, permission: 'edit' })).toMatchObject({ sandbox: 'workspace-write' });
    expect(codexThreadConfig({ ...base, permission: 'full', model: 'chosen-model', robot: { instructions: 'robot', mcpUrl: 'http://perception', motionMcpUrl: 'http://motion' } })).toMatchObject({
      sandbox: 'danger-full-access', model: 'chosen-model', developerInstructions: expect.stringMatching(/Browser environment[\s\S]*\n\nrobot$/),
      config: { mcp_servers: { howyouseeme: { url: 'http://perception' }, droidcore: { url: 'http://motion' } } },
    });
  });
  it.each(['usageLimitExceeded', 'usage_limit_exceeded', { usageLimitExceeded: {} }])('flags a structured usage limit (%j) so the chat can move accounts', info => {
    const [done] = new CodexEventParser('t').handle('turn/completed', { threadId: 't', turn: { status: 'failed', error: { message: 'You’ve hit your usage limit.', codexErrorInfo: info } } });
    expect(done).toMatchObject({ kind: 'done', isError: true, usageLimit: true });
    const [other] = new CodexEventParser('t').handle('turn/completed', { threadId: 't', turn: { status: 'failed', error: { message: 'x', codexErrorInfo: 'other' } } });
    expect(other).not.toHaveProperty('usageLimit');
  });
  it('explains the ChatGPT unsupported-model error instead of showing raw JSON', () => {
    const raw = JSON.stringify({ detail: "The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.", error: { type: 'invalid_request_error', code: 'model_not_found', message: "The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account." } });
    const [done] = new CodexEventParser('t').handle('turn/completed', { threadId: 't', turn: { status: 'failed', error: { message: raw } } });
    expect(done).toMatchObject({ kind: 'done', isError: true });
    expect((done as { error: string }).error).toBe('This chat uses gpt-6.1-sol, which your ChatGPT account no longer supports. Choose another model for this chat in Codex, then send again. Your message was not answered.');
    expect(codexErrorMessage('{"detail":"Rate limited"}')).toBe('Rate limited');
    expect(codexErrorMessage('plain failure')).toBe('plain failure');
  });
});
