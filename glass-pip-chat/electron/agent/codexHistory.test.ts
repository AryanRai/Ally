// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
vi.mock('./thumbs.js', () => ({ thumbnails: (images?: string[]) => images?.length ? images : undefined }));
vi.mock('./codexMigration.js', () => ({ mappedCodexSession: (id: string) => id, codexMigrationAliases: () => ({}) }));
import { CodexRpc } from './codexRpc';
import { closeCodexHistory, codexHistoryMessages, cooperativeCodexHistoryMessages, listCodexChats, loadCodexChat, repairCodexDeviceTitle } from './codexHistory';
vi.mock('./codexDesktop.js', async importOriginal => ({ ...await importOriginal<typeof import('./codexDesktop.js')>(), readDesktopActivity: vi.fn(async () => undefined) }));
import { readDesktopActivity } from './codexDesktop';
import { readCodexActivity } from './codexActivity';
import { resolveCodexDiscovery } from './codexDiscovery';
vi.mock('./codexActivity.js', () => ({ readCodexActivity: vi.fn(async () => undefined) }));
afterEach(() => { closeCodexHistory(); vi.restoreAllMocks(); });
describe('API history', () => {
  it('yields during expensive conversion while preserving every turn, status and message exactly', async () => {
    const turns = Array.from({length: 60}, (_, i) => ({ id: `t${i}`, status: i % 3 ? 'completed' : 'interrupted', startedAt: i + 1,
      items: [{type:'userMessage',content:[{type:'text',text:`Prompt ${i}`}]}, {type:'agentMessage',id:`a${i}`,text:`Answer ${i}`}] }));
    const expected = codexHistoryMessages(turns, 1);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now += 9);
    let serviced = false;
    setImmediate(() => { serviced = true; });
    const pending = cooperativeCodexHistoryMessages(turns, 1);
    expect(serviced).toBe(false);
    expect(await pending).toEqual(expected);
    expect(serviced).toBe(true);
  });
  it('shares duplicate opens and reuses full native history only until its exact file revision changes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-native-cache-'));
    const file = path.join(root, 'rollout'); fs.writeFileSync(file, 'header');
    const request = vi.fn(async (method: string) => method === 'thread/read' ? { thread: { id: 'cache-regression', path: file, historyMode: 'paginated', createdAt: 1 } } : { data: [{ id: 'one', status: 'completed', itemsView: 'full', items: [{ type: 'agentMessage', id: 'a', text: 'Kept history' }] }], nextCursor: null });
    vi.spyOn(CodexRpc, 'connect').mockResolvedValue({ request, close: vi.fn() } as unknown as CodexRpc);
    try {
      const [first, duplicate] = await Promise.all([loadCodexChat('cache-regression'), loadCodexChat('cache-regression')]);
      expect(duplicate.revision).toBe(first.revision);
      expect(request.mock.calls.filter(([method]) => method === 'thread/turns/list')).toHaveLength(1);
      expect((await loadCodexChat('cache-regression', first.revision)).unchanged).toBe(true);
      expect(request.mock.calls.filter(([method]) => method === 'thread/turns/list')).toHaveLength(1);
      fs.appendFileSync(file, '\nnew event');
      expect((await loadCodexChat('cache-regression', first.revision)).unchanged).not.toBe(true);
      expect(request.mock.calls.filter(([method]) => method === 'thread/turns/list')).toHaveLength(2);
      expect(request).toHaveBeenCalledWith('thread/turns/list', expect.objectContaining({ limit: 20 }), 8000);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  it('isolates a timed-out Guardian receipt metadata lookup from a foreground history read', async () => {
    let finishHistory!: (value: unknown) => void;
    const history = { request: vi.fn(async (method: string) => method === 'thread/read'
      ? { thread: { historyMode: 'paginated', createdAt: 1 } }
      : new Promise(resolve => { finishHistory = resolve; })), close: vi.fn() };
    const metadata = { request: vi.fn().mockRejectedValue(Error('Codex thread/read timed out')), close: vi.fn() };
    vi.spyOn(CodexRpc, 'connect').mockResolvedValueOnce(history as unknown as CodexRpc).mockResolvedValueOnce(metadata as unknown as CodexRpc);
    const opening = loadCodexChat('foreground-history-during-classification');
    await vi.waitFor(() => expect(history.request).toHaveBeenCalledWith('thread/turns/list', expect.anything(), 8000));
    await resolveCodexDiscovery('unknown-offpage-receipt-lane-regression');
    expect(metadata.close).toHaveBeenCalledOnce();
    expect(history.close).not.toHaveBeenCalled();
    expect(metadata.request).toHaveBeenCalledWith('thread/read', { threadId: 'unknown-offpage-receipt-lane-regression' }, 8000);
    finishHistory({ data: [], nextCursor: null });
    await expect(opening).resolves.toMatchObject({ sessionId: 'foreground-history-during-classification' });
  });
  it('keeps opening a chat alive when the independent list pipe times out', async () => {
    let failList!: (error: Error) => void;
    let finishHistory!: (value: unknown) => void;
    const list = { request: vi.fn(() => new Promise((_resolve, reject) => { failList = reject; })), close: vi.fn() };
    const history = { request: vi.fn(async (method: string) => method === 'thread/read'
      ? { thread: { historyMode: 'paginated', cwd: '/MECH5720', createdAt: 1 } }
      : new Promise(resolve => { finishHistory = resolve; })), close: vi.fn() };
    vi.spyOn(CodexRpc, 'connect').mockResolvedValueOnce(list as unknown as CodexRpc).mockResolvedValueOnce(history as unknown as CodexRpc);
    const listing = listCodexChats(1).catch(error => error);
    await vi.waitFor(() => expect(list.request).toHaveBeenCalled());
    const opening = loadCodexChat('original-mech-chat');
    await vi.waitFor(() => expect(history.request).toHaveBeenCalledWith('thread/turns/list', expect.anything(), 8000));
    failList(Error('Codex thread/list timed out'));
    expect(await listing).toBeInstanceOf(Error);
    expect(list.close).toHaveBeenCalledOnce();
    expect(history.close).not.toHaveBeenCalled();
    finishHistory({ data: [{ id: 'turn', status: 'completed', itemsView: 'full', items: [{ type: 'userMessage', content: [{ type: 'text', text: 'Lab history' }] }] }], nextCursor: null });
    expect(await opening).toMatchObject({ sessionId: 'original-mech-chat', cwd: '/MECH5720', messages: [{ role: 'user', content: 'Lab history' }] });
  });
  it('pages small native lists and deduplicates repeated sessions across cursors', async () => {
    const row = (id: string) => ({ id, name: id, updatedAt: 1 });
    const request = vi.fn(async (_method, params) => params.cursor
      ? { data: [row('three'), row('four'), row('five'), row('six')], nextCursor: null }
      : { data: [row('one'), row('two'), row('three'), row('four'), row('five')], nextCursor: 'next' });
    vi.spyOn(CodexRpc, 'connect').mockResolvedValue({ request, close: vi.fn() } as unknown as CodexRpc);
    expect((await listCodexChats(6)).map(row => row.id)).toEqual(['one','two','three','four','five','six']);
    expect(request.mock.calls.every(([method, params]) => method === 'thread/list' && params.limit <= 5)).toBe(true);
  });
  it('replaces a timed-out browsing connection on the next read without replaying writes', async () => {
    const close = vi.fn();
    const failed = { request: vi.fn().mockRejectedValue(Error('Codex thread/list timed out')), close };
    const healthy = { request: vi.fn().mockResolvedValue({ data: [{ id: 'recovered', updatedAt: 1 }], nextCursor: null }), close: vi.fn() };
    const connect = vi.spyOn(CodexRpc, 'connect').mockResolvedValueOnce(failed as unknown as CodexRpc).mockResolvedValueOnce(healthy as unknown as CodexRpc);
    await expect(listCodexChats(1)).rejects.toThrow('timed out');
    expect(close).toHaveBeenCalledOnce();
    expect((await listCodexChats(1))[0].id).toBe('recovered');
    expect(connect).toHaveBeenCalledTimes(2);
    expect(healthy.request).toHaveBeenCalledWith('thread/list', expect.objectContaining({ limit: 1 }), 8000);
  });
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
    vi.mocked(readDesktopActivity).mockResolvedValue({ turnId: 'live', running: true, idle: false, canStart: false, error: undefined });
    expect(await loadCodexChat('thread')).toMatchObject({ running: true, messages: [] });
    vi.mocked(readDesktopActivity).mockResolvedValue({ turnId: 'live', running: false, idle: true, canStart: true, error: undefined });
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
