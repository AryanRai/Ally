import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('./codexAccounts.js', () => ({ codexAccounts: { route: () => 'default', home: () => '' }, useCodexProfile: () => () => {} }));
vi.mock('./codexDesktop.js', () => ({ CodexDesktopClient: class {}, CodexChatUnownedError: class extends Error {}, CodexDesktopUnavailableError: class extends Error {} }));
vi.mock('./codexRpc.js', () => ({ CodexRpc: class {} }));
vi.mock('./codexMigration.js', () => ({ interactiveCodexSession: async (_rpc: unknown, id: string) => id }));

const { compactAgentSession } = await import('./compact');

function fakeCodex(script: (method: string, params: any, notify: (method: string, params: any) => void) => any) {
  const calls: string[] = [];
  const rpc: any = {
    closed: false,
    close() { this.closed = true; },
    async request(method: string, params: any) {
      calls.push(method);
      const notify = (m: string, p: any) => queueMicrotask(() => rpc.onNotification?.(m, p));
      return script(method, params, notify);
    },
  };
  return { rpc, calls };
}

describe('Codex compaction', () => {
  it('reports a compaction only after the owner finishes it, with Codex token usage', async () => {
    const { rpc, calls } = fakeCodex((method, { threadId }, notify) => {
      if (method === 'thread/compact/start') {
        notify('thread/tokenUsage/updated', { threadId, tokenUsage: { last: { totalTokens: 8834 }, total: { totalTokens: 16576 }, modelContextWindow: 258400 } });
        notify('item/completed', { threadId, item: { type: 'contextCompaction', id: 'c' } });
        notify('turn/completed', { threadId, turn: { status: 'completed' } });
      }
      return {};
    });
    const outcome = await compactAgentSession({ provider: 'codex', sessionId: 't1' }, { connectCodex: async () => rpc, timeoutMs: 1000 });
    expect(outcome).toEqual({ compacted: true, provider: 'codex', tokensAfter: 8834, contextWindow: 258400 });
    expect(calls).toEqual(['thread/resume', 'thread/compact/start']);
    expect(rpc.closed).toBe(true);
  });

  it('never resumes a chat owned by Codex desktop', async () => {
    const connectCodex = vi.fn();
    const outcome = await compactAgentSession({ provider: 'codex', sessionId: 't1', codexDesktop: true }, { desktopOwner: async () => 'owner-1', connectCodex });
    expect(outcome.compacted).toBe(false);
    expect(outcome.reason).toMatch(/Codex desktop/);
    expect(connectCodex).not.toHaveBeenCalled();
  });

  it('does not compact when ownership cannot be checked', async () => {
    const connectCodex = vi.fn();
    const outcome = await compactAgentSession({ provider: 'codex', sessionId: 't1', codexDesktop: true }, { desktopOwner: async () => { throw Error('pipe broke'); }, connectCodex });
    expect(outcome.compacted).toBe(false);
    expect(connectCodex).not.toHaveBeenCalled();
  });

  it('stops at a writer conflict without compacting', async () => {
    const { rpc, calls } = fakeCodex(method => { if (method === 'thread/resume') throw Error('thread has an active writer'); return {}; });
    const outcome = await compactAgentSession({ provider: 'codex', sessionId: 't1' }, { connectCodex: async () => rpc });
    expect(outcome).toMatchObject({ compacted: false, reason: expect.stringMatching(/owns this chat/) });
    expect(calls).toEqual(['thread/resume']);
  });

  it('does not claim a compaction when the turn ends without a compaction item', async () => {
    const { rpc } = fakeCodex((method, { threadId }, notify) => {
      if (method === 'thread/compact/start') notify('turn/completed', { threadId, turn: { status: 'failed', error: { message: 'boom' } } });
      return {};
    });
    expect(await compactAgentSession({ provider: 'codex', sessionId: 't1' }, { connectCodex: async () => rpc, timeoutMs: 1000 })).toEqual({ compacted: false, provider: 'codex', reason: 'boom' });
  });

  it('rejects malformed session ids before doing anything', async () => {
    const connectCodex = vi.fn();
    expect((await compactAgentSession({ provider: 'codex', sessionId: '../x' }, { connectCodex })).compacted).toBe(false);
    expect(connectCodex).not.toHaveBeenCalled();
  });
});

describe('Claude compaction', () => {
  const session = () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ally-compact-')), 's.jsonl');
    fs.writeFileSync(file, '{"type":"user"}\n');
    return file;
  };
  const boundary = { type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: 120000, post_tokens: 9000 } };
  const continued = (text: string) => ({ type: 'user', message: { role: 'user', content: `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\n${text}` } });

  it('returns Claude Code’s reported token counts', async () => {
    const file = session();
    const outcome = await compactAgentSession({ provider: 'claude', sessionId: 's' }, {
      sessionFile: () => file,
      runClaude: async () => { fs.appendFileSync(file, '{"compact":1}\n'); return { events: [boundary, continued('Summary: the user is studying waves.'), { type: 'result', is_error: false }] }; },
    });
    expect(outcome).toEqual({ compacted: true, provider: 'claude', tokensBefore: 120000, tokensAfter: 9000 });
    expect(fs.readFileSync(file, 'utf8')).toContain('compact');
  });

  it('undoes a "summary" that is only an API error', async () => {
    const file = session();
    const outcome = await compactAgentSession({ provider: 'claude', sessionId: 's' }, {
      sessionFile: () => file,
      runClaude: async () => { fs.appendFileSync(file, '{"bad":1}\n'); return { events: [boundary, continued('Failed to authenticate. API Error: 401 revoked'), { type: 'result', is_error: false }] }; },
    });
    expect(outcome).toMatchObject({ compacted: false, reason: expect.stringMatching(/Failed to authenticate/) });
    expect(fs.readFileSync(file, 'utf8')).toBe('{"type":"user"}\n');
  });

  it('reports no compaction when Claude Code never emits a boundary', async () => {
    const file = session();
    const outcome = await compactAgentSession({ provider: 'claude', sessionId: 's' }, { sessionFile: () => file, runClaude: async () => ({ events: [{ type: 'result', is_error: true }] }) });
    expect(outcome.compacted).toBe(false);
  });

  it('reports a missing session', async () => {
    expect(await compactAgentSession({ provider: 'claude', sessionId: 's' }, { sessionFile: () => undefined })).toMatchObject({ compacted: false });
  });
});
