import { mkdtempSync as mkdtempSharedHome } from 'node:fs';
import { tmpdir as tmpdirSharedHome } from 'node:os';
import { join as joinSharedHome } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CodexRpc } from './codexRpc';
import { codexAccounts } from './codexAccounts';
import { readCodexProfileStatus, registerCodexAccountIpc, safeCodexLoginUrl } from './codexAccountIpc';
// ALLY_TEST_SHARED_HOME: profiles link their history here, never into the real ~/.codex.
process.env.CODEX_HOME = mkdtempSharedHome(joinSharedHome(tmpdirSharedHome(), 'ally-shared-codex-home-'));
const ipc = vi.hoisted(() => ({ root: '', handlers: new Map<string, (...args: any[]) => any>(), open: vi.fn(async (_url: string) => {}) }));
vi.mock('electron', () => ({ app: { getPath: () => ipc.root, once: vi.fn() }, ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => ipc.handlers.set(name, handler) }, shell: { openExternal: ipc.open } }));
const roots: string[] = [];
function profile() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-account-ipc-test-')); roots.push(root);
  codexAccounts.configure(path.join(root, 'profiles.json')); return codexAccounts.add('Test');
}
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
describe('Codex account metadata and login boundaries', () => {
  it('reads only account and usage metadata in the exact home and strips all unexpected fields', async () => {
    const a = profile(); const close = vi.fn();
    const request = vi.fn(async (method: string) => method === 'account/read'
      ? { account: { type: 'chatgpt', email: 'test@example.test', planType: 'plus', accessToken: 'must-not-leave-server' } }
      : { rateLimits: { primary: { usedPercent: 99, resetsAt: 12345 } }, secret: 'must-not-leave-server' });
    const connect = vi.spyOn(CodexRpc, 'connect').mockResolvedValue({ request, close } as unknown as CodexRpc);
    const result = await readCodexProfileStatus(a.id, 'binary');
    expect(connect).toHaveBeenCalledWith('binary', codexAccounts.home(a.id));
    expect(result.state).toBe('ready'); expect(JSON.stringify(result)).not.toContain('must-not-leave');
    expect(request.mock.calls.map(c => c[0])).toEqual(['account/read', 'account/rateLimits/read']); expect(close).toHaveBeenCalledOnce();
  });
  it('shows signed-out, unknown usage and identity mismatch honestly without inference', async () => {
    const a = profile();
    const request = vi.fn().mockResolvedValueOnce({ account: null });
    vi.spyOn(CodexRpc, 'connect').mockResolvedValue({ request, close: vi.fn() } as unknown as CodexRpc);
    expect((await readCodexProfileStatus(a.id)).state).toBe('signed_out');
    request.mockResolvedValueOnce({ account: { type: 'chatgpt', email: 'test@example.test' } }).mockResolvedValueOnce({});
    expect((await readCodexProfileStatus(a.id)).state).toBe('unknown');
    request.mockResolvedValueOnce({ account: { type: 'chatgpt', email: 'different@example.test' } });
    expect((await readCodexProfileStatus(a.id)).state).toBe('unavailable');
  });
  it('only permits HTTPS provider sign-in URLs', () => {
    expect(safeCodexLoginUrl('https://auth.openai.com/authorize?state=synthetic')).toContain('https://auth.openai.com/');
    for (const url of ['http://auth.openai.com/', 'https://auth.openai.com.evil.test/', 'file:///auth', 'https://user:pass@chatgpt.com/', 'https://chatgpt.com:444/']) expect(() => safeCodexLoginUrl(url)).toThrow();
  });
});

it('restricts account IPC to the main frame and keeps sign-in explicit and cancellable', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ally-account-login-test-')); roots.push(root); ipc.root = root;
  const webContents = { mainFrame: {} }; const event = { sender: webContents, senderFrame: webContents.mainFrame };
  registerCodexAccountIpc(() => ({ webContents }) as never, () => 'binary');
  expect(() => ipc.handlers.get('codex-accounts:list')!({ sender: {}, senderFrame: {} })).toThrow('Ally Settings');
  const snapshot = ipc.handlers.get('codex-accounts:add')!(event, 'Work');
  const id = snapshot.accounts[1].id;
  const rpc = { request: vi.fn(async (_method: string, _params?: unknown) => ({ authUrl: 'https://auth.openai.com/authorize?state=synthetic' })), close: vi.fn(), onNotification: undefined as CodexRpc['onNotification'], onClose: undefined as CodexRpc['onClose'] };
  vi.spyOn(CodexRpc, 'connect').mockResolvedValue(rpc as unknown as CodexRpc);
  expect(ipc.open).not.toHaveBeenCalled();
  const signingIn = await ipc.handlers.get('codex-accounts:login')!(event, id);
  expect(signingIn.signingIn).toBe(id); expect(signingIn.selected).toBe('default');
  expect(rpc.request).toHaveBeenCalledWith('account/login/start', { type: 'chatgpt' });
  expect(ipc.open).toHaveBeenCalledWith('https://auth.openai.com/authorize?state=synthetic');
  const cancelled = ipc.handlers.get('codex-accounts:cancelLogin')!(event);
  expect(cancelled.signingIn).toBeUndefined(); expect(rpc.close).toHaveBeenCalledOnce();
  expect(rpc.request.mock.calls.some(c => /turn|thread/.test(c[0] ?? ''))).toBe(false);
});
