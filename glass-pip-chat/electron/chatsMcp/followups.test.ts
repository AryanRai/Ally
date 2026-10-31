import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Followups, followupTool } from './followups';

const chat = 'codex:session-1234';
function setup(over: Partial<{ alive: (pid: number) => boolean; exists: (p: string) => boolean }> = {}) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'followups-')), 'f.json');
  let now = 1_000_000;
  const wake = vi.fn(async (_chat: string, _text: string) => {});
  const deps = { file, now: () => now, alive: over.alive ?? (() => true), exists: over.exists ?? (() => false), wake };
  return { store: new Followups(deps), deps, wake, file, tick: (ms: number) => { now += ms; } };
}

describe('chat follow-ups', () => {
  it('wakes the same chat once when the timer ends, with the agent note', async () => {
    const { store, wake, tick } = setup();
    store.schedule(chat, { afterMinutes: 10, note: 'Check the printer and message Srijan if done.' });
    await store.check(); expect(wake).not.toHaveBeenCalled();
    tick(10 * 60_000); await store.check(); await store.check();
    expect(wake).toHaveBeenCalledTimes(1);
    expect(wake.mock.calls[0][0]).toBe(chat);
    expect(wake.mock.calls[0][1]).toMatch(/timer ended[\s\S]*Check the printer and message Srijan/);
    expect(store.list(chat)).toEqual([]);
  });
  it('waits for a process to exit or a file to appear, and wakes on timeout otherwise', async () => {
    let running = true, made = false;
    const { store, wake, tick } = setup({ alive: () => running, exists: () => made });
    store.schedule(chat, { pid: 42, note: 'Build done?' });
    store.schedule(chat, { path: 'C:/out/result.txt', note: 'Read result', timeoutMinutes: 30 });
    await store.check(); expect(wake).not.toHaveBeenCalled();
    running = false; await store.check();
    expect(wake.mock.calls[0][1]).toMatch(/process 42 exited/);
    tick(31 * 60_000); await store.check();
    expect(wake.mock.calls[1][1]).toMatch(/timed out after 30 minutes/);
  });
  it('survives a restart through its file and never repeats a fired follow-up', async () => {
    const first = setup();
    first.store.schedule(chat, { afterMinutes: 1, note: 'later' });
    const reloaded = new Followups({ ...first.deps });
    expect(reloaded.list(chat)).toHaveLength(1);
    first.tick(60_000); await reloaded.check();
    expect(new Followups({ ...first.deps }).list(chat)).toEqual([]);
  });
  it('rejects unclear triggers, finished jobs and other chats', () => {
    const { store } = setup({ alive: () => false, exists: () => true });
    expect(() => store.schedule(chat, { note: 'x' })).toThrow(/exactly one trigger/);
    expect(() => store.schedule(chat, { afterMinutes: 5, pid: 3, note: 'x' })).toThrow(/exactly one trigger/);
    expect(() => store.schedule(chat, { afterMinutes: 0.5, note: 'x' })).toThrow();
    expect(() => store.schedule(chat, { pid: 7, note: 'x' })).toThrow(/already finished/);
    expect(() => store.schedule(chat, { path: 'a', note: 'x' })).toThrow(/already exists/);
    expect(() => store.schedule(chat, { afterMinutes: 5, note: ' ' })).toThrow();
    const item = setup().store; const f = item.schedule(chat, { afterMinutes: 5, note: 'x' });
    expect(item.cancel('codex:other-12345', f.id)).toBe(false);
    expect(item.cancel(chat, f.id)).toBe(true);
  });
  it('tool binds to the calling chat', async () => {
    const { store } = setup(); const tool = followupTool(store);
    const ok = await tool.handler({ action: 'schedule', afterMinutes: 5, note: 'x' }, { caller: chat });
    expect(ok.isError).toBeFalsy();
    expect((await tool.handler({ action: 'list', chatId: 'codex:other-12345' }, { caller: chat })).isError).toBe(true);
    expect(JSON.parse((await tool.handler({ action: 'list' }, { caller: chat })).content[0].text!).followups).toHaveLength(1);
  });
});
