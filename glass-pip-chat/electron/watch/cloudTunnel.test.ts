import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startCloudTunnel } from './cloudTunnel';

vi.mock('node:child_process', () => { const spawn = vi.fn(); return { spawn, default: { spawn } }; });
const root = path.resolve('test-user-data');
const config = { enabled: true, hostname: 'ally.prxptn.com', binary: 'cloudflared.exe', tokenFile: 'watch-tunnel-token.txt' };
let children: Array<EventEmitter & { kill: ReturnType<typeof vi.fn> }>;
beforeEach(() => {
  vi.useFakeTimers(); children = [];
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  vi.mocked(spawn).mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    children.push(child); return child as any;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('Ally cloud connector', () => {
  it('uses a private token file and removes inherited tunnel configuration', () => {
    vi.stubEnv('TUNNEL_TOKEN', 'another-tunnel-secret');
    const stop = startCloudTunnel(config, root);
    const [binary, args, options] = vi.mocked(spawn).mock.calls[0];
    expect(binary).toBe('cloudflared.exe');
    expect(args).toContain(path.join(root, config.tokenFile));
    expect(args).not.toContain('another-tunnel-secret');
    expect((options as any).env.TUNNEL_TOKEN).toBeUndefined();
    stop?.(); expect(children[0].kill).toHaveBeenCalledOnce();
  });
  it('restarts one connector after failure, and stops retrying on quit', async () => {
    const stop = startCloudTunnel(config, root);
    children[0].emit('error', new Error('offline')); children[0].emit('exit', 1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(spawn).toHaveBeenCalledTimes(2);
    children[1].emit('exit', 1); stop?.();
    await vi.advanceTimersByTimeAsync(60000);
    expect(spawn).toHaveBeenCalledTimes(2);
  });
  it('does not start without explicit configuration or a token in Ally user data', () => {
    startCloudTunnel({ ...config, enabled: false }, root);
    startCloudTunnel({ ...config, tokenFile: '../another-app-token' }, root);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    startCloudTunnel(config, root);
    expect(spawn).not.toHaveBeenCalled();
  });
});
