import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAgentRun, steerAgentRun, stopAgentRun, stopAllAgentRuns } from './runner';
import { runCodexTurn } from './codexRun';
import type { AgentEvent, AgentRunOptions } from './types';
vi.mock('./codexRun.js', () => ({ runCodexTurn: vi.fn() }));
vi.mock('./binaries.js', () => ({ resolveAgentBinary: async () => 'codex', isWin: false }));
vi.mock('./runningSessions.js', () => ({ trackRunningSession: vi.fn(), finishRunningSession: vi.fn() }));
const flush = async () => { for (let i=0; i<30; i++) await Promise.resolve(); };
const opts: AgentRunOptions = { provider: 'codex', cwd: process.cwd(), prompt: 'original', sessionId: 'same-session', permission: 'readonly' };
afterEach(() => { stopAllAgentRuns(); vi.clearAllMocks(); });
function setup(native = false) {
  const turns: Array<{ opts: AgentRunOptions; emit: (e: AgentEvent) => void; stop: ReturnType<typeof vi.fn>; steer: ReturnType<typeof vi.fn> }> = [];
  vi.mocked(runCodexTurn).mockImplementation((opts, emit) => {
    const stop = vi.fn(() => emit({ kind: 'done', sessionId: opts.sessionId }));
    const steer = vi.fn(async () => native);
    turns.push({ opts, emit, stop, steer }); return { stop, steer };
  });
  return turns;
}
describe('input during an active response', () => {
  it('does not resend original attachments with queued text guidance', async () => {
    const turns = setup();
    const id = await startAgentRun({ ...opts, images: ['original.png'] }, vi.fn());
    await steerAgentRun(id, 'extra guidance', 'extra');
    turns[0].emit({ kind: 'done', sessionId: 'same-session' }); await flush();
    expect(turns[0].opts.images).toEqual(['original.png']);
    expect(turns[1].opts.images).toBeUndefined();
    turns[1].emit({ kind: 'done' }); await flush();
  });
  it('steers once and leaves the current turn running', async () => {
    const turns = setup(true); const emit = vi.fn();
    const id = await startAgentRun(opts, emit);
    expect(await steerAgentRun(id, 'keep going', 'request')).toBe('steered');
    expect(await steerAgentRun(id, 'keep going', 'request')).toBe('steered');
    expect(turns[0].steer).toHaveBeenCalledOnce(); expect(turns[0].stop).not.toHaveBeenCalled();
    expect(turns).toHaveLength(1);
    turns[0].emit({ kind: 'done' }); await flush();
    expect(emit.mock.calls.filter(([,e]) => e.kind === 'done')).toHaveLength(1);
  });
  it('queues unsupported input in order and resumes the exact session and permission', async () => {
    const turns = setup(); const emit = vi.fn(); const id = await startAgentRun(opts, emit);
    expect(await steerAgentRun(id, 'first', 'one')).toBe('queued');
    expect(await steerAgentRun(id, 'second', 'two')).toBe('queued');
    expect(turns).toHaveLength(1); expect(turns[0].stop).not.toHaveBeenCalled();
    turns[0].emit({ kind: 'done', sessionId: 'same-session' }); await flush();
    expect(turns).toHaveLength(2);
    expect(turns[1].opts).toMatchObject({ prompt: 'first\n\nsecond', sessionId: 'same-session', permission: 'readonly' });
    expect(emit.mock.calls.some(([,e]) => e.kind === 'done')).toBe(false);
    turns[1].emit({ kind: 'done' }); await flush();
    expect(emit.mock.calls.filter(([,e]) => e.kind === 'done')).toHaveLength(1);
  });
  it('does not launch queued input after Stop', async () => {
    const turns = setup(); const emit = vi.fn(); const id = await startAgentRun(opts, emit);
    await steerAgentRun(id, 'do this too', 'one'); stopAgentRun(id); await flush();
    expect(turns).toHaveLength(1);
    expect(emit.mock.calls.at(-1)?.[1]).toMatchObject({ kind: 'done', isError: true, error: expect.stringContaining('Queued input was not sent') });
  });
  it('does not turn a native steering failure into a duplicate queued prompt', async () => {
    const turns = setup(true); const id = await startAgentRun(opts, vi.fn());
    turns[0].steer.mockRejectedValue(new Error('uncertain delivery'));
    await expect(steerAgentRun(id, 'extra', 'one')).rejects.toThrow('uncertain');
    turns[0].emit({ kind: 'done' }); await flush(); expect(turns).toHaveLength(1);
  });
  it('waits for input acknowledgement before publishing completion', async () => {
    const turns = setup(true); const emit = vi.fn(); const id = await startAgentRun(opts, emit);
    let accept!: (value: boolean) => void;
    turns[0].steer.mockImplementation(() => new Promise<boolean>(resolve => { accept = resolve; }));
    const input = steerAgentRun(id, 'late input', 'one'); await flush();
    turns[0].emit({ kind: 'done' }); await flush();
    expect(emit.mock.calls.some(([,e]) => e.kind === 'done')).toBe(false);
    accept(true); await input; await flush();
    expect(emit.mock.calls.map(([,e]) => e.kind)).toEqual(['input', 'done']);
  });
});
