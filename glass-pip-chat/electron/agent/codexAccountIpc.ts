import { app, ipcMain, shell, type BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { CodexRpc } from './codexRpc.js';
import { accountWindows, codexAccounts, loginCodexProfile, useCodexProfile, type CodexAccountStatus } from './codexAccounts.js';

/** Only documented account metadata is exposed. Never reads auth.json or handles tokens. */
export async function readCodexProfileStatus(id: string, binary?: string): Promise<CodexAccountStatus> {
  const release = useCodexProfile(codexAccounts.require(id));
  let rpc: CodexRpc | undefined;
  const status: CodexAccountStatus = { id, state: 'unknown', checkedAt: Date.now(), windows: [] };
  try {
    rpc = await CodexRpc.connect(binary, codexAccounts.home(id));
    const { account } = await rpc.request('account/read', { refreshToken: false }, 8000);
    if (!account) status.state = 'signed_out';
    else if (account.type !== 'chatgpt') {
      status.state = 'unavailable'; status.message = 'This profile uses API authentication. ChatGPT allowance is unavailable.';
    } else {
      codexAccounts.verifyIdentity(id, account.email);
      status.email = account.email;
      status.plan = typeof account.planType === 'string' ? account.planType.slice(0, 80) : undefined;
      status.windows = accountWindows(await rpc.request('account/rateLimits/read', {}, 8000));
      status.state = status.windows.length ? status.windows.some(w => w.usedPercent >= 100) ? 'limited' : 'ready' : 'unknown';
      if (!status.windows.length) status.message = 'Signed in; the provider did not report usage windows. Model access is not verified.';
    }
  } catch {
    status.state = 'unavailable';
    status.message = 'Could not verify this profile’s identity and usage. Check its sign-in and connection; no model request was made.';
  } finally { rpc?.close(); release(); }
  codexAccounts.observe(status);
  return status;
}

export function safeCodexLoginUrl(raw: unknown): string {
  if (typeof raw !== 'string') throw Error('Codex did not return a login URL.');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(url.hostname) || url.username || url.password || url.port) throw Error('Codex returned an unsupported login address.');
  return url.href;
}

export function registerCodexAccountIpc(getWindow: () => BrowserWindow | null, binary: () => string | undefined): void {
  codexAccounts.configure(path.join(app.getPath('userData'), 'codex-accounts.json'));
  const mainOnly = (event: Electron.IpcMainInvokeEvent) => {
    const win = getWindow();
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw Error('Account management must come from Ally Settings.');
  };
  let login: { id: string; rpc: CodexRpc; release: () => void; timer: ReturnType<typeof setTimeout> } | undefined;
  const closeLogin = () => {
    const active = login; login = undefined;
    if (active) { clearTimeout(active.timer); active.rpc.onClose = undefined; active.rpc.close(); active.release(); }
  };
  let verifying: string | undefined;
  const snapshot = () => ({ ...codexAccounts.snapshot(), signingIn: login?.id ?? verifying });
  ipcMain.handle('codex-accounts:list', event => { mainOnly(event); return snapshot(); });
  ipcMain.handle('codex-accounts:add', (event, label: string) => { mainOnly(event); codexAccounts.add(label); return snapshot(); });
  ipcMain.handle('codex-accounts:select', (event, id: string) => { mainOnly(event); codexAccounts.select(id); return snapshot(); });
  ipcMain.handle('codex-accounts:remove', (event, id: string) => { mainOnly(event); if (login?.id === id) throw Error('Cancel sign-in first.'); codexAccounts.remove(id); return snapshot(); });
  ipcMain.handle('codex-accounts:autoSwitch', (event, on: boolean) => { mainOnly(event); codexAccounts.setAutoSwitch(on === true); return snapshot(); });
  ipcMain.handle('codex-accounts:check', async (event, id: string) => { mainOnly(event); await readCodexProfileStatus(id, binary()); return snapshot(); });
  ipcMain.handle('codex-accounts:cancelLogin', event => { mainOnly(event); closeLogin(); return snapshot(); });
  ipcMain.handle('codex-accounts:login', async (event, id: string) => {
    mainOnly(event); codexAccounts.require(id);
    if (id === 'default') throw Error('Manage the existing login in Codex itself. Add an isolated profile here for another account.');
    const release = loginCodexProfile(id);
    let rpc: CodexRpc | undefined;
    try {
      const home = codexAccounts.home(id)!;
      fs.mkdirSync(home, { recursive: true, mode: 0o700 });
      rpc = await CodexRpc.connect(binary(), home);
      const activeRpc = rpc;
      login = { id, rpc, release, timer: setTimeout(closeLogin, 5 * 60_000) };
      rpc.onClose = closeLogin;
      rpc.onNotification = (method, params) => {
        if (method !== 'account/login/completed' || login?.rpc !== activeRpc) return;
        if (params.success) verifying = id;
        closeLogin();
        if (params.success) void readCodexProfileStatus(id, binary()).catch(() => {}).finally(() => { if (verifying === id) verifying = undefined; });
      };
      const result = await rpc.request('account/login/start', { type: 'chatgpt' });
      if (login?.rpc !== rpc) throw Error('Sign-in ended; use Check to verify the profile.');
      await shell.openExternal(safeCodexLoginUrl(result.authUrl));
      return snapshot();
    } catch (error) { if (login?.rpc === rpc) closeLogin(); else { rpc?.close(); release(); } throw error; }
  });
  app.once('will-quit', closeLogin);
}
