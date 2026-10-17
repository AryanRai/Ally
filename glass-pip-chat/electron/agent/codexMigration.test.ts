// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configureCodexMigrations, interactiveCodexSession, mappedCodexSession } from './codexMigration';
import type { CodexRpc } from './codexRpc';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-migration-')); configureCodexMigrations(path.join(root, 'mapping.json')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
describe('Codex history migration', () => {
  it('refuses legacy exec continuation without creating a fork', async () => {
    const request = vi.fn(async method => method === 'thread/read' ? { thread: { source: 'exec' } } : { thread: { id: 'new', source: 'vscode' } });
    const rpc = { request } as unknown as CodexRpc;
    await expect(interactiveCodexSession(rpc, 'old', {})).rejects.toThrow('No fork was created');
    expect(mappedCodexSession('old')).toBe('old');
    expect(request.mock.calls.filter(([m]) => m === 'thread/fork')).toHaveLength(0);
    expect(request.mock.calls.some(([m]) => /delete|archive/.test(m))).toBe(false);
  });
  it('preserves existing migration identities without creating another copy', async () => {
    fs.writeFileSync(path.join(root, 'mapping.json'), JSON.stringify({ old: { startedAt: 10, target: 'existing' } }));
    const request = vi.fn();
    expect(await interactiveCodexSession({ request } as unknown as CodexRpc, 'old', {})).toBe('existing');
    expect(request).not.toHaveBeenCalled();
  });
  it('never forks an interactive chat and refuses ambiguous crash recovery', async () => {
    const rpc = { request: vi.fn().mockResolvedValue({ thread: { source: 'vscode' } }) } as unknown as CodexRpc;
    expect(await interactiveCodexSession(rpc, 'interactive', {})).toBe('interactive');
    fs.writeFileSync(path.join(root, 'mapping.json'), JSON.stringify({ old: { startedAt: 1 } }));
    const request = vi.fn(async method => method === 'thread/read' ? { thread: { source: 'exec' } } : { data: [], nextCursor: null });
    await expect(interactiveCodexSession({ request } as unknown as CodexRpc, 'old', {})).rejects.toThrow('interrupted');
    expect(request.mock.calls.some(([m]) => m === 'thread/fork')).toBe(false);
  });
  it('recovers a materialized fork from its pending journal without forking again', async () => {
    fs.writeFileSync(path.join(root, 'mapping.json'), JSON.stringify({ old: { startedAt: 10 } }));
    const request = vi.fn(async method => method === 'thread/read' ? { thread: { source: 'exec' } } : { data: [{ id: 'recovered', forkedFromId: 'old', originator: 'ally', createdAt: 11 }] });
    expect(await interactiveCodexSession({ request } as unknown as CodexRpc, 'old', {})).toBe('recovered');
    expect(mappedCodexSession('old')).toBe('recovered');
  });
});
