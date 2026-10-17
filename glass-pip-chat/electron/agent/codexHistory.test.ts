// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./thumbs.js', () => ({ thumbnails: (images?: string[]) => images?.length ? images : undefined }));
vi.mock('./codexMigration.js', () => ({ mappedCodexSession: (id: string) => id, codexMigrationAliases: () => ({}) }));
import { CodexRpc } from './codexRpc';
import { closeCodexHistory, codexHistoryMessages, loadCodexChat } from './codexHistory';
afterEach(() => { closeCodexHistory(); vi.restoreAllMocks(); });
describe('API history', () => {
  it('shows cancellation even when Codex omits the interrupted assistant item', () => {
    const messages = codexHistoryMessages([{ status: 'interrupted', items: [{ type: 'userMessage', content: [{ type: 'text', text: 'Count' }] }] }], 1);
    expect(messages.map(m => m.content)).toEqual(['Count', '⏹️ Stopped']);
    expect(messages[1].segments).toEqual([{ type: 'text', content: '⏹️ Stopped' }]);
  });
  it('pages all history and detects live changes without resuming or acquiring a writer', async () => {
    let reply = 'First';
    const request = vi.fn(async (method, params) => {
      if (method === 'thread/read') return { thread: { historyMode: 'paginated', cwd: '/work', createdAt: 1 } };
      if (method === 'thread/turns/list') return params.cursor ? { data: [{ id: 't2', itemsView: 'full', items: [{ type: 'agentMessage', id: 'a', text: reply }] }], nextCursor: null }
        : { data: [{ id: 't1', itemsView: 'full', items: [{ type: 'userMessage', content: [{ type: 'text', text: 'Hello' }] }] }], nextCursor: 'next' };
      throw new Error(`Unexpected writer method: ${method}`);
    });
    vi.spyOn(CodexRpc, 'connect').mockResolvedValue({ request, close: vi.fn() } as unknown as CodexRpc);
    const first = await loadCodexChat('thread');
    expect(first.messages.map(m => m.content)).toEqual(['Hello', 'First']);
    expect((await loadCodexChat('thread', first.revision)).unchanged).toBe(true);
    reply = 'Updated';
    expect((await loadCodexChat('thread', first.revision)).messages.at(-1)?.content).toBe('Updated');
    expect(request.mock.calls.every(([m]) => ['thread/read', 'thread/turns/list'].includes(m))).toBe(true);
  });
});
