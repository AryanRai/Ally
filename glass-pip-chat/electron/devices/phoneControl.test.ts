import { afterEach, describe, it, expect, vi } from 'vitest';
import { DeviceHub } from './hub';
import { AdbPhone } from './adb';
import { PhoneControl } from './phoneControl';

afterEach(() => vi.useRealTimers());
const revision = 'a'.repeat(64);
function fixture(identity = 'phone-one') {
  const send = vi.fn(); const hub = new DeviceHub(vi.fn()); const disconnect = hub.connect('phone-one', 'phone', send);
  const adb = { identity: vi.fn(async () => identity), view: vi.fn(async () => ({ revision, ui: '<hierarchy/>', width: 100, height: 200 })), perform: vi.fn(async () => {}), screenshot: vi.fn(async () => 'png') } as unknown as AdbPhone;
  const control = new PhoneControl(hub, adb);
  const args = { chatId: 'codex:session-1234', requestId: 'request-123', serial: 'usb-1234', deviceId: 'phone-one', operations: [] };
  const receipt = (status: string) => hub.receipt('phone-one', { id: send.mock.calls[0][0].command.id, status });
  return { send, hub, disconnect, adb, control, args, receipt };
}
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
describe('phone control consent and lifecycle', () => {
  it('one prompt grant closes control and viewer at prompt end',async()=>{
    const f=fixture();const prompt=new AbortController();
    const pending=f.control.execute({...f.args,sessionScope:'prompt'},f.args.chatId,undefined,prompt.signal);
    await flush();expect(f.send.mock.calls[0][0].command.body).toContain('this prompt only');
    f.receipt('approved');f.receipt('done');const result=await pending;
    expect(result.isError).toBeUndefined();expect(JSON.parse(result.content[0].text!).sessionScope).toBe('prompt');
    const preview=f.control.sessionSignal('phone-one',f.args.chatId)!;expect(preview.aborted).toBe(false);
    prompt.abort();expect(preview.aborted).toBe(true);expect(f.control.sessionSignal('phone-one',f.args.chatId)).toBeUndefined();f.control.close();f.hub.close();
  });
  it('explicit timed approval survives a prompt ending; unknown prompt scope fails before screen access',async()=>{
    const f=fixture();const prompt=new AbortController();
    const pending=f.control.execute({...f.args,sessionMinutes:3},f.args.chatId,undefined,prompt.signal);
    await flush();expect(f.send.mock.calls[0][0].command.body).toContain('3 minutes');
    f.receipt('approved');f.receipt('done');await pending;prompt.abort();
    expect(f.control.sessionSignal('phone-one',f.args.chatId)?.aborted).toBe(false);f.control.close();f.hub.close();
    const g=fixture();await expect(g.control.execute({...g.args,sessionScope:'prompt'})).rejects.toThrow('exact active');expect(g.adb.view).not.toHaveBeenCalled();g.control.close();g.hub.close();
  });
  it('viewer lifetime exists only after approval and aborts on control end',async()=>{
    const f=fixture();expect(f.control.sessionSignal('phone-one',f.args.chatId)).toBeUndefined();
    const pending=f.control.execute(f.args);await flush();f.receipt('approved');f.receipt('done');await pending;
    const signal=f.control.sessionSignal('phone-one',f.args.chatId);expect(signal?.aborted).toBe(false);
    f.control.endSession('phone-one',f.args.chatId);expect(signal?.aborted).toBe(true);f.control.close();f.hub.close();
  });
  it('does not read a screen until both approval and native consent completion', async () => {
    const f = fixture(); const result = f.control.execute(f.args); await flush();
    expect(f.adb.view).not.toHaveBeenCalled(); f.receipt('received'); expect(f.adb.view).not.toHaveBeenCalled();
    f.receipt('approved'); expect(f.adb.view).not.toHaveBeenCalled(); f.receipt('done');
    expect((await result).isError).toBeUndefined(); expect(f.adb.view).toHaveBeenCalledOnce();
    expect(f.control.history()[0].state).toBe('completed'); f.hub.close();
  });
  it('refuses a completion receipt without approval', async () => {
    const f = fixture(); const result = f.control.execute(f.args); await flush(); f.receipt('done');
    expect((await result).isError).toBe(true); expect(f.adb.view).not.toHaveBeenCalled(); f.hub.close();
  });
  it('refuses wrong-device identity before asking for approval', async () => {
    const f = fixture('other-phone'); expect((await f.control.execute(f.args)).isError).toBe(true);
    expect(f.send).not.toHaveBeenCalled(); expect(f.adb.view).not.toHaveBeenCalled(); f.hub.close();
  });
  it('cancels pending approval and ignores late approval receipts', async () => {
    const f = fixture(); const result = f.control.execute(f.args); await flush();
    expect(f.control.cancel(f.args.requestId)).toBe(true); f.receipt('approved'); f.receipt('done');
    expect((await result).isError).toBe(true); expect(f.adb.view).not.toHaveBeenCalled(); expect(f.control.history()[0].state).toBe('cancelled'); f.hub.close();
  });
  it('does not replay an id and rejects a changed parameter binding', async () => {
    const f = fixture(); const result = f.control.execute(f.args); await flush(); f.receipt('rejected'); await result;
    await f.control.execute(f.args); expect(f.send).toHaveBeenCalledTimes(1);
    await expect(f.control.execute({ ...f.args, screenshot: true })).rejects.toThrow('different parameters'); f.hub.close();
  });
  it('cancels on disconnect and does not revive on reconnect', async () => {
    const f = fixture(); const result = f.control.execute(f.args); await flush(); f.disconnect(); f.hub.connect('phone-one', 'phone', vi.fn());
    expect((await result).isError).toBe(true); expect(f.adb.view).not.toHaveBeenCalled(); f.hub.close();
  });
  it('rejects stale revisions without delivering input', async () => {
    const f = fixture(); const result = f.control.execute({ ...f.args, expectedRevision: 'b'.repeat(64), operations: [{ type: 'tap', x: 5, y: 5 }] }); await flush(); f.receipt('approved'); f.receipt('done');
    expect((await result).isError).toBe(true); expect(f.adb.perform).not.toHaveBeenCalled(); f.hub.close();
  });
  it('reports partial completion honestly and never retains UI/text in audit', async () => {
    vi.useFakeTimers(); const f = fixture(); vi.mocked(f.adb.view).mockResolvedValueOnce({ revision, ui: '<hierarchy/>', width: 100, height: 200 }).mockRejectedValueOnce(Error('Sensitive screen'));
    const result = f.control.execute({ ...f.args, expectedRevision: revision, operations: [{ type: 'text', text: 'private note' }] }); await flush(); f.receipt('approved'); f.receipt('done');
    await vi.advanceTimersByTimeAsync(1100); expect((await result).isError).toBe(true);
    expect(f.control.history()[0]).toMatchObject({ state: 'failed', completedOperations: 1 }); expect(JSON.stringify(f.control.history())).not.toContain('private note'); f.hub.close();
  });
  it('expires unanswered approval without screen capture or input', async () => {
    vi.useFakeTimers(); const f = fixture(); const result = f.control.execute(f.args); await flush(); await vi.advanceTimersByTimeAsync(120001);
    expect((await result).isError).toBe(true); expect(f.adb.view).not.toHaveBeenCalled(); expect(f.adb.perform).not.toHaveBeenCalled(); f.hub.close();
  });
  it('withholds a screenshot while the UI keeps changing during capture', async () => {
    const f = fixture(); let n = 0; vi.mocked(f.adb.view).mockImplementation(async () => ({ revision: `r${n++}`, ui: '<hierarchy/>', width: 100, height: 200 }));
    const result = f.control.execute({ ...f.args, screenshot: true }); await flush(); f.receipt('approved'); f.receipt('done');
    const output = await result; expect(output.isError).toBe(true); expect(output.content.every(item => item.type === 'text')).toBe(true); f.hub.close();
  });
  it('returns a screenshot with the matching UI once a brief animation settles', async () => {
    const f = fixture(); vi.mocked(f.adb.view).mockResolvedValueOnce({ revision, ui: '<hierarchy/>', width: 100, height: 200 }).mockResolvedValueOnce({ revision: 'animating', ui: '<hierarchy/>', width: 100, height: 200 })
      .mockResolvedValue({ revision: 'settled', ui: '<hierarchy settled="1"/>', width: 100, height: 200 });
    const result = f.control.execute({ ...f.args, screenshot: true }); await flush(); f.receipt('approved'); f.receipt('done');
    const output = await result; expect(output.isError).toBeUndefined();
    expect(JSON.parse((output.content[0] as { text: string }).text).revision).toBe('settled');
    expect(output.content.some(item => item.type === 'image')).toBe(true); f.hub.close();
  });
  it('stops an in-flight operation on disconnect and marks delivery uncertain', async () => {
    const f = fixture(); let started!: () => void; const performing = new Promise<void>(resolve => { started = resolve; });
    vi.mocked(f.adb.perform).mockImplementation(async (_serial, _operation, _view, signal) => new Promise((_resolve, reject) => { signal!.addEventListener('abort', () => reject(Error('Cancelled')), { once: true }); started(); }));
    const result = f.control.execute({ ...f.args, expectedRevision: revision, operations: [{ type: 'tap', x: 5, y: 5 }, { type: 'tap', x: 6, y: 6 }] }); await flush(); f.receipt('approved'); f.receipt('done');
    await performing;
    expect(f.adb.perform).toHaveBeenCalledOnce(); f.disconnect(); await result;
    expect(f.control.history()[0]).toMatchObject({ state: 'cancelled', completedOperations: 0, inFlightOperation: 1, deliveryUncertain: true }); f.hub.close();
  });
});
