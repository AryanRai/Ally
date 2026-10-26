import { describe, expect, it, vi } from 'vitest';
import { DeviceHub } from './hub';
import { AdbPhone } from './adb';
import { PhoneControl } from './phoneControl';

const screen = (extra = '') => `<hierarchy rotation="0"><node text="Notes" resource-id="" class="android.widget.FrameLayout" package="com.example.notes" content-desc="" password="false" bounds="[0,0][1080,2400]">${extra}<node text="New note" resource-id="" class="android.widget.Button" package="com.example.notes" content-desc="" password="false" bounds="[0,100][540,300]"/></node></hierarchy>`;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture(options: { enabled?: boolean; xml?: string } = {}) {
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
      else reply({});
    });
  });
  const disconnect = hub.connect('phone-one', 'phone', send, ['on-device-control']);
  const adb = { list: vi.fn(async () => []) } as unknown as AdbPhone;
  const control = new PhoneControl(hub, adb);
  const approve = async () => { await flush(); const id = commands.at(-1).id; hub.receipt('phone-one', { id, status: 'approved' }); hub.receipt('phone-one', { id, status: 'done' }); };
  return { hub, control, calls, commands, approve, disconnect, setXml: (next: string) => { xml = next; } };
}
const base = { chatId: 'codex:session-1234', deviceId: 'phone-one', operations: [] as unknown[] };

describe('on-device phone control sessions', () => {
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

  it('fails pending phone calls when the phone disconnects', async () => {
    const hub = new DeviceHub(vi.fn());
    const disconnect = hub.connect('phone-one', 'phone', vi.fn(), ['on-device-control']);
    const call = hub.call('phone-one', 'control.view', {});
    disconnect();
    await expect(call).rejects.toThrow('disconnected');
    hub.close();
  });
});
