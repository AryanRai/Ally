// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./thumbs.js', () => ({ thumbnails: (images?: string[]) => images?.length ? images : undefined }));
vi.mock('./codexMigration.js', () => ({ mappedCodexSession: (id: string) => id, codexMigrationAliases: () => ({}) }));
import { CodexRpc } from './codexRpc';
import { closeCodexHistory, codexHistoryMessages, loadCodexChat, repairCodexDeviceTitle } from './codexHistory';
import { readCodexActivity } from './codexActivity';
vi.mock('./codexActivity.js', () => ({ readCodexActivity: vi.fn(async () => undefined) }));
afterEach(() => { closeCodexHistory(); vi.restoreAllMocks(); });
describe('API history', () => {
  it('reconciles only the matching live turn, keeps previous Stops, and revisions change on actual Stop', async () => {
    const request = vi.fn(async (method: string) => method === 'thread/read'
      ? { thread: { historyMode: 'paginated', cwd: '/work', createdAt: 1, path: '/rollout' } }
      : { data: ['old', 'live'].map(id => ({ id, status: 'interrupted', itemsView: 'full', items: [{ type: 'userMessage', content: [{ type: 'text', text: id }] }] })) });
    vi.spyOn(CodexRpc, 'connect').mockResolvedValue({ request, close: vi.fn() } as unknown as CodexRpc);
    vi.mocked(readCodexActivity).mockResolvedValue({ turnId: 'live', pending: true, recent: true, updatedAt: Date.now() });
    const live = await loadCodexChat('thread');
    expect(live.running).toBe(true);
    expect(live.messages.map(m => m.content)).toEqual(['old', '⏹️ Stopped', 'live']);
    vi.mocked(readCodexActivity).mockResolvedValue({ turnId: 'live', pending: false, recent: true, updatedAt: Date.now() });
    const stopped = await loadCodexChat('thread', live.revision);
    expect(stopped.running).toBe(false);
    expect(stopped.unchanged).toBeUndefined();
    expect(stopped.messages.at(-1)?.content).toBe('⏹️ Stopped');
    vi.mocked(readCodexActivity).mockResolvedValue({ turnId: 'newer', pending: true, recent: true, updatedAt: Date.now() });
    expect((await loadCodexChat('thread')).messages.at(-1)?.content).toBe('⏹️ Stopped');
    vi.mocked(readCodexActivity).mockResolvedValue({ turnId: 'live', pending: true, recent: false, updatedAt: 0 });
    expect((await loadCodexChat('thread')).running).toBe(false);
    expect(request.mock.calls.every(([method]) => ['thread/read', 'thread/turns/list'].includes(method))).toBe(true);
  });
  it('repairs protocol-derived device titles through metadata only, preserving user renames', async () => {
    let name: string | null = null;
    const request = vi.fn(async () => ({ thread: { id: 'thread', name, preview: 'You are Ally on a round smartwatch. Instructions' } }));
    vi.spyOn(CodexRpc, 'connect').mockResolvedValue({ request, close: vi.fn() } as unknown as CodexRpc);
    await repairCodexDeviceTitle('thread', 'Droid Core progress');
    expect(request).toHaveBeenCalledWith('thread/name/set', { threadId: 'thread', name: 'Droid Core progress' });
    request.mockClear(); name = 'My chosen name';
    await repairCodexDeviceTitle('thread', 'Droid Core progress');
    expect(request).toHaveBeenCalledTimes(1);
  });
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
