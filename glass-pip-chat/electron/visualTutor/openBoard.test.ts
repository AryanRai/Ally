import { describe, expect, it, vi } from 'vitest';
import { DrawingOpener, drawingOwner, requireDrawingOwner } from './openBoard';
import type { TutorBoard } from './types';

const owner = 'codex:chat-one';
const board = (): TutorBoard => ({ id: 'board', chatId: owner, sessionKey: owner, displayId: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, capturedAt: 0, steps: [], sketches: [], selected: 0, following: true, sketching: false, frozen: false, revision: 0 });
function setup() {
  let current: TutorBoard | null = null;
  const open = vi.fn(async (_owner: string, capture: boolean) => { current ??= board(); return { board: current, ...(capture ? { image: 'png' } : {}) }; });
  return { open, opener: new DrawingOpener(() => current, open), current: () => current, set: (value: TutorBoard | null) => { current = value; } };
}
describe('ordinary chat drawing entry', () => {
  it('opens without capture or global selected-chat dependence and reuses a board across surfaces', async () => {
    const s = setup();
    for (const surface of ['phone', 'pill', 'full', 'notch']) {
      const result = await s.opener.start({ requestId: surface }, owner);
      expect(result.board.id).toBe('board'); expect(result.image).toBeUndefined();
    }
    expect(s.open).toHaveBeenCalledWith(owner, false, undefined);
    expect(s.current()?.capturedAt).toBe(0);
  });
  it('captures only explicitly and retries do not capture again or resurrect a closed board', async () => {
    const s = setup(), args = { requestId: 'screen', capture: true };
    expect((await s.opener.start(args, owner)).image).toBe('png');
    await s.opener.start(args, owner); expect(s.open).toHaveBeenCalledTimes(1);
    await expect(s.opener.start({ ...args, capture: false }, owner)).rejects.toThrow('changed');
    s.set(null); await expect(s.opener.start(args, owner)).rejects.toThrow('closed');
    expect(s.open).toHaveBeenCalledTimes(1);
  });
  it('rejects cross-chat replacement, caller spoofing and accidental display moves', async () => {
    const s = setup(); await s.opener.start({ requestId: 'first' }, owner);
    await expect(s.opener.start({ requestId: 'other' }, 'claude:other')).rejects.toThrow('another chat');
    await expect(s.opener.start({ requestId: 'move', displayId: 2 }, owner)).rejects.toThrow('changing');
    expect(() => drawingOwner(owner, 'claude:other')).toThrow('originating');
    expect(() => requireDrawingOwner(board(), 'claude:other')).toThrow('another chat');
    expect(drawingOwner(undefined, owner)).toBe(owner);
    expect(() => drawingOwner()).toThrow('provider:sessionId');
    expect(s.open).toHaveBeenCalledTimes(1);
  });
  it('serializes concurrent opening/capture and allows retry after failure', async () => {
    let release!: () => void;
    const open = vi.fn(async () => { await new Promise<void>(resolve => { release = resolve; }); return { board: board() }; });
    const opener = new DrawingOpener(() => null, open);
    const pending = opener.start({ requestId: 'first' }, owner);
    await expect(opener.start({ requestId: 'second' }, owner)).rejects.toThrow('opening');
    release(); await pending; expect(open).toHaveBeenCalledTimes(1);
    const failing = new DrawingOpener(() => null, vi.fn().mockRejectedValueOnce(Error('capture denied')).mockResolvedValue({ board: board() }));
    await expect(failing.start({ requestId: 'retry' }, owner)).rejects.toThrow('denied');
    await expect(failing.start({ requestId: 'retry' }, owner)).resolves.toHaveProperty('board.id', 'board');
  });
});
