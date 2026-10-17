// Sign in to Claude Code from Ally. Runs the CLI's own `claude auth login` in a
// console window (its code prompt needs a real terminal and ignores piped input),
// so Ally never handles credentials. Verifies with a real request afterwards,
// since `claude auth status` only reads the local file and still says "logged in"
// after the saved token has expired.
import { spawn } from 'node:child_process';
import { ipcMain, type BrowserWindow } from 'electron';
import { childEnv, isWin, launcherFor, resolveAgentBinary } from './binaries.js';
import { claudeError } from './parsers.js';

export interface ClaudeAccount {
  /** The CLI accepted a real request with the saved login */
  ok: boolean;
  email?: string;
  plan?: string;
  error?: string;
}

export type ClaudeLoginEvent =
  /** `tracked`: Ally checks the login itself when the window closes */
  | { kind: 'started'; tracked: boolean }
  | { kind: 'done'; account: ClaudeAccount };

const CHECK_TIMEOUT_MS = 60_000;

function run(bin: string, args: string[], input?: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const launcher = launcherFor(bin);
    const child = spawn(launcher.command, [...launcher.prefixArgs, ...args], { env: childEnv(), shell: launcher.shell, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), CHECK_TIMEOUT_MS);
    child.stdout?.on('data', d => { stdout += d; });
    child.stderr?.on('data', d => { stderr += d; });
    child.on('error', err => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: String(err) }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    child.stdin?.end(input ?? '');
  });
}

/** Who the CLI is signed in as, and whether that login actually works (one tiny request). */
export async function checkClaudeAccount(bin: string): Promise<ClaudeAccount> {
  let email: string | undefined;
  let plan: string | undefined;
  try {
    const status = JSON.parse((await run(bin, ['auth', 'status', '--json'])).stdout);
    if (!status.loggedIn) return { ok: false, error: 'Not signed in.' };
    email = status.email;
    plan = status.subscriptionType;
  } catch { /* older CLI: fall through to the real request */ }

  const probe = await run(bin, ['-p', '--output-format', 'json', '--max-turns', '1', '--no-session-persistence'], 'Reply with OK');
  try {
    const result = JSON.parse(probe.stdout.trim().split('\n').at(-1) ?? '');
    if (!result.is_error) return { ok: true, email, plan };
    return { ok: false, email, plan, error: claudeError(result) };
  } catch {
    return { ok: false, email, plan, error: (probe.stderr || probe.stdout || 'Claude Code did not respond.').trim().slice(0, 400) };
  }
}

/** Registers `claude:account` (verified sign-in state) and `claude:loginStart`. */
export function registerClaudeLoginIpc(getWindow: () => BrowserWindow | null, binaryOverride: () => string | undefined): void {
  let active = false;
  const bin = async () => {
    const found = await resolveAgentBinary('claude', binaryOverride());
    if (!found) throw new Error('Claude Code CLI not found. Set its path in Settings → Agents.');
    return found;
  };
  const send = (event: ClaudeLoginEvent) => getWindow()?.webContents.send('claude:loginEvent', event);

  ipcMain.handle('claude:account', async () => checkClaudeAccount(await bin()));

  ipcMain.handle('claude:loginStart', async () => {
    if (active) return;
    const path = await bin();
    if (isWin) {
      // `detached` gives the CLI its own console window, and Ally still sees it exit
      const launcher = launcherFor(path);
      const child = spawn(launcher.command, [...launcher.prefixArgs, 'auth', 'login'], {
        env: childEnv(), shell: launcher.shell, detached: true, windowsHide: false, stdio: 'ignore',
      });
      active = true;
      send({ kind: 'started', tracked: true });
      const finish = async (account?: ClaudeAccount) => {
        if (!active) return;
        active = false;
        send({ kind: 'done', account: account ?? await checkClaudeAccount(path) });
      };
      child.on('close', () => void finish());
      child.on('error', err => void finish({ ok: false, error: String(err) }));
      return;
    }
    // macOS / Linux: hand off to the system terminal; the dialog's Check confirms it
    if (process.platform === 'darwin') {
      spawn('osascript', ['-e', `tell application "Terminal" to do script "${path.replace(/["\\]/g, '\\$&')} auth login"`], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('x-terminal-emulator', ['-e', path, 'auth', 'login'], { env: childEnv(), detached: true, stdio: 'ignore' }).unref();
    }
    send({ kind: 'started', tracked: false });
  });
}
