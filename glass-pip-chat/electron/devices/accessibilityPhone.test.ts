import { describe, expect, it, vi } from 'vitest';
import { DeviceHub } from './hub';
import { AdbPhone } from './adb';
import { PhoneControl } from './phoneControl';

// Node's timers/promises is otherwise independent of Vitest's virtual clock.
vi.mock('node:timers/promises', () => {
  const delay = (ms: number, value: unknown, options: { signal?: AbortSignal } = {}) => new Promise((resolve, reject) => {
    const signal = options.signal;
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(Error('Cancelled')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(value); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
  return { setTimeout: delay, default: { setTimeout: delay } };
});

const screen = (extra = '') => `<hierarchy rotation="0"><node text="Notes" resource-id="" class="android.widget.FrameLayout" package="com.example.notes" content-desc="" password="false" bounds="[0,0][1080,2400]">${extra}<node text="New note" resource-id="" class="android.widget.Button" package="com.example.notes" content-desc="" password="false" bounds="[0,100][540,300]"/></node></hierarchy>`;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture(options: { enabled?: boolean; xml?: string } = {}) {
  let onPerform: (() => void) | undefined;
  const hub = new DeviceHub(vi.fn());
  const calls: { method: string; params: any }[] = [];
  const commands: any[] = [];
  let xml = options.xml ?? screen();
  const send = vi.fn((message: any) => {
    if (message.type === 'command') { commands.push(message.command); return; }
    if (message.type !== 'control_call') return;
    calls.push({ method: message.method, params: message.params });
    queueMicrotask(() => {
      const reply = (result: Record<string, unknown>) => hub.callResult('phone-one', { id: message.id, ok: true, result });
      if (message.method === 'control.status') reply({ enabled: options.enabled ?? true });
      else if (message.method === 'control.view') reply({ xml, width: 1080, height: 2400 });
      else if (message.method === 'control.screenshot') reply({ mimeType: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64'), scale: 1 });
      else { if (message.method === 'control.perform') onPerform?.(); reply({}); }
    });
  });
  const disconnect = hub.connect('phone-one', 'phone', send, ['on-device-control']);
  const adb = { list: vi.fn(async () => []) } as unknown as AdbPhone;
  const control = new PhoneControl(hub, adb);
  const approve = async () => { await flush(); const id = commands.at(-1).id; hub.receipt('phone-one', { id, status: 'approved' }); hub.receipt('phone-one', { id, status: 'done' }); };
  return { hub, control, calls, commands, approve, disconnect, setXml: (next: string) => { xml = next; }, afterPerform: (run: () => void) => { onPerform = run; } };
}
const base = { chatId: 'codex:session-1234', deviceId: 'phone-one', operations: [] as unknown[] };

describe('on-device phone control sessions', () => {
  it('waits for the post-unlock SystemUI tree to become an app before inspection or capture', async () => {
    vi.useFakeTimers();
    const f = fixture({ xml: screen().replaceAll('com.example.notes', 'com.android.systemui') });
    try {
      const pending = f.control.execute({ ...base, requestId: 'unlock-race-0001', screenshot: true });
      await vi.advanceTimersByTimeAsync(0); await f.approve();
      await vi.advanceTimersByTimeAsync(6000);
      expect(f.control.history()[0]).toMatchObject({ state: 'running', completedOperations: 0 });
      expect(f.calls.some(c => c.method === 'control.screenshot' || c.method === 'control.perform')).toBe(false);
      f.setXml(screen()); await vi.advanceTimersByTimeAsync(1000);
      const result = await pending;
      expect(result.isError).toBeUndefined();
      expect(result.content.some(c => c.type === 'image')).toBe(true);
      expect(f.commands).toHaveLength(1);
    } finally { f.control.close(); f.hub.close(); vi.useRealTimers(); }
  });
  it.each(['timeout', 'cancel'] as const)('ends an unlock wait on %s without input or screenshot', async reason => {
    vi.useFakeTimers();
    const f = fixture({ xml: screen().replaceAll('com.example.notes', 'com.android.systemui') });
    try {
      const pending = f.control.execute({ ...base, requestId: 'unlock-ended-0001', screenshot: true });
      await vi.advanceTimersByTimeAsync(0); await f.approve(); await vi.advanceTimersByTimeAsync(2000);
      if (reason === 'cancel') f.control.cancel('unlock-ended-0001');
      else await vi.advanceTimersByTimeAsync(90000);
      expect((await pending).isError).toBe(true);
      expect(f.calls.some(c => c.method === 'control.perform' || c.method === 'control.screenshot')).toBe(false);
    } finally { f.control.close(); f.hub.close(); vi.useRealTimers(); }
  });
  it('does not retry a protected-app refusal as if it were a transient unlock screen', async () => {
    vi.useFakeTimers();
    const f = fixture({ xml: screen().replaceAll('com.example.notes', 'com.android.permissioncontroller') });
    try {
      const pending = f.control.execute({ ...base, requestId: 'unlock-protected-0001' });
      await vi.advanceTimersByTimeAsync(0); await f.approve(); await vi.advanceTimersByTimeAsync(1000);
      expect((await pending).isError).toBe(true);
      expect(f.calls.filter(c => c.method === 'control.view')).toHaveLength(1);
      expect(f.control.history()[0].message).toContain('Protected app');
    } finally { f.control.close(); f.hub.close(); vi.useRealTimers(); }
  });
  it('handoff requests a bounded grant without reading or operating the screen',async()=>{
    const f=fixture();const signal=new AbortController().signal;
    const pending=f.control.requestSession('phone-one','codex:session-1234',signal);await f.approve();
    const grant=await pending;
    expect(grant.expiresAt-Date.now()).toBeGreaterThan(899000);
    expect(f.calls.map(c=>c.method)).toEqual(['control.status','control.grant']);
    expect(await f.control.requestSession('phone-one','codex:session-1234',signal)).toEqual(grant);
    expect(f.commands).toHaveLength(1);f.control.close();f.hub.close();
  });
  it('handoff refusal creates no control grant and never reads a screen',async()=>{
    const f=fixture();const pending=f.control.requestSession('phone-one','codex:session-1234',new AbortController().signal);
    const rejected=expect(pending).rejects.toThrow('Declined');await flush();
    f.hub.receipt('phone-one',{id:f.commands.at(-1).id,status:'rejected'});await rejected;
    expect(f.calls.map(c=>c.method)).toEqual(['control.status']);f.control.close();f.hub.close();
  });
  it('asks once, then runs later plans in the same session without asking', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const first = f.control.execute({ ...base, requestId: 'inspect-0001' });
    await vi.advanceTimersByTimeAsync(0); await f.approve(); await vi.advanceTimersByTimeAsync(1000);
    const result = await first;
    expect(result.isError).toBeUndefined();
    expect(f.commands).toHaveLength(1);
    expect(f.commands[0].title).toContain('15 min');
    const grant = f.calls.find(c => c.method === 'control.grant')!.params;
    expect(grant.chatId).toBe('codex:session-1234');
    const revision = JSON.parse((result.content[0] as { text: string }).text).revision;

    const second = f.control.execute({ ...base, requestId: 'tap-new-0002', expectedRevision: revision, operations: [{ type: 'tap', x: 100, y: 150 }, { type: 'text', text: 'Café ✓' }], screenshot: true });
    await vi.advanceTimersByTimeAsync(2000);
    const out = await second;
    expect(out.isError).toBeUndefined();
    expect(f.commands).toHaveLength(1);
    const performed = f.calls.filter(c => c.method === 'control.perform');
    expect(performed.map(c => c.params.operation.type)).toEqual(['tap', 'text']);
    expect(performed.every(c => c.params.grantId === grant.grantId)).toBe(true);
    expect(out.content.some(c => c.type === 'image' && c.mimeType === 'image/jpeg')).toBe(true);
    f.hub.close(); vi.useRealTimers();
  });

  it('a Stop on the phone cancels the session and the next request asks again', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const first = f.control.execute({ ...base, requestId: 'inspect-0003' });
    await vi.advanceTimersByTimeAsync(0); await f.approve(); await vi.advanceTimersByTimeAsync(1000); await first;
    const grantId = f.calls.find(c => c.method === 'control.grant')!.params.grantId;
    f.hub.revoked('phone-one', { grantId, reason: 'Stopped on the phone.' });
    const again = f.control.execute({ ...base, requestId: 'inspect-0004' });
    await vi.advanceTimersByTimeAsync(0); await flush();
    expect(f.commands).toHaveLength(2);
    expect(f.control.cancel('inspect-0004')).toBe(true); await again;
    f.hub.close(); vi.useRealTimers();
  });

  it('refuses sensitive screens and protected buttons without delivering input', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const first = f.control.execute({ ...base, requestId: 'inspect-0005' });
    await vi.advanceTimersByTimeAsync(0); await f.approve(); await vi.advanceTimersByTimeAsync(1000);
    const revision = JSON.parse(((await first).content[0] as { text: string }).text).revision;
    f.setXml(screen('<node text="Send" class="android.widget.Button" package="com.example.notes" content-desc="" password="false" bounds="[600,2200][1000,2380]"/>'));
    const inspect = await f.control.execute({ ...base, requestId: 'inspect-0006' });
    const sendRevision = JSON.parse((inspect.content[0] as { text: string }).text).revision;
    expect(sendRevision).not.toBe(revision);
    const tap = await f.control.execute({ ...base, requestId: 'tap-send-0007', expectedRevision: sendRevision, operations: [{ type: 'tap', x: 700, y: 2300 }] });
    expect(tap.isError).toBe(true);
    expect(JSON.stringify(f.control.history('tap-send-0007'))).toContain('Protected control');
    f.setXml(screen('<node text="" class="android.widget.EditText" package="com.example.notes" content-desc="" password="true" bounds="[0,400][1080,500]"/>'));
    const secret = await f.control.execute({ ...base, requestId: 'inspect-0008' });
    expect(secret.isError).toBe(true);
    expect(f.calls.filter(c => c.method === 'control.perform')).toHaveLength(0);
    f.hub.close(); vi.useRealTimers();
  });

  it('asks the user to turn on Ally control before requesting any approval', async () => {
    const f = fixture({ enabled: false });
    const result = await f.control.execute({ ...base, requestId: 'inspect-0009' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(f.control.history('inspect-0009'))).toContain('Accessibility');
    expect(f.commands).toHaveLength(0);
    f.hub.close();
  });

  it('requires the originating chat and refuses an ADB-only text set on device', async () => {
    const f = fixture();
    await expect(f.control.execute({ deviceId: 'phone-one', operations: [], requestId: 'inspect-0010' })).rejects.toThrow('chatId');
    await expect(f.control.execute({ ...base, requestId: 'tap-ctrl-0011', expectedRevision: 'a'.repeat(64), operations: [{ type: 'text', text: 'bad\u0007' }] })).rejects.toThrow('Unsupported operation');
    f.hub.close();
  });

  it('waits out an app launch animation instead of reporting a lock screen', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const first = f.control.execute({ ...base, requestId: 'inspect-0012' });
    await vi.advanceTimersByTimeAsync(0); await f.approve(); await vi.advanceTimersByTimeAsync(1000);
    const revision = JSON.parse(((await first).content[0] as { text: string }).text).revision;
    const systemOnly = '<hierarchy rotation="0"><node text="" class="android.widget.FrameLayout" package="com.android.systemui" content-desc="" password="false" bounds="[0,0][1080,136]"/></hierarchy>';
    f.afterPerform(() => f.setXml(systemOnly));
    const open = f.control.execute({ ...base, requestId: 'open-calc-0013', expectedRevision: revision, operations: [{ type: 'open_app', packageName: 'com.google.android.calculator' }] });
    await vi.advanceTimersByTimeAsync(400);
    f.setXml(screen());
    await vi.advanceTimersByTimeAsync(1500);
    expect((await open).isError).toBeUndefined();
    f.afterPerform(() => f.setXml(systemOnly));
    const locked = f.control.execute({ ...base, requestId: 'open-calc-0014', expectedRevision: revision, operations: [{ type: 'open_app', packageName: 'com.google.android.calculator' }] });
    await vi.advanceTimersByTimeAsync(4000);
    expect((await locked).isError).toBe(true);
    f.hub.close(); vi.useRealTimers();
  });

  it('waits for the user to unlock before reading or acting, and runs nothing if it stays locked', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const first = f.control.execute({ ...base, requestId: 'inspect-0015' });
    await vi.advanceTimersByTimeAsync(0); await f.approve(); await vi.advanceTimersByTimeAsync(1000); await first;
    // Locked: the phone holds control.ready open until the user unlocks.
    let unlock!: () => void;
    const original = f.hub.call.bind(f.hub);
    f.hub.call = ((deviceId: string, method: string, params: Record<string, unknown>, signal?: AbortSignal, timeout?: number) => method === 'control.ready'
      ? new Promise<Record<string, unknown>>(resolve => { unlock = () => resolve({ ready: true }); }) : original(deviceId, method, params, signal, timeout)) as typeof f.hub.call;
    const waiting = f.control.execute({ ...base, requestId: 'inspect-0016' });
    await vi.advanceTimersByTimeAsync(30_000);
    const viewsBefore = f.calls.filter(c => c.method === 'control.view').length;
    unlock(); await vi.advanceTimersByTimeAsync(1000);
    expect((await waiting).isError).toBeUndefined();
    expect(f.calls.filter(c => c.method === 'control.view').length).toBe(viewsBefore + 1);
    f.hub.call = ((deviceId: string, method: string, params: Record<string, unknown>, signal?: AbortSignal, timeout?: number) => method === 'control.ready'
      ? Promise.reject(new Error('The phone stayed locked, so Ally didn’t continue.')) : original(deviceId, method, params, signal, timeout)) as typeof f.hub.call;
    const locked = await f.control.execute({ ...base, requestId: 'inspect-0017' });
    expect(locked.isError).toBe(true);
    expect(JSON.stringify(f.control.history('inspect-0017'))).toContain('stayed locked');
    f.hub.close(); vi.useRealTimers();
  });

  it('fails pending phone calls when the phone disconnects', async () => {
    const hub = new DeviceHub(vi.fn());
    const disconnect = hub.connect('phone-one', 'phone', vi.fn(), ['on-device-control']);
    const call = hub.call('phone-one', 'control.view', {});
    disconnect();
    await expect(call).rejects.toThrow('disconnected');
    hub.close();
  });
});
