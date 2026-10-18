import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAgentRun, steerAgentRun, stopAgentRun, stopAllAgentRuns } from './runner';
import { runCodexTurn } from './codexRun';
import { messageQueue } from './messageQueue';
import type { AgentEvent, AgentRunOptions } from './types';
vi.mock('./codexRun.js', () => ({ runCodexTurn: vi.fn() }));
vi.mock('./binaries.js', () => ({ resolveAgentBinary: async () => 'codex', isWin: false }));
vi.mock('./runningSessions.js', () => ({ trackRunningSession: vi.fn(), finishRunningSession: vi.fn() }));
const flush = async () => { for (let i=0; i<30; i++) await Promise.resolve(); };
const opts: AgentRunOptions = { provider: 'codex', cwd: process.cwd(), prompt: 'original', sessionId: 'initial-session', permission: 'readonly' };
beforeEach(() => { opts.sessionId = crypto.randomUUID(); });
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
  it('uses edits, cancellation and reordered individual turns from any surface', async () => {
    const turns=setup(); const id=await startAgentRun(opts,vi.fn()); const key=`codex:${opts.sessionId}`;
    await steerAgentRun(id,'first','one','queue',['one.png']);
    await steerAgentRun(id,'second','two','queue');
    await steerAgentRun(id,'cancel this','three','queue');
    let q=messageQueue.snapshot(key);
    q=await messageQueue.change(key,{action:'edit',id:'one',text:'edited first',revision:q.revision});
    q=await messageQueue.change(key,{action:'cancel',id:'three',revision:q.revision});
    await messageQueue.change(key,{action:'reorder',order:['two','one'],revision:q.revision});
    turns[0].emit({kind:'done'}); await flush(); expect(turns[1].opts.prompt).toBe('second');
    turns[1].emit({kind:'done'}); await flush(); expect(turns[2].opts).toMatchObject({prompt:'edited first',images:['one.png']});
    turns[2].emit({kind:'done'}); await flush(); expect(turns).toHaveLength(3); expect(messageQueue.snapshot(key).items).toEqual([]);
  });
  it('waits for Send now delivery to settle before consuming a simultaneous completion', async () => {
    const turns=setup(true), emit=vi.fn(); const id=await startAgentRun(opts,emit); const key=`codex:${opts.sessionId}`;
    await steerAgentRun(id,'queued','one','queue');
    let accept!: (value:boolean)=>void;
    turns[0].steer.mockImplementation(()=>new Promise<boolean>(resolve=>{accept=resolve}));
    const send=messageQueue.change(key,{action:'send',id:'one',revision:messageQueue.snapshot(key).revision});
    await flush(); turns[0].emit({kind:'done'}); await flush();
    expect(emit.mock.calls.some(([,e])=>e.kind==='done')).toBe(false);
    accept(true); await send; await flush();
    expect(turns).toHaveLength(1); expect(messageQueue.snapshot(key).items).toEqual([]);
    expect(emit.mock.calls.at(-1)?.[1]).toMatchObject({kind:'done'}); expect(emit.mock.calls.at(-1)?.[1].isError).not.toBeTruthy();
  });
  it('queues new attachments without replaying original images and binds their retry identity', async () => {
    const turns = setup(true);
    const id = await startAgentRun({ ...opts, images: ['original.png'] }, vi.fn());
    expect(await steerAgentRun(id, 'new screenshot', 'new-media', 'queue', ['new.png'])).toBe('queued');
    expect(await steerAgentRun(id, 'new screenshot', 'new-media', 'queue', ['new.png'])).toBe('queued');
    await expect(steerAgentRun(id, 'new screenshot', 'new-media', 'queue', ['changed.png'])).rejects.toThrow('different message');
    expect(turns[0].steer).not.toHaveBeenCalled();
    turns[0].emit({ kind: 'done', sessionId: opts.sessionId }); await flush();
    expect(turns[1].opts).toMatchObject({ prompt: 'new screenshot', images: ['new.png'], sessionId: opts.sessionId });
    turns[1].emit({ kind: 'done' }); await flush();
  });
  it('delivers new image inputs to native steering exactly once', async () => {
    const turns = setup(true); const id = await startAgentRun(opts, vi.fn());
    expect(await steerAgentRun(id, 'look here', 'image-steer', 'steer', ['screen.png'])).toBe('steered');
    expect(await steerAgentRun(id, 'look here', 'image-steer', 'steer', ['screen.png'])).toBe('steered');
    expect(turns[0].steer).toHaveBeenCalledExactlyOnceWith('look here', ['screen.png']);
    expect(turns).toHaveLength(1);
    turns[0].emit({ kind: 'done' }); await flush();
  });
  it('does not resend original attachments with queued text guidance', async () => {
    const turns = setup();
    const id = await startAgentRun({ ...opts, images: ['original.png'] }, vi.fn());
    await steerAgentRun(id, 'extra guidance', 'extra');
    turns[0].emit({ kind: 'done', sessionId: opts.sessionId }); await flush();
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
    turns[0].emit({ kind: 'done', sessionId: opts.sessionId }); await flush();
    expect(turns).toHaveLength(2);
    expect(turns[1].opts).toMatchObject({ prompt: 'first', sessionId: opts.sessionId, permission: 'readonly' });
    expect(emit.mock.calls.some(([,e]) => e.kind === 'done')).toBe(false);
    turns[1].emit({ kind: 'done' }); await flush();
    expect(turns[2].opts.prompt).toBe('second');
    turns[2].emit({ kind: 'done' }); await flush();
    expect(emit.mock.calls.filter(([,e]) => e.kind === 'done')).toHaveLength(1);
  });
  it('honours explicit Queue even when steering is available, and binds retries to the same intent', async () => {
    const turns = setup(true); const id = await startAgentRun(opts, vi.fn());
    expect(await steerAgentRun(id, 'next', 'one', 'queue')).toBe('queued');
    expect(turns[0].steer).not.toHaveBeenCalled();
    await expect(steerAgentRun(id, 'next', 'one', 'steer')).rejects.toThrow('different message');
    turns[0].emit({ kind: 'done' }); await flush();
    expect(turns[1].opts.prompt).toBe('next');
  });
  it('keeps explicit Steer truthful on unsupported connections', async () => {
    const turns = setup(); const id = await startAgentRun(opts, vi.fn());
    await expect(steerAgentRun(id, 'next', 'one', 'steer')).rejects.toThrow('choose Queue');
    turns[0].emit({ kind: 'done' }); await flush();
    expect(turns).toHaveLength(1);
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
