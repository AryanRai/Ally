import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhysicalTap, type TapAdvertiser } from './physicalTap.js';

describe('physical tap authenticated review protocol', () => {
  const instances: PhysicalTap[] = [];
  afterEach(() => { instances.forEach(s => s.close()); instances.length = 0; vi.useRealTimers(); });
  function setup(selected=vi.fn(()=>({id:'codex:chosen-session',provider:'codex' as const,title:'Chosen PC chat'})),sessions=vi.fn()) {
    let time = 10000;
    let unlocked = true;
    const stop = vi.fn(), feedback = vi.fn();
    let ready: (error?: string) => void = () => {};
    const radio: TapAdvertiser = { start: vi.fn((_beacon, cb) => { ready = cb; return stop; }) };
    const tap = new PhysicalTap(radio, feedback, () => time, () => unlocked,selected,sessions); instances.push(tap);
    const messages: any[] = [];
    const phone = tap.connect('phone', m => messages.push(m),'phone-one');
    const arm = () => { phone.message({ type: 'tap_enable', enabled: true }); ready(); return messages.at(-1); };
    const knock = (target: any, requestId = 'request-123') => phone.message({ ...target, type: 'tap_knock', requestId });
    return { tap, phone, radio, feedback, stop, messages, arm, knock,selected,sessions, lock: () => { unlocked = false; }, ready: (error?: string) => ready(error), advance: (ms: number) => { time += ms; } };
  }
  it('never advertises before phone opt-in, ignores watches, publishes only a public random locator', () => {
    const s = setup(); expect(s.radio.start).not.toHaveBeenCalled();
    s.tap.connect('watch', vi.fn()).message({ type: 'tap_enable', enabled: true });
    expect(s.radio.start).not.toHaveBeenCalled();
    const target = s.arm();
    expect(target.type).toBe('tap_target'); expect(target.nonce).toMatch(/^[a-f0-9]{64}$/);
    expect(s.radio.start).toHaveBeenCalledWith(target.beacon, expect.any(Function));
    expect(target.beacon).toMatch(/^[a-f0-9]{32}$/); expect(target.beacon).not.toBe(target.nonce);
    expect(s.feedback).not.toHaveBeenCalled();
  });
  it('animates only socket-bound fresh hold progress and matching cancellation',()=>{
    const s=setup(),target=s.arm();
    s.phone.message({...target,type:'tap_hold',id:'hold-1234',progress:.5,nonce:'forged'});expect(s.feedback).not.toHaveBeenCalled();
    s.phone.message({...target,type:'tap_hold',id:'hold-1234',progress:.5});expect(s.feedback).toHaveBeenLastCalledWith({id:'hold-1234',phase:'holding',progress:.5});
    s.phone.message({type:'tap_hold',id:'other-123',cancel:true});expect(s.feedback).toHaveBeenCalledTimes(1);
    s.phone.message({type:'tap_hold',id:'hold-1234',cancel:true});expect(s.feedback).toHaveBeenLastCalledWith({id:'hold-1234',phase:'cancelled'});
    s.advance(25001);s.phone.message({...target,type:'tap_hold',id:'hold-1234',progress:1});expect(s.feedback).toHaveBeenCalledTimes(2);
  });
  it('freezes PC selection and requests sessions only after authenticated local review acknowledgment',()=>{
    const s=setup(),t=s.arm();s.phone.message({...t,type:'tap_knock',requestId:'handoff-123',options:{control:true,viewer:true}});
    const review=s.messages.at(-1);expect(review.chat.id).toBe('codex:chosen-session');expect(s.sessions).not.toHaveBeenCalled();
    s.selected.mockReturnValue({id:'codex:changed-session',provider:'codex',title:'Changed'});
    s.phone.message({...review,type:'tap_opened'});expect(s.sessions).toHaveBeenCalledWith('phone-one',expect.objectContaining({id:'codex:chosen-session'}),{control:true,viewer:true},'handoff-123');
    s.phone.message({...review,type:'tap_opened'});expect(s.sessions).toHaveBeenCalledOnce();
  });
  it('binds send animation to review receipt and immutable request; retry remains possible, accepted replay does not',()=>{
    const s=setup(),t=s.arm();s.knock(t);const review=s.messages.at(-1);
    const delivery={type:'tap_delivery',handoffId:review.requestId,nonce:review.reviewNonce,messageId:'message-123'};
    s.phone.message({...delivery,phase:'sending'});expect(s.feedback).not.toHaveBeenCalled();
    s.phone.message({...review,type:'tap_opened'});s.feedback.mockClear();
    s.phone.message({...delivery,nonce:'forged',phase:'sending'});expect(s.feedback).not.toHaveBeenCalled();
    s.phone.message({...delivery,phase:'sending'});s.phone.message({...delivery,phase:'failed'});s.phone.message({...delivery,messageId:'changed-123',phase:'accepted'});
    s.phone.message({...delivery,phase:'sending'});s.phone.message({...delivery,phase:'accepted'});s.phone.message({...delivery,phase:'accepted'});
    expect(s.feedback.mock.calls.map(([v])=>v.phase)).toEqual(['sending','failed','sending','accepted']);
  });
  it('requires current target, authenticated nonce and advertiser readiness', () => {
    const s = setup(), t = s.arm();
    for (const bad of [{ ...t, nonce: undefined }, { ...t, beacon: '0'.repeat(32) }, { ...t, target: 'other-pc' }]) s.knock(bad);
    expect(s.messages.filter(m => m.type === 'tap_review')).toHaveLength(0);
    s.knock(t); expect(s.messages.at(-1).type).toBe('tap_review');
    expect(s.feedback).not.toHaveBeenCalled(); // ack only authorizes local phone review
  });
  it('consumes nonce before review, rejects replay and binds opened feedback to a one-shot review nonce', () => {
    const s = setup(), t = s.arm(); s.knock(t);
    const review = s.messages.at(-1);
    s.knock(t); expect(s.messages.filter(m => m.type === 'tap_review')).toHaveLength(1);
    s.phone.message({ type: 'tap_opened', requestId: review.requestId, reviewNonce: review.reviewNonce });
    expect(s.feedback).toHaveBeenCalledTimes(1);
    s.phone.message({ type: 'tap_opened', requestId: review.requestId, reviewNonce: review.reviewNonce });
    expect(s.feedback).toHaveBeenCalledTimes(1);
  });
  it('cannot use another device socket proof or acknowledge its review', () => {
    const s = setup(), t = s.arm(), otherMessages: any[] = [];
    const other = s.tap.connect('phone', m => otherMessages.push(m));
    other.message({ type: 'tap_enable', enabled: true });
    other.message({ ...t, type: 'tap_knock', requestId: 'other-1234' });
    expect(otherMessages.at(-1).type).toBe('tap_rejected');
    s.knock(t); const review = s.messages.at(-1);
    other.message({ ...review, type: 'tap_opened' }); expect(s.feedback).not.toHaveBeenCalled();
  });
  it('expires target and late review acknowledgements', () => {
    const s = setup(), t = s.arm(); s.advance(25001); s.knock(t);
    expect(s.messages.at(-1).type).toBe('tap_rejected');
    const q = setup(), u = q.arm(); q.knock(u); const review = q.messages.at(-1); q.advance(60001);
    q.phone.message({ ...review, type: 'tap_opened' }); expect(q.feedback).not.toHaveBeenCalled();
  });
  it('allows a local draft-choice receipt through RF rotation while rejecting another use of capture proof', () => {
    vi.useFakeTimers();
    const s=setup(), t=s.arm();s.knock(t);const review=s.messages.at(-1);
    s.advance(28000);vi.advanceTimersByTime(28000);s.ready();
    s.knock(t);expect(s.messages.at(-1).type).toBe('tap_rejected');
    s.phone.message({...review,type:'tap_opened'});expect(s.feedback).toHaveBeenCalledTimes(1);
  });
  it('revokes immediately on desktop lock and refuses review even before the lock event arrives', () => {
    const s = setup(), t = s.arm(); s.lock(); s.knock(t);
    expect(s.messages.at(-1).type).toBe('tap_rejected');
    s.tap.suspend(); expect(s.stop).toHaveBeenCalled();
    const q = setup(), u = q.arm(); q.knock(u); const review = q.messages.at(-1); q.lock();
    q.phone.message({ ...review, type: 'tap_opened' }); expect(q.feedback).not.toHaveBeenCalled();
    const locked = setup(); locked.lock(); locked.arm(); expect(locked.radio.start).not.toHaveBeenCalled();
  });
  it('revokes on opt-out, disconnect and publisher failure; exposes an honest fallback', () => {
    const s = setup(), t = s.arm(); s.ready('Radio unavailable; use manual review'); s.knock(t);
    expect(s.messages.some(m => m.type === 'tap_unavailable')).toBe(true);
    expect(s.messages.at(-1).type).toBe('tap_rejected');
    s.phone.message({ type: 'tap_enable', enabled: false }); expect(s.stop).toHaveBeenCalled();
    s.phone.close(); s.knock(t); expect(s.feedback).not.toHaveBeenCalled();
  });
  it('rotates locator and nonce, enforces cooldown across rearming and ignores stale radio callbacks', () => {
    vi.useFakeTimers();
    const s = setup(), t = s.arm(); s.knock(t);
    s.phone.message({ type: 'tap_enable', enabled: false }); s.phone.message({ type: 'tap_enable', enabled: true }); s.ready();
    const fresh = s.messages.at(-1); expect(fresh.beacon).not.toBe(t.beacon); expect(fresh.nonce).not.toBe(t.nonce);
    s.knock(fresh, 'request-456'); expect(s.messages.at(-1).type).toBe('tap_rejected');
    s.advance(5000); s.knock(fresh, 'request-789'); expect(s.messages.at(-1).type).toBe('tap_review');
    s.advance(28000); vi.advanceTimersByTime(28000); s.ready();
    expect(s.messages.at(-1).beacon).not.toBe(fresh.beacon);
    s.knock(t); expect(s.messages.at(-1).type).toBe('tap_rejected');
  });
});
