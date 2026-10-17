import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), fetch: vi.fn() }));
vi.mock('electron', () => ({ app: { whenReady: async () => {}, getPath: () => 'C:/ally-test/config', getAppPath: () => 'C:/ally-test/glass-pip-chat' } }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn, default: { spawn: mocks.spawn } }));
vi.mock('node:fs', () => {
  const api = { existsSync: () => true, mkdirSync: vi.fn(), readFileSync: () => JSON.stringify({ token: 'test-only-credential-00000000000000000' }), writeFileSync: vi.fn() };
  return { ...api, default: api };
});

function fakeProcess(pid: number) {
  return { pid, exitCode: null as number | null, signalCode: null, stderr: { on: vi.fn() }, once: vi.fn(), unref: vi.fn(), kill: vi.fn() };
}
const ready = () => ({ ok: true, json: async () => ({ service: 'ally-speech', ready: true, state: 'ready' }) });

describe('owned speech worker lifecycle', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.stubGlobal('fetch', mocks.fetch); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it('terminates only the owned Windows process tree including the venv child', async () => {
    const owned = fakeProcess(12345); const terminator = fakeProcess(54321);
    mocks.spawn.mockReturnValueOnce(owned).mockReturnValueOnce(terminator);
    mocks.fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ready());
    const { ensureSpeechRuntime, stopSpeechRuntime } = await import('./runtime');
    await ensureSpeechRuntime(); stopSpeechRuntime();
    if (process.platform === 'win32') {
      expect(mocks.spawn.mock.calls[1]).toEqual(['taskkill.exe', ['/PID', '12345', '/T', '/F'], { windowsHide: true, stdio: 'ignore' }]);
      expect(terminator.unref).toHaveBeenCalledOnce();
    } else expect(owned.kill).toHaveBeenCalledOnce();
    stopSpeechRuntime();
    expect(mocks.spawn).toHaveBeenCalledTimes(process.platform === 'win32' ? 2 : 1);
  });
  it('leaves an externally started compatible worker running', async () => {
    mocks.fetch.mockResolvedValue(ready());
    const { ensureSpeechRuntime, stopSpeechRuntime } = await import('./runtime');
    await ensureSpeechRuntime(); stopSpeechRuntime();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('cannot spawn a worker if shutdown happens during the initial health check', async () => {
    let rejectHealth!: (error: Error) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise((_, reject) => { rejectHealth = reject; }));
    const { ensureSpeechRuntime, stopSpeechRuntime } = await import('./runtime');
    const pending = ensureSpeechRuntime();
    await Promise.resolve();
    stopSpeechRuntime(); rejectHealth(new Error('offline'));
    await expect(pending).rejects.toThrow('shutting down');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
