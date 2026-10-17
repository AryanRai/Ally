import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveUtterance } from './liveVoice';
let receive: (event: any) => void;
let detach: ReturnType<typeof vi.fn>;
describe('live voice fallback and stale recording protection', () => {
  beforeEach(() => {
    detach = vi.fn();
    window.pip.speech = { onLiveEvent: (fn: typeof receive) => { receive = fn; return detach; }, liveStart: vi.fn(), liveAudio: vi.fn(), liveEnd: vi.fn() } as any;
  });
  it('does not send a partial or duplicate completed transcript', () => {
    const complete = vi.fn(); const fallback = vi.fn(); const preview = vi.fn();
    const turn = new LiveUtterance(preview, complete, fallback);
    receive({ id: turn.id, type: 'transcript', text: 'draft' });
    expect(complete).not.toHaveBeenCalled();
    turn.finish(new Uint8Array(44));
    receive({ id: turn.id, type: 'complete', text: 'Final words' }); receive({ id: turn.id, type: 'complete', text: 'Final words' });
    expect(complete).toHaveBeenCalledExactlyOnceWith('Final words'); expect(fallback).not.toHaveBeenCalled(); expect(detach).toHaveBeenCalledTimes(1);
  });
  it('uses the complete saved recording after a failed stream', () => {
    const fallback = vi.fn(); const turn = new LiveUtterance(vi.fn(), vi.fn(), fallback);
    receive({ id: turn.id, type: 'error' }); expect(fallback).not.toHaveBeenCalled();
    const bytes = new Uint8Array(90); turn.finish(bytes); expect(fallback).toHaveBeenCalledExactlyOnceWith(bytes);
  });
  it('cancelled or other-chat transcripts cannot submit a message', () => {
    const complete = vi.fn(); const turn = new LiveUtterance(vi.fn(), complete, vi.fn());
    receive({ id: 'other', type: 'complete', text: 'wrong chat' }); turn.finish(new Uint8Array(44)); turn.cancel();
    receive({ id: turn.id, type: 'complete', text: 'stale' }); expect(complete).not.toHaveBeenCalled();
  });
});
