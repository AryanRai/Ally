// @vitest-environment node
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../chatsMcp/index.js', () => ({ registerDeviceTool: vi.fn() }));
import type { DeviceToolSpec } from '../chatsMcp/index.js';
import { DeviceHub } from './hub.js';
import { InteractionBroker } from './interactions.js';
import { registerScrcpyViewer } from './scrcpyViewerTools.js';

const args = { requestId: 'viewer-test-1', deviceId: 'phone-one', serial: 'test-serial' };
const caller = 'codex:session-1234';
const cleanups: (() => void)[] = [];
function setup(executable = true) {
  const tools = new Map<string, DeviceToolSpec>(), hub = new DeviceHub(vi.fn());
  const disconnect = hub.connect(args.deviceId, 'phone', vi.fn());
  const broker = new InteractionBroker(vi.fn());
  const child = Object.assign(new EventEmitter(), { kill: vi.fn(() => true) }) as unknown as ChildProcess;
  const spawn = vi.fn(() => child), identity = vi.fn(async () => args.deviceId);
  const stop = registerScrcpyViewer(hub, {
    register: tool => { tools.set(tool.name, tool); return () => { tools.delete(tool.name); }; }, broker,
    executable: () => executable ? process.platform === 'win32' ? 'C:\\tools\\scrcpy.exe' : '/tools/scrcpy' : undefined,
    identity, spawn,list:async()=>[{serial:args.serial,model:'Synthetic',transport:'authorized-adb'}],
  });
  cleanups.push(() => { stop(); child.emit('exit', 0); broker.closeAll(); hub.close(); });
  const signal = new AbortController();
  const invoke = (name: string, input: Record<string, unknown> = args, chat = caller) => tools.get(name)!.handler(input, { caller: chat, signal: signal.signal });
  const accept = async () => {
    await vi.waitFor(() => expect(broker.list()).toHaveLength(1));
    const pending = broker.list()[0]; broker.answer(pending.id, { action: 'accept' }, 'watch'); return pending;
  };
  return { tools, hub, broker, child, spawn, identity, signal, stop, disconnect, invoke, accept };
}
afterEach(() => cleanups.splice(0).forEach(clean => clean()));

describe('viewer MCP integration', () => {
  it('auto-discovers an exact phone identity and retains separate raw-view consent',async()=>{
    const f=setup();const {serial:_serial,...withoutSerial}=args;
    const pending=f.invoke('phone_viewer_start',withoutSerial);await vi.waitFor(()=>expect(f.broker.list()).toHaveLength(1));
    expect(f.spawn).not.toHaveBeenCalled();await f.accept();await pending;
    expect(f.spawn).toHaveBeenCalledOnce();expect(f.identity).toHaveBeenCalledWith(args.serial,expect.any(AbortSignal));
  });
  it('registers inert tools and launches only after a real separate broker decision', async () => {
    const f = setup(); expect(f.spawn).not.toHaveBeenCalled(); expect(f.identity).not.toHaveBeenCalled();
    const pending = f.invoke('phone_viewer_start');
    const approval = await f.accept();
    expect(approval.detail).toContain('Sensitive content may appear');
    expect(approval.targetDeviceId).toBe(args.deviceId);
    expect(approval.chatId).toBe(caller);
    expect(JSON.stringify(await pending)).toContain('starting');
    expect(f.spawn).toHaveBeenCalledTimes(1);
    f.child.emit('spawn');
    expect(JSON.stringify(await f.invoke('phone_viewer_status'))).toContain('running');
    await f.invoke('phone_viewer_stop'); expect(f.child.kill).toHaveBeenCalledWith('SIGTERM');
  });
  it('does not prompt without an installed configured binary', async () => {
    const f = setup(false);
    await expect(f.invoke('phone_viewer_start')).rejects.toThrow('ALLY_SCRCPY_PATH');
    expect(f.broker.list()).toHaveLength(0); expect(f.identity).not.toHaveBeenCalled();
  });
  it('rejects caller spoofing and cross-chat status/Stop', async () => {
    const f = setup();
    await expect(f.invoke('phone_viewer_start', { ...args, chatId: 'codex:other-1234' })).rejects.toThrow('does not match');
    await expect(f.invoke('phone_viewer_start', args, '')).rejects.toThrow('authenticated');
    const start = f.invoke('phone_viewer_start'); await f.accept(); await start;
    expect(JSON.stringify(await f.invoke('phone_viewer_status', args, 'codex:other-1234'))).toContain('not-found');
    expect(JSON.stringify(await f.invoke('phone_viewer_stop', args, 'codex:other-1234'))).toContain('false');
    expect(f.child.kill).not.toHaveBeenCalled();
  });
  it('never launches after a decline, request cancellation or phone disconnect', async () => {
    for (const reason of ['decline', 'cancel', 'disconnect']) {
      const f = setup(); const start = f.invoke('phone_viewer_start');
      await vi.waitFor(() => expect(f.broker.list()).toHaveLength(1));
      if (reason === 'decline') f.broker.answer(f.broker.list()[0].id, { action: 'decline' }, 'phone');
      if (reason === 'cancel') f.signal.abort();
      if (reason === 'disconnect') f.disconnect();
      await start; expect(f.spawn).not.toHaveBeenCalled(); expect(f.broker.list()).toHaveLength(0);
    }
  });
  it('deduplicates consent and globally reserves a phone across different callers', async () => {
    const f = setup(); const pending = f.invoke('phone_viewer_start');
    await vi.waitFor(() => expect(f.broker.list()).toHaveLength(1));
    expect(JSON.stringify(await f.invoke('phone_viewer_start'))).toContain('authorizing');
    await expect(f.invoke('phone_viewer_start', { ...args, requestId: 'viewer-test-2' }, 'codex:other-1234')).rejects.toThrow('already has');
    await f.accept(); await pending; expect(f.spawn).toHaveBeenCalledTimes(1);
  });
  it('phone Stop revocation and unregister stop the actual viewer and remove tools', async () => {
    const f = setup(); const start = f.invoke('phone_viewer_start'); await f.accept(); await start;
    f.hub.revoked(args.deviceId, { grantId: 'unrelated-control-grant', reason: 'User stopped' });
    expect(f.child.kill).toHaveBeenCalledWith('SIGTERM');
    f.stop(); expect(f.tools.size).toBe(0);
  });
});
