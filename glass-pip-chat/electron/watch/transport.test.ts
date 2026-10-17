import { describe, expect, it, vi, afterEach } from 'vitest';
import { reconcileWatch, startWatchTransport, watchEndpoints } from './transport';
import { execFile } from 'node:child_process';

vi.mock('node:child_process', () => { const execFile = vi.fn(); return { execFile, default: { execFile } }; });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
const config = { serial: 'WATCH', endpoint: 'old:123' };
function fake(outputs: Record<string, string>) {
  return vi.fn(async (args: string[]) => {
    const key = args.join(' ');
    if (!(key in outputs)) throw new Error(`Unexpected command: ${key}`);
    return outputs[key];
  });
}
describe('watch transport recovery', () => {
  it('discovers only the enrolled serial, including duplicate mDNS names', () => {
    expect(watchEndpoints('adb-WATCH-abc (2) _adb-tls-connect._tcp 192.168.1.1:44\nadb-WATCH-abc _adb-tls-connect._tcp 192.168.1.1:44\nadb-WATCH2-abc _adb-tls-connect._tcp 192.168.1.2:55', 'WATCH')).toEqual(['192.168.1.1:44']);
  });
  it('recovers a changed port and reinstalls the missing reverse', async () => {
    const run = fake({ devices: 'old:123 offline', 'mdns services': 'adb-WATCH-abc _adb-tls-connect._tcp new:456', 'connect new:456': 'connected', '-s new:456 shell getprop ro.serialno': 'WATCH\n', '-s new:456 reverse --list': '', '-s new:456 reverse tcp:18765 tcp:18765': '' });
    expect(await reconcileWatch(config, 18765, run)).toBe('new:456');
    expect(run).not.toHaveBeenCalledWith(['connect', 'old:123']);
  });
  it('does not modify another device or replace a healthy mapping', async () => {
    const run = fake({ devices: 'phone device\nwatch device', '-s phone shell getprop ro.serialno': 'PHONE', '-s watch shell getprop ro.serialno': 'WATCH', '-s watch reverse --list': 'host-1 tcp:18765 tcp:18765\n' });
    await reconcileWatch(config, 18765, run);
    expect(run.mock.calls.filter(([args]) => args.includes('reverse'))).toEqual([[['-s', 'watch', 'reverse', '--list']]]);
  });
  it('accepts an online mDNS device name containing spaces', async () => {
    const target = 'adb-WATCH-abc (2)._adb-tls-connect._tcp';
    const run = fake({ devices: `${target}\tdevice`, [`-s ${target} shell getprop ro.serialno`]: 'WATCH', [`-s ${target} reverse --list`]: 'host-1 tcp:18765 tcp:18765' });
    expect(await reconcileWatch(config, 18765, run)).toBe(target);
  });
  it('rejects a reused address with the wrong hardware identity', async () => {
    const run = fake({ devices: '', 'mdns services': '', 'connect old:123': 'connected', '-s old:123 shell getprop ro.serialno': 'PHONE' });
    await expect(reconcileWatch(config, 18765, run)).rejects.toThrow('Waiting');
    expect(run.mock.calls.some(([args]) => args.includes('reverse'))).toBe(false);
  });
  it('targets an offline connection without resetting the global ADB server', async () => {
    const run = fake({ devices: 'old:123 offline', 'mdns services': '', '-s old:123 reconnect': '', 'connect old:123': 'connected', '-s old:123 shell getprop ro.serialno': 'WATCH', '-s old:123 reverse --list': '', '-s old:123 reverse tcp:18765 tcp:18765': '' });
    await reconcileWatch(config, 18765, run);
    expect(run).toHaveBeenCalledWith(['-s', 'old:123', 'reconnect']);
  });
  it('backs off on failure and cancels scheduled recovery on shutdown', async () => {
    vi.useFakeTimers();
    vi.mocked(execFile).mockImplementation((...args: any[]) => { args[3](new Error('offline'), ''); return {} as any; });
    const manager = startWatchTransport({ ...config }, 18765, vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(execFile).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(execFile).toHaveBeenCalledTimes(2);
    manager.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(execFile).toHaveBeenCalledTimes(2);
  });
  it('never overlaps reconciliation and aborts its owned command on shutdown', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.mocked(execFile).mockImplementation((...args: any[]) => { signal = args[2].signal; return {} as any; });
    const manager = startWatchTransport({ ...config }, 18765, vi.fn());
    await vi.advanceTimersByTimeAsync(60000);
    expect(execFile).toHaveBeenCalledTimes(1);
    manager.stop();
    expect(signal?.aborted).toBe(true);
  });
});
