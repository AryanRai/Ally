import { mkdtempSync as mkdtempSharedHome } from 'node:fs';
import { tmpdir as tmpdirSharedHome } from 'node:os';
import { join as joinSharedHome } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexAccounts } from './codexAccounts';
import { CodexRpc, CodexRpcError } from './codexRpc';
import { runCodexTurn } from './codexRun';
import type { AgentEvent } from './types';
// ALLY_TEST_SHARED_HOME: profiles link their history here, never into the real ~/.codex.
process.env.CODEX_HOME = mkdtempSharedHome(joinSharedHome(tmpdirSharedHome(), 'ally-shared-codex-home-'));
vi.mock('./userQuestions.js', () => ({ startUserQuestions: vi.fn(), WATCH_QUESTION_INSTRUCTIONS: '' }));
const roots: string[] = [];
const flush = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); };
function setup(percent = 10) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-profile-run-test-')); roots.push(root);
  codexAccounts.configure(path.join(root, 'profiles.json')); const a = codexAccounts.add('One'); const b = codexAccounts.add('Two');
  codexAccounts.select(a.id);
  const rpc = { onClose: undefined as CodexRpc['onClose'], onNotification: undefined as CodexRpc['onNotification'], close: vi.fn(),
    request: vi.fn(async (method: string): Promise<any> => {
      if (method === 'account/read') return { account: { type: 'chatgpt', email: 'test@example.test' } };
      if (method === 'account/rateLimits/read') return { rateLimits: { primary: { usedPercent: percent }, rateLimitReachedType: percent === 100 ? 'usageLimit' : null } };
      if (method === 'thread/start') return { thread: { id: 'new-native' } };
      if (method === 'turn/start') return { turn: { id: 'accepted-turn' } };
      return {};
    }) };
  const connect = vi.spyOn(CodexRpc, 'connect').mockResolvedValue(rpc as unknown as CodexRpc);
  const events: AgentEvent[] = [];
  const opts = { provider: 'codex' as const, cwd: '/work', prompt: 'authorized prompt', codexAccountId: a.id };
  return { a, b, rpc, connect, events, opts };
}
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
describe('Profile turn delivery and no silent failover', () => {
  it('rejects a fresh provider limit before thread creation without selecting another account', async () => {
    const { a, rpc, connect, events, opts } = setup(100);
    runCodexTurn(opts, e => events.push(e), 'binary'); await flush();
    expect(events.at(-1)).toMatchObject({ kind: 'done', delivery: 'not_sent', isError: true, usageLimit: true });
    expect(rpc.request.mock.calls.map(c => c[0])).toEqual(['account/read', 'account/rateLimits/read']);
    // One run never fails over by itself; new chats now route past the limited account.
    expect(connect).toHaveBeenCalledOnce(); expect(codexAccounts.route()).not.toBe(a.id);
  });
  it.each(['rejection', 'timeout', 'accepted'] as const)('preserves %s delivery and submits at most once', async mode => {
    const { a, rpc, connect, events, opts } = setup();
    const implementation = rpc.request.getMockImplementation()!;
    rpc.request.mockImplementation(async method => {
      if (method === 'turn/start' && mode === 'rejection') throw new CodexRpcError('limit', -32000, { codexErrorInfo: 'UsageLimitExceeded' });
      if (method === 'turn/start' && mode === 'timeout') throw Error('turn/start timed out');
      return implementation(method);
    });
    runCodexTurn(opts, e => events.push(e), 'binary'); await flush();
    if (mode === 'accepted') rpc.onNotification?.('turn/completed', { threadId: 'new-native', turn: { id: 'accepted-turn', status: 'failed', error: { message: 'limit after work', codexErrorInfo: 'UsageLimitExceeded' } } });
    expect(events.at(-1)).toMatchObject({ kind: 'done', delivery: mode === 'rejection' ? 'not_sent' : mode === 'timeout' ? 'uncertain' : 'accepted', isError: true });
    expect((events.at(-1) as { usageLimit?: boolean }).usageLimit ?? false).toBe(mode !== 'timeout');
    expect(rpc.request.mock.calls.filter(c => c[0] === 'turn/start')).toHaveLength(1);
    expect(connect).toHaveBeenCalledOnce(); expect(codexAccounts.owner('new-native')).toBe(a.id);
    if (mode === 'timeout') expect(codexAccounts.route()).toBe(a.id); else expect(codexAccounts.route()).not.toBe(a.id);
  });
  it('blocks identity changes before submitting and never borrows another account', async () => {
    const { a, rpc, connect, events, opts } = setup(); codexAccounts.verifyIdentity(a.id, 'original@example.test');
    runCodexTurn(opts, e => events.push(e)); await flush();
    expect(events.at(-1)).toMatchObject({ kind: 'done', delivery: 'not_sent', isError: true });
    expect(rpc.request.mock.calls.map(c => c[0])).toEqual(['account/read']); expect(connect).toHaveBeenCalledOnce();
  });
});
