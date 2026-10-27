import { mkdtempSync as mkdtempSharedHome } from 'node:fs';
import { tmpdir as tmpdirSharedHome } from 'node:os';
import { join as joinSharedHome } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { CodexRpc } from './codexRpc';
// ALLY_TEST_SHARED_HOME: profiles link their history here, never into the real ~/.codex.
process.env.CODEX_HOME = mkdtempSharedHome(joinSharedHome(tmpdirSharedHome(), 'ally-shared-codex-home-'));
vi.mock('node:child_process', () => { const launch = vi.fn(); return { spawn: launch, default: { spawn: launch } }; });
vi.mock('./binaries.js', () => ({ resolveAgentBinary: vi.fn(async () => '/codex'), launcherFor: () => ({ command: '/codex', prefixArgs: [], shell: false }), childEnv: () => ({ HOME: '/actual', USERPROFILE: 'C:/actual', APPDATA: 'C:/actual/AppData', CODEX_HOME: '/original', OPENAI_API_KEY: 'synthetic-only' }) }));
afterEach(() => vi.restoreAllMocks());
function transport() {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  child.stdin.on('data', data => {
    const message = JSON.parse(data.toString());
    if (message.method === 'initialize') queueMicrotask(() => child.stdout.write(JSON.stringify({ id: message.id, result: {} }) + '\n'));
  });
  vi.mocked(spawn).mockReturnValue(child as never);
}
it('launches a profile through documented CODEX_HOME/file storage only, with no inherited alternate credentials', async () => {
  transport(); const rpc = await CodexRpc.connect('/codex', '/owned/profile');
  expect(spawn).toHaveBeenCalledWith('/codex', ['app-server', '-c', 'cli_auth_credentials_store="file"'], expect.objectContaining({ env: { HOME: '/actual', USERPROFILE: 'C:/actual', APPDATA: 'C:/actual/AppData', CODEX_HOME: '/owned/profile' }, windowsHide: true }));
  rpc.close();
});
it('preserves the pre-existing login environment and startup arguments for the legacy connection', async () => {
  transport(); const rpc = await CodexRpc.connect('/codex');
  expect(spawn).toHaveBeenCalledWith('/codex', ['app-server'], expect.objectContaining({ env: expect.objectContaining({ CODEX_HOME: '/original', OPENAI_API_KEY: 'synthetic-only' }) }));
  rpc.close();
});
