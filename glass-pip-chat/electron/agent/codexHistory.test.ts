// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('./thumbs.js', () => ({ thumbnails: (images?: string[]) => images?.length ? images : undefined }));
vi.mock('./codexMigration.js', () => ({ mappedCodexSession: (id: string) => id, codexMigrationAliases: () => ({}) }));
import { CodexRpc } from './codexRpc';
import { closeCodexHistory, codexHistoryMessages, loadCodexChat, repairCodexDeviceTitle } from './codexHistory';
vi.mock('./codexDesktop.js', async importOriginal => ({ ...await importOriginal<typeof import('./codexDesktop.js')>(), readDesktopActivity: vi.fn(async () => undefined) }));
import { readDesktopActivity } from './codexDesktop';
import { readCodexActivity } from './codexActivity';
vi.mock('./codexActivity.js', () => ({ readCodexActivity: vi.fn(async () => undefined) }));
afterEach(() => { closeCodexHistory(); vi.restoreAllMocks(); });
describe('API history', () => {
  it('retains native imageView screenshots and safely ignores expired image files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-native-image-'));
    try {
      const file = path.join(root, 'screenshot.png');
      const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5WQAAAAASUVORK5CYII=', 'base64');
      fs.writeFileSync(file, bytes);
      const messages = codexHistoryMessages([{ status: 'completed', items: [{ type: 'imageView', id: 'image', path: file }, { type: 'imageView', id: 'expired', path: path.join(root, 'missing.png') }] }], 1);
      expect(messages[0].segments?.[0].toolExecution?.images).toEqual([`data:image/png;base64,${bytes.toString('base64')}`]);
      expect(messages[0].segments?.[1].toolExecution?.images).toBeUndefined();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
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
  it('reconciles reconnect display IDs and a long running native task without erasing a real Stop', async () => {
    const request = vi.fn(async (method: string) => method === 'thread/read'
      ? { thread: { historyMode: 'paginated', cwd: '/work', createdAt: 1, path: '/rollout' } }
      : { data: [{ id: 'live-berry-display-2', status: 'interrupted', itemsView: 'full', items: [] }] });
    vi.spyOn(CodexRpc, 'connect').mockResolvedValue({ request, close: vi.fn() } as unknown as CodexRpc);
    vi.mocked(readCodexActivity).mockResolvedValue({ turnId: 'live', pending: true, recent: true, updatedAt: Date.now() });
    expect(await loadCodexChat('thread')).toMatchObject({ running: true, messages: [] });
    vi.mocked(readCodexActivity).mockResolvedValue({ turnId: 'live', pending: true, recent: false, updatedAt: 0 });
    vi.mocked(readDesktopActivity).mockResolvedValue({ turnId: 'live', running: true, idle: false });
    expect(await loadCodexChat('thread')).toMatchObject({ running: true, messages: [] });
    vi.mocked(readDesktopActivity).mockResolvedValue({ turnId: 'live', running: false, idle: true });
    expect((await loadCodexChat('thread')).messages.at(-1)?.content).toBe('⏹️ Stopped');
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
