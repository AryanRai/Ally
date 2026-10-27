// @vitest-environment node
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverScrcpy, ScrcpyViewer, type ViewerDependencies, type ViewerGrant, type ViewerRequest } from './scrcpyViewer.js';

const request: ViewerRequest = { requestId: 'viewer-test-1', deviceId: 'phone-one', serial: 'test-serial', chatId: 'codex:test' };
function fixture(overrides: Partial<ViewerDependencies> = {}) {
  const connection = new AbortController(), session = new AbortController();
  const child = Object.assign(new EventEmitter(), { kill: vi.fn(() => true) }) as unknown as ChildProcess;
  const grant: ViewerGrant = { ...request, id: 'viewer-grant', scope: 'unfiltered-local-viewer', expiresAt: Date.now() + 60_000 };
  const deps: ViewerDependencies = {
    executable: () => process.platform === 'win32' ? 'C:\\tools\\scrcpy.exe' : '/tools/scrcpy',
    identity: vi.fn(async () => request.deviceId), connection: () => connection.signal, session: () => session.signal,
    authorize: vi.fn(async () => grant), spawn: vi.fn(() => child), ...overrides,
  };
  return { viewer: new ScrcpyViewer(deps), deps, child, grant, connection, session };
}
afterEach(() => vi.useRealTimers());

describe('explicit local phone viewer', () => {
  it('checks identity around separate consent and launches fixed read-only flags', async () => {
    const f = fixture();
    expect((await f.viewer.start(request)).state).toBe('starting');
    expect(f.deps.identity).toHaveBeenCalledTimes(2);
    expect(f.deps.spawn).toHaveBeenCalledWith(f.deps.executable(), [
      '--serial=test-serial', '--no-control', '--no-audio', '--no-clipboard-autosync', '--window-title=Ally phone viewer',
    ]);
    f.child.emit('spawn');
    expect(f.viewer.status(request.requestId, request.chatId)?.state).toBe('running');
    f.viewer.close(); f.child.emit('exit', 0);
  });
  it('refuses control grants, mismatches, denied approval and expired or excessive grants', async () => {
    for (const grant of [undefined,
      { ...fixture().grant, scope: 'phone-control' }, { ...fixture().grant, deviceId: 'other-phone' },
      { ...fixture().grant, serial: 'other-serial' }, { ...fixture().grant, chatId: 'codex:other' },
      { ...fixture().grant, expiresAt: Date.now() - 1 }, { ...fixture().grant, expiresAt: Date.now() + 61 * 60_000 },
    ]) {
      const f = fixture({ authorize: async () => grant as ViewerGrant | undefined });
      expect((await f.viewer.start(request)).state).toBe('failed');
      expect(f.deps.spawn).not.toHaveBeenCalled();
    }
  });
  it('refuses unbound or changed ADB identities', async () => {
    for (const identity of [vi.fn(async () => 'wrong-phone'), vi.fn().mockResolvedValueOnce('phone-one').mockResolvedValueOnce('wrong-phone')]) {
      const f = fixture({ identity });
      expect((await f.viewer.start(request)).state).toBe('failed');
      expect(f.deps.spawn).not.toHaveBeenCalled();
    }
  });
  it('deduplicates starts and reserves device and serial until actual exit', async () => {
    const f = fixture(); await f.viewer.start(request); await f.viewer.start(request);
    expect(f.deps.spawn).toHaveBeenCalledTimes(1);
    await expect(f.viewer.start({ ...request, chatId: 'codex:other' })).rejects.toThrow('already used');
    f.viewer.stop(request.requestId, request.chatId);
    await expect(f.viewer.start({ ...request, requestId: 'viewer-test-2' })).rejects.toThrow('already has');
    await expect(f.viewer.start({ ...request, requestId: 'viewer-test-3', deviceId: 'other-phone' })).rejects.toThrow('already has');
    f.child.emit('exit', 0);
    await f.viewer.start({ ...request, requestId: 'viewer-test-2' });
    expect(f.deps.spawn).toHaveBeenCalledTimes(2);
    f.viewer.close(); f.child.emit('exit', 0);
  });
  it.each(['disconnect', 'session', 'expiry', 'revoke', 'close'] as const)('terminates on %s', async reason => {
    vi.useFakeTimers();
    const f = fixture(); await f.viewer.start(request); f.child.emit('spawn');
    if (reason === 'disconnect') f.connection.abort();
    if (reason === 'session') f.session.abort();
    if (reason === 'expiry') vi.advanceTimersByTime(60_001);
    if (reason === 'revoke') f.viewer.revoke(f.grant.id, request.deviceId);
    if (reason === 'close') f.viewer.close();
    expect(f.child.kill).toHaveBeenCalledWith('SIGTERM');
    vi.advanceTimersByTime(2000);
    expect(f.child.kill).toHaveBeenCalledWith('SIGKILL');
    f.child.emit('exit', 0);
    expect(f.viewer.status(request.requestId, request.chatId)?.state).toBe('stopped');
  });
  it('cancels even an unresponsive approval adapter and rejects its late answer', async () => {
    let approve!: (grant: ViewerGrant) => void;
    const f = fixture({ authorize: () => new Promise(resolve => { approve = resolve; }) });
    const pending = f.viewer.start(request);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    f.viewer.stop(request.requestId, request.chatId);
    expect((await pending).state).toBe('stopped');
    approve(f.grant); await Promise.resolve();
    expect(f.deps.spawn).not.toHaveBeenCalled();
  });
  it('fails closed when a phone reconnects during authorization', async () => {
    const signal = new AbortController().signal;
    const connection = vi.fn().mockReturnValueOnce(signal).mockReturnValueOnce(signal).mockReturnValue(new AbortController().signal);
    const f = fixture({ connection });
    expect((await f.viewer.start(request)).state).toBe('failed');
    expect(f.deps.spawn).not.toHaveBeenCalled();
  });
  it('bounds pending authorization without launching capture', async () => {
    vi.useFakeTimers();
    const f = fixture({ authorize: async () => new Promise(() => {}) });
    const pending = f.viewer.start(request);
    await vi.advanceTimersByTimeAsync(150_001);
    expect((await pending).state).toBe('stopped');
    expect(f.deps.spawn).not.toHaveBeenCalled();
  });
  it('limits status and Stop to owning chat, and hides subprocess failure detail', async () => {
    const f = fixture(); await f.viewer.start(request);
    expect(f.viewer.status(request.requestId, 'codex:other')).toBeUndefined();
    expect(f.viewer.stop(request.requestId, 'codex:other')).toBe(false);
    f.child.emit('error', Error('private serial and screen'));
    expect(f.viewer.status(request.requestId, request.chatId)).toMatchObject({ state: 'failed', reason: 'Phone viewer subprocess failed.' });
  });
  it('does not release a running process on a later subprocess error', async () => {
    const f = fixture(); Object.defineProperty(f.child, 'pid', { value: 123 });
    await f.viewer.start(request); f.child.emit('spawn'); f.child.emit('error', Error('private'));
    expect(f.viewer.status(request.requestId, request.chatId)?.state).toBe('stopping');
    await expect(f.viewer.start({ ...request, requestId: 'viewer-test-2' })).rejects.toThrow('already has');
    f.child.emit('exit', 1);
  });
  it('refuses implicit devices, unsafe serials and untrusted executable paths', async () => {
    const f = fixture();
    await expect(f.viewer.start({ ...request, serial: '--tcpip=attacker' })).rejects.toThrow();
    await expect(f.viewer.start({ ...request, chatId: '' })).rejects.toThrow();
    const bad = fixture({ executable: () => 'scrcpy' });
    expect((await bad.viewer.start(request)).state).toBe('failed');
    expect(bad.deps.spawn).not.toHaveBeenCalled();
    expect(discoverScrcpy(['scrcpy', './scrcpy.exe', '/missing/scrcpy'])).toBeUndefined();
  });
});
