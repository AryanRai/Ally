import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAgentRun, stopAgentRun } from './runner';
import { runCodexDesktopTurn } from './codexDesktopRun';
import { runCodexTurn } from './codexRun';
import { resolveAgentBinary } from './binaries';

vi.mock('./binaries.js', () => ({ resolveAgentBinary: vi.fn(async () => 'codex.exe'), childEnv: vi.fn(), launcherFor: vi.fn(), isWin: true }));
vi.mock('./codexDesktopRun.js', () => ({ runCodexDesktopTurn: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('./codexRun.js', () => ({ runCodexTurn: vi.fn(() => ({ stop: vi.fn() })) }));
afterEach(() => vi.clearAllMocks());
const opts = { provider: 'codex' as const, prompt: 'hello', cwd: process.cwd(), sessionId: 'exact-chat', codexDesktop: true };

describe('experimental desktop routing', () => {
  it('needs no CLI binary for an existing desktop chat and wires Stop', async () => {
    const id = await startAgentRun(opts, () => {});
    expect(resolveAgentBinary).not.toHaveBeenCalled(); expect(runCodexTurn).not.toHaveBeenCalled();
    expect(runCodexDesktopTurn).toHaveBeenCalledOnce();
    stopAgentRun(id); expect(vi.mocked(runCodexDesktopTurn).mock.results[0].value.stop).toHaveBeenCalledOnce();
  });
  it.each([{ codexDesktop: false }, { sessionId: undefined }, { ephemeral: true }])('retains the standard route when %j', async change => {
    const id = await startAgentRun({ ...opts, ...change }, () => {});
    expect(runCodexDesktopTurn).not.toHaveBeenCalled(); expect(runCodexTurn).toHaveBeenCalledOnce();
    stopAgentRun(id);
  });
});
