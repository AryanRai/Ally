import { mkdtempSync as mkdtempSharedHome } from 'node:fs';
import { tmpdir as tmpdirSharedHome } from 'node:os';
import { join as joinSharedHome } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexAccounts } from './codexAccounts';
import { CodexRpc } from './codexRpc';
import { listProfileChatsPage, loadProfileChat, repairProfileTitle } from './codexAccountHistory';
// ALLY_TEST_SHARED_HOME: profiles link their history here, never into the real ~/.codex.
process.env.CODEX_HOME = mkdtempSharedHome(joinSharedHome(tmpdirSharedHome(), 'ally-shared-codex-home-'));
vi.mock('./codexHistory.js', () => ({ cooperativeCodexHistoryMessages: vi.fn(async (turns: any[]) => turns.flatMap(t => t.items)) }));
vi.mock('./runningSessions.js', () => ({ isManagedSessionRunning: () => false }));
const roots: string[] = [];
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-profile-history-test-')); roots.push(root);
  codexAccounts.configure(path.join(root, 'profiles.json')); const a = codexAccounts.add('One');
  const request = vi.fn(async (method: string, params: any): Promise<any> => {
    if (method === 'account/read') return { account: { type: 'chatgpt', email: 'test@example.test' } };
    if (method === 'thread/list') return { data: [{ id: 'thread', name: 'Original', updatedAt: 1 }], nextCursor: null };
    if (method === 'thread/read') return { thread: { id: 'thread', name: 'Original', historyMode: 'paginated', createdAt: 1 } };
    if (method === 'thread/turns/list') return params.cursor ? { data: [{ id: 'two', itemsView: 'full', items: [{ role: 'assistant', content: 'second' }] }] }
      : { data: [{ id: 'one', itemsView: 'summary' }], nextCursor: 'next-turn' };
    if (method === 'thread/items/list') return params.cursor ? { data: [{ item: { role: 'assistant', content: 'first' } }] }
      : { data: [{ item: { role: 'user', content: 'original' } }], nextCursor: 'next-item' };
    throw Error('Unexpected mutation: ' + method);
  });
  const close = vi.fn(); const connect = vi.spyOn(CodexRpc, 'connect').mockResolvedValue({ request, close } as unknown as CodexRpc);
  return { a, request, connect, close };
}
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
describe('Profile-owned native history', () => {
  it('binds discovered threads and completely reads turns/items through that profile only', async () => {
    const { a, connect, request, close } = setup();
    const page = await listProfileChatsPage(a.id, 'binary', 30);
    expect(page.sessions[0]).toMatchObject({ id: 'thread', codexAccountId: a.id });
    expect(codexAccounts.owner('thread')).toBe(a.id);
    const result = await loadProfileChat(a.id, 'binary', 'thread');
    expect(result.messages.map(m => m.content)).toEqual(['original', 'first', 'second']);
    expect(connect.mock.calls.every(c => c[1] === codexAccounts.home(a.id))).toBe(true);
    expect(request.mock.calls.every(c => !/resume|fork|turn\/start/.test(c[0]))).toBe(true);
    expect(close).toHaveBeenCalledTimes(2);
    await repairProfileTitle(a.id, 'binary', 'thread', 'Stale device title');
    expect(request.mock.calls.some(c => c[0] === 'thread/name/set')).toBe(false);
    const unchanged = await loadProfileChat(a.id, 'binary', 'thread', result.revision);
    expect(unchanged).toMatchObject({ unchanged: true, messages: [] });
  });
  it('does not fall back to the default login after a failed read or a wrong owner', async () => {
    const { a, connect, request, close } = setup(); codexAccounts.bind('thread', a.id);
    request.mockImplementationOnce(async () => { throw Error('connection closed'); });
    await expect(loadProfileChat(a.id, 'binary', 'thread')).rejects.toThrow('connection closed');
    expect(connect).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledOnce();
    const b = codexAccounts.add('Two');
    await expect(loadProfileChat(b.id, 'binary', 'thread')).rejects.toThrow('affinity mismatch');
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
