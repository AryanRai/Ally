// Locating the Claude Code / Codex CLIs and preparing their process environment.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentProvider } from './types.js';

const execFileAsync = promisify(execFile);
export const isWin = process.platform === 'win32';

/** How to launch a CLI: a program plus any leading args (e.g. a node script). */
export interface Launcher {
  command: string;
  prefixArgs: string[];
  /** Only for shims we couldn't unwrap; args must then be shell-safe */
  shell: boolean;
}

const cache: Partial<Record<AgentProvider, string | null>> = {};

async function whichAll(name: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(isWin ? 'where.exe' : 'which', isWin ? [name] : ['-a', name]);
    return stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Prefer a real executable over a shell shim (.cmd / extensionless npm stub). */
export function pickExecutable(paths: string[]): string | undefined {
  if (!isWin) return paths[0];
  // Modern npm Claude installs hide a native executable behind a .cmd shim.
  // Prefer that over an earlier legacy JS installation on the inherited PATH.
  return paths.find(p => /\.exe$/i.test(p))
    ?? paths.find(p => /\.(cmd|bat)$/i.test(p) && /\.exe$/i.test(launcherFor(p).command) && !launcherFor(p).shell)
    ?? paths.find(p => /\.(cmd|bat)$/i.test(p));
}

async function findCodexInWindowsApps(): Promise<string | undefined> {
  if (!isWin) return undefined;
  // The Codex desktop app (Microsoft Store) bundles the CLI; its folder can't be
  // listed directly, so ask Appx where it lives.
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-Command', '(Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1).InstallLocation',
    ]);
    const dir = stdout.trim();
    const exe = dir && path.join(dir, 'app', 'resources', 'codex.exe');
    if (exe && fs.existsSync(exe)) return exe;
  } catch { /* not installed */ }
  return undefined;
}

export async function resolveAgentBinary(provider: AgentProvider, override?: string): Promise<string | null> {
  if (override) return fs.existsSync(override) ? override : null;
  if (cache[provider] !== undefined) return cache[provider]!;

  let found: string | undefined;
  if (provider === 'claude') {
    found = pickExecutable(await whichAll('claude'));
    const local = path.join(os.homedir(), '.local', 'bin', isWin ? 'claude.exe' : 'claude');
    if (!found && fs.existsSync(local)) found = local;
  } else {
    found = pickExecutable(await whichAll('codex')) ?? (await findCodexInWindowsApps());
  }
  cache[provider] = found ?? null;
  return cache[provider]!;
}

/**
 * npm's Windows .cmd shims just forward to an .exe or a node script. Launch that
 * target directly so arguments (prompts, file paths) never pass through cmd.exe.
 */
export function launcherFor(bin: string): Launcher {
  if (!isWin || !/\.(cmd|bat)$/i.test(bin)) return { command: bin, prefixArgs: [], shell: false };
  try {
    const shim = fs.readFileSync(bin, 'utf8');
    // npm shims may mention an optional node.exe before the actual CLI target.
    // Inspect every candidate; a missing optional node must not force cmd.exe.
    for (const m of shim.matchAll(/"%dp0%\\([^"]+?\.(exe|js|cjs|mjs))"/gi)) {
      const target = path.join(path.dirname(bin), m[1]);
      if (/^node\.exe$/i.test(m[1])) continue;
      if (fs.existsSync(target)) {
        return m[2].toLowerCase() === 'exe'
          ? { command: target, prefixArgs: [], shell: false }
          : { command: 'node', prefixArgs: [target], shell: false };
      }
    }
  } catch { /* fall back to the shell */ }
  return { command: `"${bin}"`, prefixArgs: [], shell: true };
}

/**
 * When Ally itself is launched from inside a Claude Code session, that session's
 * env vars (host auth, messaging socket, base URL) leak into the child and make
 * the CLI fail auth. Drop them so the child uses the user's own login.
 */
export function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // A launch from Codex must not impersonate the host or attach tools to its chat.
  for (const key of ['CODEX_INTERNAL_ORIGINATOR_OVERRIDE', 'CODEX_THREAD_ID', 'CODEX_SESSION_ID', 'CODEX_TOOL_CALL_ID', 'CODEX_APP_TOOLS_PIPE_PATH']) delete env[key];
  const fromClaudeHost = !!env.CLAUDE_CODE_ENTRYPOINT || !!env.CLAUDECODE;
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_') || key.startsWith('CLAUDE_AGENT_SDK') ||
        key === 'CLAUDE_PID' || key === 'CLAUDE_EFFORT' || key.startsWith('CLAUDE_PREVIEW')) {
      delete env[key];
    }
  }
  if (fromClaudeHost) delete env.ANTHROPIC_BASE_URL;
  return env;
}
