import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceHub } from './hub';

describe('device delivery and approval boundaries', () => {
  afterEach(() => vi.useRealTimers());
  it('never mistakes delivery or a different device for approval', async () => {
    const hub = new DeviceHub(vi.fn()); const send = vi.fn();
    hub.connect('phone-one', 'phone', send); hub.connect('watch-one', 'watch', vi.fn());
    const result = hub.command('phone', 'phone_notify', {}); const id = send.mock.calls[0][0].command.id;
    hub.receipt('watch-one', { id, status: 'approved' }); hub.receipt('phone-one', { id, status: 'received' });
    hub.receipt('phone-one', { id, status: 'done' });
    expect((await result).ok).toBe(false); hub.close();
  });
  it('distinguishes a system-app handoff from completing its action', async () => {
    const hub = new DeviceHub(vi.fn()); const send = vi.fn(); hub.connect('phone-one', 'phone', send);
    const result = hub.command('phone', 'phone_set_timer', { seconds: 60 }); const id = send.mock.calls[0][0].command.id;
    hub.receipt('phone-one', { id, status: 'approved' }); hub.receipt('phone-one', { id, status: 'handed_off' });
    expect(await result).toEqual({ ok: true, message: expect.stringContaining('not verified') }); hub.close();
  });
  it('expires requests without execution, and never replays commands', async () => {
    vi.useFakeTimers(); const hub = new DeviceHub(vi.fn()); const send = vi.fn();
    const disconnect = hub.connect('phone-one', 'phone', send);
    const result = hub.command('phone', 'phone_notify', {}); vi.advanceTimersByTime(120001);
    expect((await result).ok).toBe(false); disconnect(); send.mockClear(); hub.connect('phone-one', 'phone', send);
    expect(send).not.toHaveBeenCalled(); hub.close();
  });
  it('fails a pending control when the device disconnects', async () => {
    const hub = new DeviceHub(vi.fn()); const disconnect = hub.connect('phone-one', 'phone', vi.fn());
    const result = hub.command('phone', 'phone_notify', {}); disconnect(); expect((await result).ok).toBe(false); hub.close();
  });
  it('replays unseen cards, deduplicates receipts and propagates dismissals', () => {
    const dismiss = vi.fn(); const hub = new DeviceHub(dismiss); const send = vi.fn();
    hub.publish('phone', { id: 'card', title: 'Note', body: 'Hello' });
    const disconnect = hub.connect('phone-one', 'phone', send); expect(send).toHaveBeenCalledTimes(1);
    hub.receipt('phone-one', { id: 'card', status: 'received' }); disconnect(); hub.connect('phone-one', 'phone', send);
    expect(send).toHaveBeenCalledTimes(1); hub.receipt('phone-one', { id: 'card', status: 'dismissed' }); expect(dismiss).toHaveBeenCalledWith('card'); hub.close();
  });
  it('isolates failed sockets and allows a failed replay to reconnect', () => {
    const hub = new DeviceHub(vi.fn()); const send = vi.fn();
    hub.connect('phone-bad', 'phone', () => { throw Error('offline'); }); hub.connect('phone-good', 'phone', send);
    hub.publish('phone', { id: 'card', title: 'Note', body: 'Hello' }); expect(send).toHaveBeenCalledTimes(1);
    expect(() => hub.connect('phone-new', 'phone', () => { throw Error(); })).toThrow();
    expect(() => hub.connect('phone-new', 'phone', send)).not.toThrow(); hub.close();
  });
  it('requires an explicit target for multiple phones and validates action payloads', async () => {
    const hub = new DeviceHub(vi.fn()); const send = vi.fn(); hub.connect('phone-one', 'phone', send); hub.connect('phone-two', 'phone', send);
    expect((await hub.command('phone', 'phone_notify', {})).ok).toBe(false);
    expect((await hub.command('phone', 'phone_open_url', { deviceId: 'phone-one', url: 'https://user:pass@example.com' })).ok).toBe(false);
    expect((await hub.command('phone', 'phone_set_timer', { deviceId: 'phone-one', seconds: -1 })).ok).toBe(false);
    expect(send).not.toHaveBeenCalled(); hub.close();
  });
});
