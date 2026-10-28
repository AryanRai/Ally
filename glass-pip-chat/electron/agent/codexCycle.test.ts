import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONTINUE_PROMPT, runCodexTurnCycling } from './codexCycle';
import { shareCodexHistory } from './codexAccounts';
import type { AgentEvent, AgentRunOptions } from './types';

function harness(order = ['default', 'b', 'c'], autoSwitch = true) {
  const tried: string[] = [];
  const limited = new Set<string>();
  const accounts = {
    autoSwitch: () => autoSwitch,
    next: (exclude: Set<string>) => order.find(id => !exclude.has(id) && !limited.has(id)),
    label: (id: string) => `acct-${id}`,
    list: () => order.map(id => ({ id, label: id })),
    limited: vi.fn((id: string) => { limited.add(id); }),
  };
  const runs: { opts: AgentRunOptions; emit: (ev: AgentEvent) => void; stop: ReturnType<typeof vi.fn> }[] = [];
  const start = (opts: AgentRunOptions, emit: (ev: AgentEvent) => void) => {
    tried.push(opts.codexAccountId ?? 'default');
    const run = { opts, emit, stop: vi.fn(), steer: vi.fn(async (_text: string, _images?: string[]) => true) };
    runs.push(run);
    return run;
  };
  const events: AgentEvent[] = [];
  const opts: AgentRunOptions = { provider: 'codex', cwd: '/work', prompt: 'do the thing', codexAccountId: 'default', sessionId: 'thread-1', images: ['a.png'] };
  return { accounts, runs, start, events, opts, tried, limited };
}

describe('automatic Codex account switching on the same chat', () => {
  it('sends a turn refused for a limit again on the next account, once, with the same prompt', () => {
    const h = harness();
    runCodexTurnCycling(h.opts, e => h.events.push(e), h.start, h.accounts);
    h.runs[0].emit({ kind: 'done', delivery: 'not_sent', usageLimit: true, isError: true, error: 'limit' });
    expect(h.runs).toHaveLength(2);
    expect(h.runs[1].opts).toMatchObject({ codexAccountId: 'b', sessionId: 'thread-1', prompt: 'do the thing', images: ['a.png'] });
    expect(h.events).toEqual([{ kind: 'stderr', text: 'acct-default reached its usage limit · sending on acct-b' }]);
    h.runs[1].emit({ kind: 'done', delivery: 'accepted' });
    expect(h.events.at(-1)).toEqual({ kind: 'done', delivery: 'accepted' });
  });

  it('continues a reply cut off mid-way on the next account in the same chat', () => {
    const h = harness();
    runCodexTurnCycling({ ...h.opts, sessionId: undefined }, e => h.events.push(e), h.start, h.accounts);
    h.runs[0].emit({ kind: 'session', sessionId: 'new-thread' });
    h.runs[0].emit({ kind: 'text', text: 'half of the answer' } as AgentEvent);
    h.runs[0].emit({ kind: 'done', delivery: 'accepted', usageLimit: true, isError: true, error: 'limit after work' });
    expect(h.runs[1].opts).toMatchObject({ codexAccountId: 'b', sessionId: 'new-thread', prompt: CONTINUE_PROMPT, images: undefined });
    expect(h.events.map(e => e.kind)).toEqual(['session', 'text', 'stderr']);
  });

  it('never resends when delivery is uncertain', () => {
    const h = harness();
    runCodexTurnCycling(h.opts, e => h.events.push(e), h.start, h.accounts);
    h.runs[0].emit({ kind: 'done', delivery: 'uncertain', usageLimit: true, isError: true, error: 'limit?' });
    expect(h.runs).toHaveLength(1);
    expect(h.events.at(-1)).toMatchObject({ kind: 'done', delivery: 'uncertain' });
  });

  it('walks every account, then reports that all are limited', () => {
    const h = harness();
    runCodexTurnCycling(h.opts, e => h.events.push(e), h.start, h.accounts);
    for (const run of [0, 1, 2]) h.runs[run].emit({ kind: 'done', delivery: 'not_sent', usageLimit: true, isError: true, error: 'limit' });
    expect(h.tried).toEqual(['default', 'b', 'c']);
    expect(h.events.at(-2)).toEqual({ kind: 'stderr', text: 'All your Codex accounts have reached their usage limits.' });
    expect(h.events.at(-1)).toMatchObject({ kind: 'done', usageLimit: true });
  });

  it('does not switch after Stop, or when automatic switching is off', () => {
    const h = harness();
    const run = runCodexTurnCycling(h.opts, e => h.events.push(e), h.start, h.accounts);
    run.stop();
    expect(h.runs[0].stop).toHaveBeenCalledOnce();
    h.runs[0].emit({ kind: 'done', delivery: 'not_sent', usageLimit: true });
    expect(h.runs).toHaveLength(1);
    const off = harness(undefined, false);
    runCodexTurnCycling(off.opts, e => off.events.push(e), off.start, off.accounts);
    off.runs[0].emit({ kind: 'done', delivery: 'not_sent', usageLimit: true });
    expect(off.runs).toHaveLength(1);
  });

  it('recognises a desktop-route limit by its message only when delivery is certain, and records it', () => {
    const h = harness();
    runCodexTurnCycling({ ...h.opts, codexDesktop: true }, e => h.events.push(e), h.start, h.accounts);
    h.runs[0].emit({ kind: 'done', delivery: 'not_sent', isError: true, error: "You've hit your usage limit." });
    expect(h.accounts.limited).toHaveBeenCalledWith('default');
    expect(h.runs[1].opts).toMatchObject({ codexAccountId: 'b', codexDesktop: false });
  });

  it('continues a desktop-route reply cut off by a structured limit on the next account, and records the limit', () => {
    const h = harness();
    runCodexTurnCycling({ ...h.opts, codexDesktop: true }, e => h.events.push(e), h.start, h.accounts);
    h.runs[0].emit({ kind: 'done', delivery: 'accepted', usageLimit: true, isError: true, error: 'limit' });
    expect(h.accounts.limited).toHaveBeenCalledWith('default');
    expect(h.runs[1].opts).toMatchObject({ codexAccountId: 'b', codexDesktop: false, sessionId: 'thread-1', prompt: CONTINUE_PROMPT });
  });

  it('re-checks profiles whose saved limit may be stale before giving up, but never probes the original login', () => {
    const h = harness();
    h.limited.add('default'); h.limited.add('b'); h.limited.add('c'); // Saved as limited; c has actually reset.
    runCodexTurnCycling({ ...h.opts, codexAccountId: 'b' }, e => h.events.push(e), h.start, h.accounts);
    h.runs[0].emit({ kind: 'done', delivery: 'not_sent', usageLimit: true });
    expect(h.runs[1].opts.codexAccountId).toBe('c');
    h.runs[1].emit({ kind: 'done', delivery: 'accepted' });
    expect(h.runs).toHaveLength(2);
    expect(h.tried).not.toContain('default');
  });

  it('routes steer and permission calls to the account run that is active now', async () => {
    const h = harness();
    const run = runCodexTurnCycling(h.opts, e => h.events.push(e), h.start, h.accounts);
    h.runs[0].emit({ kind: 'done', delivery: 'not_sent', usageLimit: true });
    await run.steer('more');
    expect((h.runs[1] as any).steer).toHaveBeenCalledWith('more');
  });
});

describe('shared Codex history', () => {
  it('links a profile to the shared history, keeps its earlier chats, and copies shared config', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-share-test-'));
    const shared = path.join(root, 'shared'), home = path.join(root, 'profile');
    fs.mkdirSync(path.join(shared, 'sessions', '2026'), { recursive: true });
    fs.writeFileSync(path.join(shared, 'sessions', '2026', 'main.jsonl'), 'main');
    fs.writeFileSync(path.join(shared, 'config.toml'), 'model = "x"');
    fs.mkdirSync(path.join(home, 'sessions', '2026'), { recursive: true });
    fs.writeFileSync(path.join(home, 'sessions', '2026', 'own.jsonl'), 'own');
    shareCodexHistory(home, shared);
    shareCodexHistory(home, shared); // idempotent
    expect(fs.lstatSync(path.join(home, 'sessions')).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(home, 'sessions', '2026', 'main.jsonl'), 'utf8')).toBe('main');
    expect(fs.readFileSync(path.join(shared, 'sessions', '2026', 'own.jsonl'), 'utf8')).toBe('own');
    expect(fs.readdirSync(home).some(n => n.startsWith('sessions.isolated-'))).toBe(true);
    expect(fs.readFileSync(path.join(home, 'config.toml'), 'utf8')).toBe('model = "x"');
    fs.rmSync(root, { recursive: true, force: true });
  });
});
